/**
 * BaseSiteAdapter - Abstract base class defining the interface for site-specific video interactions.
 * Each supported video site should extend this class and implement site-specific logic.
 */
class BaseSiteAdapter {
  /**
   * @returns {string} Human-readable name of the site
   */
  getSiteName() {
    throw new Error('getSiteName() must be implemented');
  }

  /**
   * Find and return the main video element on the page.
   * @returns {HTMLVideoElement|null}
   */
  findVideoElement() {
    throw new Error('findVideoElement() must be implemented');
  }

  /**
   * Get the current playback time in seconds.
   * @param {HTMLVideoElement} video
   * @returns {number}
   */
  getCurrentTime(video) {
    return video.currentTime;
  }

  /**
   * Get the video duration in seconds.
   * @param {HTMLVideoElement} video
   * @returns {number}
   */
  getDuration(video) {
    return video.duration;
  }

  /**
   * Get the ratio of the subtitle area relative to the full frame height.
   * e.g., 0.25 means the bottom 25% of the frame is considered the subtitle area.
   * @returns {number} Ratio between 0 and 1
   */
  getSubtitleAreaRatio() {
    return 0.25;
  }

  /**
   * Seek the video to a specific time and return a promise that resolves when ready.
   * @param {HTMLVideoElement} video
   * @param {number} timeSeconds
   * @returns {Promise<void>}
   */
  seekTo(video, timeSeconds) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        video.removeEventListener('seeked', handler);
        reject(new Error('Seek timeout'));
      }, 10000);

      const handler = () => {
        clearTimeout(timeout);
        resolve();
      };

      video.addEventListener('seeked', handler, { once: true });
      video.currentTime = Math.max(0, Math.min(timeSeconds, this.getDuration(video)));
    });
  }

  /**
   * Wait for a frame to render after seeking.
   * Some sites may need extra delay for overlays/subtitles to render.
   * @returns {Promise<void>}
   */
  waitForRender() {
    return new Promise(resolve => setTimeout(resolve, 150));
  }

  /**
   * Get additional overlay elements to capture along with the video frame.
   * (e.g., soft subtitle DOM overlays that canvas.drawImage won't capture)
   * @returns {HTMLElement[]}
   */
  getOverlayElements() {
    return [];
  }

  /**
   * Get the video player container element for cropping `captureVisibleTab`.
   * Returns the bounding rect of the video playback area.
   * @returns {{ x: number, y: number, width: number, height: number }|null}
   */
  getPlayerBounds() {
    const video = this.findVideoElement();
    if (!video) return null;
    const rect = video.getBoundingClientRect();
    return {
      x: rect.left + window.scrollX,
      y: rect.top + window.scrollY,
      width: rect.width,
      height: rect.height
    };
  }

  /**
   * Pause the video and store current state for later restoration.
   * @param {HTMLVideoElement} video
   * @returns {{ wasPaused: boolean, time: number }}
   */
  saveState(video) {
    return {
      wasPaused: video.paused,
      time: video.currentTime
    };
  }

  /**
   * Restore the video to its previous state.
   * @param {HTMLVideoElement} video
   * @param {{ wasPaused: boolean, time: number }} state
   */
  async restoreState(video, state) {
    try {
      await this.seekTo(video, state.time);
      if (!state.wasPaused) {
        video.play();
      }
    } catch (e) {
      // Best-effort restore
    }
  }
}

if (typeof window !== 'undefined') {
  window.BaseSiteAdapter = BaseSiteAdapter;
}
