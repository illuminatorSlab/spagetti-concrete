/**
 * BilibiliSiteAdapter - Site-specific adapter for bilibili.com
 *
 * Bilibili video player selectors (subject to change):
 *   - Main video element: video tag inside .bpx-player-video-wrap or #bilibili-player
 *   - Subtitle area: bottom 25% of frame (mostly). CC subtitles may be HTML overlays.
 *   - Danmaku: rendered as canvas/div overlays, not captured by video drawImage.
 */
class BilibiliSiteAdapter extends BaseSiteAdapter {
  getSiteName() {
    return 'bilibili';
  }

  findVideoElement() {
    // Try bilibili-specific selectors first, then generic fallbacks
    const selectors = [
      '.bpx-player-video-wrap video',
      '#bilibili-player video',
      '.bilibili-player-video video',
      '.player-container video',
      'video'
    ];

    for (const selector of selectors) {
      const video = document.querySelector(selector);
      if (video && video.tagName === 'VIDEO' && video.readyState >= 1 && video.duration > 0) {
        return video;
      }
    }

    // Fallback: largest playable video element
    let bestVideo = null;
    let bestArea = 0;
    const videos = document.querySelectorAll('video');
    for (const video of videos) {
      if (video.readyState >= 1 && video.duration > 0) {
        const area = (video.videoWidth || video.clientWidth) * (video.videoHeight || video.clientHeight);
        if (area > bestArea) {
          bestArea = area;
          bestVideo = video;
        }
      }
    }
    return bestVideo;
  }

  getSubtitleAreaRatio() {
    return 0.22;
  }

  getOverlayElements() {
    // Bilibili CC subtitle overlay elements
    const overlays = [];
    const subtitleOverlay = document.querySelector(
      '.bpx-player-subtitle, .bpx-player-subtitle-panel, .subtitle-container'
    );
    if (subtitleOverlay) {
      overlays.push(subtitleOverlay);
    }
    return overlays;
  }

  waitForRender() {
    // Bilibili may need extra time for overlays to render after seek
    return new Promise(resolve => setTimeout(resolve, 200));
  }
}

if (typeof window !== 'undefined') {
  window.BilibiliSiteAdapter = BilibiliSiteAdapter;
}
