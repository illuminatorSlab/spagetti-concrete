/**
 * Content Script - Injected into video pages.
 *
 * Handles:
 *   - Site support check & video info queries
 *   - Frame capture & assembly (startCapture runs asynchronously)
 *
 * Stores the result image in chrome.storage.local and broadcasts
 * completion/error events for the popup and background to pick up.
 */
(function () {
  'use strict';

  const registry = SiteAdapterRegistry.createDefault();
  const adapter = registry.getAdapter(window.location.href);

  if (!adapter) {
    console.warn('[VideoSubtitleCapture] No adapter registered for:', window.location.href);
  }

  let captureInProgress = false;

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    handleMessage(message).then(sendResponse).catch(err => {
      sendResponse({ error: err.message || 'Unknown error' });
    });
    return true;
  });

  async function handleMessage(message) {
    switch (message.action) {
      case 'checkSupport':
        return checkSupport();

      case 'getCurrentTime':
        return getCurrentTime();

      case 'getVideoInfo':
        return getVideoInfo();

      case 'startCapture':
        return initiateCapture(message.params);

      default:
        return { error: 'Unknown action: ' + message.action };
    }
  }

  function checkSupport() {
    if (!adapter) return { supported: false };
    const video = adapter.findVideoElement();
    return { supported: !!video, siteName: adapter.getSiteName() };
  }

  function getCurrentTime() {
    if (!adapter) return { error: 'Site not supported' };
    const video = adapter.findVideoElement();
    if (!video) return { error: 'Video element not found' };
    return {
      currentTime: adapter.getCurrentTime(video),
      duration: adapter.getDuration(video),
      paused: video.paused
    };
  }

  function getVideoInfo() {
    if (!adapter) return { error: 'Site not supported' };
    const video = adapter.findVideoElement();
    if (!video) return { error: 'Video element not found' };
    return {
      currentTime: adapter.getCurrentTime(video),
      duration: adapter.getDuration(video),
      paused: video.paused,
      width: video.videoWidth,
      height: video.videoHeight,
      siteName: adapter.getSiteName()
    };
  }

  /**
   * Validate parameters and kick off async capture.
   * Returns immediately with validation result; actual capture continues in background.
   */
  function initiateCapture(params) {
    const {
      startTime,
      endTime,
      frameInterval = 500,
      similarityThreshold = 0.8
    } = params;

    if (startTime === undefined || endTime === undefined) {
      return { error: 'Missing startTime or endTime' };
    }
    if (startTime >= endTime) {
      return { error: 'Start time must be before end time' };
    }
    if (captureInProgress) {
      return { error: 'A capture is already in progress' };
    }

    if (!adapter) return { error: 'Site not supported' };

    const video = adapter.findVideoElement();
    if (!video) return { error: 'Video element not found' };

    // Validation passed — start async capture
    captureInProgress = true;
    doCapture(params).finally(() => {
      captureInProgress = false;
    });

    return { started: true };
  }

  async function doCapture(params) {
    const {
      startTime,
      endTime,
      frameInterval = 500,
      similarityThreshold = 0.8
    } = params;

    const captureEngine = new CaptureEngine({
      frameInterval,
      onProgress: (current, total) => {
        chrome.runtime.sendMessage({
          action: 'captureProgress',
          current,
          total
        }).catch(() => {});
      }
    });

    let frames;
    try {
      frames = await captureEngine.captureFrames(adapter, startTime, endTime);
    } catch (err) {
      broadcast({ action: 'captureError', error: 'Capture failed: ' + err.message });
      return;
    }

    if (!frames || frames.length === 0) {
      broadcast({ action: 'captureError', error: 'No frames captured' });
      return;
    }

    const assembler = new FrameAssembler({
      similarityThreshold,
      subtitleAreaRatio: adapter.getSubtitleAreaRatio()
    });

    const segments = assembler.assemble(frames);

    // Build a lookup map: time → full-frame ImageData
    const frameByTime = new Map();
    for (const f of frames) {
      frameByTime.set(f.time, f);
    }

    // Build unique frame list (deduplicate frames referenced by segments)
    // and a segment list referencing frame indices.
    const uniqueFrames = [];
    const frameIdxByTime = new Map();
    const segmentItems = [];

    for (const seg of segments) {
      let idx = frameIdxByTime.get(seg.time);
      if (idx === undefined) {
        const fullFrame = frameByTime.get(seg.time);
        if (!fullFrame) continue;
        const jpgUrl = ImageUtils.imageDataToDataUrl(
          fullFrame.imageData, fullFrame.width, fullFrame.height
        );
        idx = uniqueFrames.length;
        uniqueFrames.push({
          dataUrl: jpgUrl,
          width: fullFrame.width,
          height: fullFrame.height,
          time: fullFrame.time
        });
        frameIdxByTime.set(seg.time, idx);
      }
      segmentItems.push({
        frameIdx: idx,
        isSubOnly: seg.isSubtitleOnly
      });
    }

    const filename = 'screenshot-' +
      pad2(Math.floor(startTime / 60)) + pad2(Math.floor(startTime % 60)) +
      '-' +
      pad2(Math.floor(endTime / 60)) + pad2(Math.floor(endTime % 60)) +
      '.jpg';

    try {
      await chrome.storage.local.set({
        viewerFrames: uniqueFrames,
        viewerSegments: segmentItems,
        viewerFilename: filename,
        viewerSubRatio: assembler.subtitleAreaRatio
      });
    } catch (err) {
      broadcast({ action: 'captureError', error: 'Failed to store image: ' + err.message });
      return;
    }

    broadcast({ action: 'captureComplete' });
  }

  function broadcast(message) {
    chrome.runtime.sendMessage(message).catch(() => {});
  }

  function pad2(n) {
    return String(Math.max(0, n)).padStart(2, '0');
  }
})();
