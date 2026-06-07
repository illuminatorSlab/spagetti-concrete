/**
 * FrameAssembler - Assembles captured frames into a vertical screenshot strip.
 *
 * Logic (subtitle-first, scene-second):
 *   For each frame after the first:
 *     1. Check whether the subtitle area changed from the last *added* reference.
 *        - If subtitle changed (new text appeared/disappeared/altered) → the
 *          frame contains new information worth capturing.
 *     2. If subtitle changed:
 *        - Compare the full frame against the previous frame (scene-level).
 *        - If the scene is similar → append only the subtitle area.
 *        - If the scene is different → append the full frame (scene change).
 *        - Update the reference subtitle area to the current frame's.
 *     3. If subtitle unchanged:
 *        - Compare the full frame against the previous frame (scene-level).
 *        - If the scene is different → append full frame (visual change even
 *          though subtitle didn't change).
 *        - If the scene is similar → skip (nothing new — dedup).
 */
class FrameAssembler {
  /**
   * @param {Object} options
   * @param {number} options.similarityThreshold - Scene similarity (0-1), default 0.8
   * @param {number} options.subtitleAreaRatio - Bottom portion (0-1), default 0.22
   */
  constructor(options = {}) {
    this.similarityThreshold = options.similarityThreshold || 0.8;
    this.subtitleAreaRatio = options.subtitleAreaRatio || 0.22;
    this.differ = new FrameDiffer();
  }

  assemble(frames) {
    if (!frames || frames.length === 0) {
      throw new Error('No frames to assemble');
    }

    const segments = [];
    const first = frames[0];
    segments.push({ ...first, isSubtitleOnly: false });

    // Reference from the last *added* segment — never updated on skip
    let refSubArea = this._cropSubtitleArea(first);
    let refProfile = this._buildRowProfile(refSubArea);
    let refHasText = this._profileHasText(refProfile);

    let previousFrame = first;

    for (let i = 1; i < frames.length; i++) {
      const curr = frames[i];
      const currSub = this._cropSubtitleArea(curr);
      const currProfile = this._buildRowProfile(currSub);
      const currHasText = this._profileHasText(currProfile);

      // ── Step 1: Did the subtitle change? ────────────
      let subtitleChanged = false;
      if (currHasText !== refHasText) {
        // Text appeared or disappeared
        subtitleChanged = true;
      } else if (currHasText && refHasText) {
        // Both have text — compare profiles
        subtitleChanged = this._profileChanged(refProfile, currProfile);
      }
      // If neither has text → subtitle unchanged (false)

      if (subtitleChanged) {
        // ── Step 2a: New info → check scene for full vs sub-only
        const { similar: sceneSame } = this.differ.areSimilar(
          previousFrame.imageData,
          curr.imageData,
          this.similarityThreshold
        );

        if (sceneSame) {
          // Same scene, only subtitle changed → sub-only segment
          if (currHasText) {
            segments.push(this._makeSubSegment(curr, currSub));
          }
          // If text disappeared (currHasText = false), don't add empty sub area
        } else {
          // Scene changed → full frame
          segments.push({ ...curr, isSubtitleOnly: false });
        }

        // Update reference to this frame (regardless of scene)
        refSubArea = currSub;
        refProfile = currProfile;
        refHasText = currHasText;
      } else {
        // ── Step 2b: Subtitle unchanged — check scene-only change
        const { similar: sceneSame } = this.differ.areSimilar(
          previousFrame.imageData,
          curr.imageData,
          this.similarityThreshold
        );

        if (!sceneSame) {
          // Scene changed without subtitle change → full frame
          segments.push({ ...curr, isSubtitleOnly: false });
          refSubArea = currSub;
          refProfile = currProfile;
          refHasText = currHasText;
        }
        // Both unchanged → skip (dedup)
      }

      previousFrame = curr;
    }

    return segments;
  }

  assembleToDataUrl(frames) {
    const segments = this.assemble(frames);
    return ImageUtils.mergeVertical(segments);
  }

  // ── Helpers ──────────────────────────────────────────────

  _cropSubtitleArea(frame) {
    const h = Math.floor(frame.height * this.subtitleAreaRatio);
    const y = frame.height - h;
    return ImageUtils.cropImageData(frame.imageData, 0, y, frame.width, h);
  }

  _makeSubSegment(frame, subImageData) {
    return {
      imageData: subImageData,
      width: frame.width,
      height: subImageData.height,
      time: frame.time,
      isSubtitleOnly: true
    };
  }

  // ── Row-luminance profile ───────────────────────────────

  _buildRowProfile(imageData) {
    const w = imageData.width;
    const h = imageData.height;
    const d = imageData.data;
    const profile = new Float64Array(h);

    for (let y = 0; y < h; y++) {
      let sum = 0;
      let count = 0;
      const rowBase = y * w * 4;
      for (let x = 0; x < w; x += 4) {
        const idx = rowBase + x * 4;
        sum += 0.299 * d[idx] + 0.587 * d[idx + 1] + 0.114 * d[idx + 2];
        count++;
      }
      profile[y] = count > 0 ? sum / count : 0;
    }

    return profile;
  }

  // ── Profile heuristics ──────────────────────────────────

  /**
   * Does the subtitle area contain visible text?
   * Peak-to-peak spread of the row-luminance profile.
   * Text rows are much brighter/darker than background rows.
   * Spread > 25 → text; plain background usually has spread < 12.
   */
  _profileHasText(profile) {
    if (profile.length === 0) return false;

    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < profile.length; i++) {
      if (profile[i] < min) min = profile[i];
      if (profile[i] > max) max = profile[i];
    }

    return (max - min) > 25;
  }

  /**
   * Has the subtitle text changed between two row-luminance profiles?
   *
   * Dual-gate on the row-absolute-difference:
   *   - maxDiff >= 12  → a single row's luminance spiked (short text change)
   *   - meanDiff >= 3.0 → the average row diff is elevated (long text change)
   *
   * Same text:    maxDiff ≈ 4-10,  meanDiff ≈ 1-2  (compression noise only)
   * Text changed:  maxDiff ≈ 15-50, meanDiff ≈ 3-8  (text rows deviate)
   */
  _profileChanged(prof1, prof2) {
    const n = Math.min(prof1.length, prof2.length);
    if (n === 0) return false;

    let sumDiff = 0;
    let maxDiff = 0;

    for (let i = 0; i < n; i++) {
      const diff = Math.abs(prof1[i] - prof2[i]);
      sumDiff += diff;
      if (diff > maxDiff) maxDiff = diff;
    }

    const meanDiff = sumDiff / n;
    return maxDiff >= 12 || meanDiff >= 3.0;
  }
}

if (typeof window !== 'undefined') {
  window.FrameAssembler = FrameAssembler;
}
