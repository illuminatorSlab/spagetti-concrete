/**
 * ImageUtils - Canvas-based image manipulation utilities.
 * All operations work with ImageData, HTMLCanvasElement, or data URLs.
 */
class ImageUtils {
  /**
   * Create a canvas with the given dimensions.
   */
  static createCanvas(width, height) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }

  /**
   * Draw an ImageData onto a canvas context at the given position.
   */
  static drawImageData(ctx, imageData, x, y) {
    const tempCanvas = ImageUtils.createCanvas(imageData.width, imageData.height);
    tempCanvas.getContext('2d').putImageData(imageData, 0, 0);
    ctx.drawImage(tempCanvas, x, y);
  }

  /**
   * Extract a rectangular region from an ImageData.
   */
  static cropImageData(imageData, x, y, width, height) {
    const cropped = new ImageData(width, height);
    for (let row = 0; row < height; row++) {
      for (let col = 0; col < width; col++) {
        const srcIdx = ((y + row) * imageData.width + (x + col)) * 4;
        const dstIdx = (row * width + col) * 4;
        cropped.data[dstIdx] = imageData.data[srcIdx];
        cropped.data[dstIdx + 1] = imageData.data[srcIdx + 1];
        cropped.data[dstIdx + 2] = imageData.data[srcIdx + 2];
        cropped.data[dstIdx + 3] = imageData.data[srcIdx + 3];
      }
    }
    return cropped;
  }

  /**
   * Resize an ImageData to new dimensions using nearest-neighbor sampling.
   * For quality, use canvas drawImage instead (see resizeImageDataCanvas).
   */
  static resizeImageData(imageData, newWidth, newHeight) {
    const canvas = ImageUtils.createCanvas(imageData.width, imageData.height);
    const ctx = canvas.getContext('2d');
    ctx.putImageData(imageData, 0, 0);

    const resizedCanvas = ImageUtils.createCanvas(newWidth, newHeight);
    const resizedCtx = resizedCanvas.getContext('2d');
    resizedCtx.drawImage(canvas, 0, 0, imageData.width, imageData.height, 0, 0, newWidth, newHeight);

    return resizedCtx.getImageData(0, 0, newWidth, newHeight);
  }

  /**
   * Convert a data URL to ImageData.
   */
  static dataUrlToImageData(dataUrl) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = ImageUtils.createCanvas(img.width, img.height);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        resolve(ctx.getImageData(0, 0, img.width, img.height));
      };
      img.onerror = reject;
      img.src = dataUrl;
    });
  }

  /**
   * Convert an ImageData to a JPEG data URL (for compact storage).
   */
  static imageDataToDataUrl(imageData, width, height) {
    const canvas = ImageUtils.createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    ctx.putImageData(imageData, 0, 0);
    return canvas.toDataURL('image/jpeg', 0.85);
  }

  /**
   * Capture a video element's current frame to ImageData.
   */
  static captureVideoFrame(video) {
    const width = video.videoWidth || video.clientWidth;
    const height = video.videoHeight || video.clientHeight;

    if (width === 0 || height === 0) {
      throw new Error('Video has no dimensions');
    }

    const canvas = ImageUtils.createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, width, height);

    return {
      imageData: ctx.getImageData(0, 0, width, height),
      width,
      height
    };
  }

  /**
   * Merge an array of ImageData frames vertically into a single data URL.
   * @param {Array<{imageData: ImageData, width: number, height: number}>} segments
   * @param {string} [format='png'] - 'png' or 'jpeg'
   * @param {number} [quality=0.92] - JPEG quality (0-1), ignored for PNG
   * @returns {string} Data URL
   */
  static mergeVertical(segments, format, quality) {
    if (!segments || segments.length === 0) {
      throw new Error('No segments to merge');
    }

    const width = segments[0].width;
    const totalHeight = segments.reduce((sum, seg) => sum + seg.height, 0);

    const canvas = ImageUtils.createCanvas(width, totalHeight);
    const ctx = canvas.getContext('2d');

    // JPEG requires a solid background — fill with white first
    // because the canvas is transparent by default and JPEG can't represent alpha.
    if (format === 'jpeg') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, totalHeight);
    }

    let yOffset = 0;
    for (const seg of segments) {
      ImageUtils.drawImageData(ctx, seg.imageData, 0, yOffset);
      yOffset += seg.height;
    }

    const mime = format === 'jpeg' ? 'image/jpeg' : 'image/png';
    return canvas.toDataURL(mime, quality || 0.92);
  }

  /**
   * Create a canvas from a segment array and return as blob.
   */
  static mergeVerticalToBlob(segments) {
    if (!segments || segments.length === 0) {
      throw new Error('No segments to merge');
    }

    const width = segments[0].width;
    const totalHeight = segments.reduce((sum, seg) => sum + seg.height, 0);

    const canvas = ImageUtils.createCanvas(width, totalHeight);
    const ctx = canvas.getContext('2d');

    let yOffset = 0;
    for (const seg of segments) {
      ImageUtils.drawImageData(ctx, seg.imageData, 0, yOffset);
      yOffset += seg.height;
    }

    return new Promise(resolve => {
      canvas.toBlob(blob => resolve(blob), 'image/png');
    });
  }
}

if (typeof window !== 'undefined') {
  window.ImageUtils = ImageUtils;
}
