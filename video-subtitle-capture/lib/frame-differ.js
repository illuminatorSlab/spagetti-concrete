/**
 * FrameDiffer - Compares two frames and determines their similarity.
 *
 * Uses resized thumbnails for performance. The similarity threshold
 * determines whether two frames are considered "similar enough" to
 * only capture the subtitle area.
 */
class FrameDiffer {
  /**
   * @param {Object} options
   * @param {number} options.thumbWidth - Width to resize frames for comparison (default: 160)
   * @param {number} options.thumbHeight - Height to resize frames for comparison (default: 90)
   * @param {number} options.colorTolerance - Max per-channel color diff to count as "same" (default: 30)
   */
  constructor(options = {}) {
    this.thumbWidth = options.thumbWidth || 160;
    this.thumbHeight = options.thumbHeight || 90;
    this.colorTolerance = options.colorTolerance || 30;
  }

  /**
   * Calculate similarity between two frames as a value between 0 and 1.
   * 1.0 = identical, 0.0 = completely different.
   *
   * @param {ImageData} frame1
   * @param {ImageData} frame2
   * @returns {number} Similarity ratio (0-1)
   */
  calculateSimilarity(frame1, frame2) {
    // Resize both frames to thumbnails for performance
    const thumb1 = ImageUtils.resizeImageData(frame1, this.thumbWidth, this.thumbHeight);
    const thumb2 = ImageUtils.resizeImageData(frame2, this.thumbWidth, this.thumbHeight);

    const data1 = thumb1.data;
    const data2 = thumb2.data;
    const pixelCount = data1.length / 4;
    let similarPixels = 0;

    for (let i = 0; i < data1.length; i += 4) {
      const rDiff = Math.abs(data1[i] - data2[i]);
      const gDiff = Math.abs(data1[i + 1] - data2[i + 1]);
      const bDiff = Math.abs(data1[i + 2] - data2[i + 2]);

      if (rDiff < this.colorTolerance && gDiff < this.colorTolerance && bDiff < this.colorTolerance) {
        similarPixels++;
      }
    }

    return similarPixels / pixelCount;
  }

  /**
   * Check if two frames are similar enough (similarity >= threshold).
   * @param {ImageData} frame1
   * @param {ImageData} frame2
   * @param {number} threshold - Similarity threshold (0-1), e.g., 0.8 = 80%
   * @returns {{ similar: boolean, score: number }}
   */
  areSimilar(frame1, frame2, threshold) {
    const score = this.calculateSimilarity(frame1, frame2);
    return {
      similar: score >= threshold,
      score
    };
  }
}

if (typeof window !== 'undefined') {
  window.FrameDiffer = FrameDiffer;
}
