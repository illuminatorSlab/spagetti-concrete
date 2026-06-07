/**
 * CaptureEngine - Captures video frames at specified intervals.
 *
 * Uses the site adapter to interact with the video element. Seeks through
 * the video at the given interval and captures each frame to ImageData.
 */
class CaptureEngine {
  /**
   * @param {Object} options
   * @param {number} options.frameInterval - Interval between captures in ms (default: 500)
   * @param {Function} options.onProgress - Callback(current, total) for progress reporting
   * @param {Function} options.onError - Callback(error) for error reporting
   */
  constructor(options = {}) {
    this.frameInterval = options.frameInterval || 500;
    this.onProgress = options.onProgress || (() => {});
    this.onError = options.onError || (() => {});
  }

  /**
   * Capture frames from the given time range.
   *
   * @param {BaseSiteAdapter} adapter - Site-specific adapter
   * @param {number} startTime - Start time in seconds
   * @param {number} endTime - End time in seconds
   * @returns {Promise<Array<{imageData: ImageData, width: number, height: number, time: number}>>}
   */
  async captureFrames(adapter, startTime, endTime) {
    const video = adapter.findVideoElement();
    if (!video) {
      throw new Error('Video element not found on this page');
    }

    if (video.videoWidth === 0 || video.videoHeight === 0) {
      throw new Error('Video has no pixel dimensions. Ensure the video is loaded.');
    }

    const duration = adapter.getDuration(video);
    const actualStart = Math.max(0, startTime);
    const actualEnd = Math.min(endTime, duration);

    if (actualStart >= actualEnd) {
      throw new Error('Invalid time range: start must be before end');
    }

    // Save current playback state
    const state = adapter.saveState(video);
    video.pause();

    try {
      // Build list of time points
      const intervalSec = this.frameInterval / 1000;
      const timePoints = [];
      for (let t = actualStart; t <= actualEnd + 0.001; t += intervalSec) {
        timePoints.push(Math.min(t, actualEnd));
      }

      const frames = [];
      const total = timePoints.length;

      this.onProgress(0, total);

      for (let i = 0; i < timePoints.length; i++) {
        const time = timePoints[i];

        // Seek to time point
        await adapter.seekTo(video, time);
        await adapter.waitForRender();

        // Capture current frame
        const captured = ImageUtils.captureVideoFrame(video);
        frames.push({
          imageData: captured.imageData,
          width: captured.width,
          height: captured.height,
          time
        });

        this.onProgress(i + 1, total);
      }

      return frames;
    } finally {
      // Restore video state (best effort)
      await adapter.restoreState(video, state).catch(() => {});
    }
  }
}

if (typeof window !== 'undefined') {
  window.CaptureEngine = CaptureEngine;
}
