/**
 * Viewer — Segment-based preview editor.
 *
 * Loads individual frames + segment metadata from chrome.storage.local.
 * Each segment is shown as a card with toggle (Full/Sub) and delete controls.
 * Save / Copy triggers on-demand merge of the adjusted segments.
 */
(function () {
  'use strict';

  // ── State ──────────────────────────────────────────────
  let viewerFrames = [];
  let viewerSegments = [];
  let subRatio = 0.22;
  let outFormat = 'jpeg';
  let filename = 'screenshot.png';

  // ── DOM ─────────────────────────────────────────────────
  const segmentList = document.getElementById('segmentList');
  const btnSave = document.getElementById('btnSave');
  const btnCopy = document.getElementById('btnCopy');
  const outFormatSel = document.getElementById('outFormat');
  const infoSegments = document.getElementById('infoSegments');

  // ── Init ─────────────────────────────────────────────────
  init();

  async function init() {
    try {
      const stored = await chrome.storage.local.get([
        'viewerFrames', 'viewerSegments', 'viewerFilename',
        'viewerSubRatio', 'viewerFormat'
      ]);

      // Backward compat: old single-image storage
      if (!stored.viewerFrames && stored.viewerImage) {
        segmentList.innerHTML =
          '<div class="empty-state">Legacy data detected. Please re-generate the screenshot.</div>';
        return;
      }

      if (!stored.viewerFrames || !stored.viewerSegments) {
        segmentList.innerHTML =
          '<div class="empty-state">No screenshot data found. Generate one from the extension popup first.</div>';
        return;
      }

      viewerFrames = stored.viewerFrames;
      viewerSegments = stored.viewerSegments;
      subRatio = stored.viewerSubRatio || 0.22;
      outFormat = stored.viewerFormat || 'jpeg';
      filename = stored.viewerFilename || 'screenshot.png';

      outFormatSel.value = outFormat;
      document.title = filename;

      await chrome.storage.local.remove([
        'viewerFrames', 'viewerSegments', 'viewerFilename',
        'viewerSubRatio', 'viewerFormat'
      ]);

      render();
    } catch (err) {
      segmentList.innerHTML =
        '<div class="empty-state">Failed to load: ' + err.message + '</div>';
    }

    outFormatSel.addEventListener('change', () => {
      outFormat = outFormatSel.value;
    });

    btnSave.addEventListener('click', onSave);
    btnCopy.addEventListener('click', onCopy);
  }

  // ── Rendering ───────────────────────────────────────────

  function render() {
    segmentList.innerHTML = '';
    const active = viewerSegments.filter(s => !s.deleted);

    if (active.length === 0) {
      segmentList.innerHTML =
        '<div class="empty-state">All segments deleted.</div>';
      infoSegments.textContent = '';
      return;
    }

    infoSegments.textContent = active.length + ' segments';

    for (let i = 0; i < viewerSegments.length; i++) {
      const seg = viewerSegments[i];
      if (seg.deleted) continue;
      segmentList.appendChild(buildCard(seg, i));
    }
  }

  function buildCard(seg, idx) {
    const frame = viewerFrames[seg.frameIdx];
    if (!frame) return document.createElement('div');

    const card = document.createElement('div');
    card.className = 'segment-card';

    // Canvas at full resolution, CSS scales to container width
    const canvas = document.createElement('canvas');
    canvas.width = frame.width;
    canvas.height = seg.isSubOnly
      ? Math.floor(frame.height * subRatio)
      : frame.height;

    card.appendChild(canvas);

    // Draw after image loads
    const img = new Image();
    img.onload = () => {
      const ctx = canvas.getContext('2d');
      if (seg.isSubOnly) {
        const subH = Math.floor(frame.height * subRatio);
        const subY = frame.height - subH;
        ctx.drawImage(img, 0, subY, frame.width, subH, 0, 0, canvas.width, canvas.height);
      } else {
        ctx.drawImage(img, 0, 0);
      }
    };
    img.src = frame.dataUrl;

    // Controls
    const ctrls = document.createElement('div');
    ctrls.className = 'controls';

    const toggleBtn = document.createElement('button');
    toggleBtn.textContent = seg.isSubOnly ? 'Expand' : 'Crop';
    toggleBtn.title = seg.isSubOnly ? 'Show full frame' : 'Show subtitle area only';
    toggleBtn.className = seg.isSubOnly ? '' : 'active';
    toggleBtn.addEventListener('click', () => toggleSegment(idx));

    const delBtn = document.createElement('button');
    delBtn.className = 'danger';
    delBtn.textContent = 'Delete';
    delBtn.addEventListener('click', () => deleteSegment(idx));

    const timeLbl = document.createElement('span');
    timeLbl.className = 'time-label';
    timeLbl.textContent = formatTime(frame.time);

    ctrls.appendChild(toggleBtn);
    ctrls.appendChild(delBtn);
    ctrls.appendChild(timeLbl);
    card.appendChild(ctrls);

    return card;
  }

  // ── Actions ─────────────────────────────────────────────

  function toggleSegment(idx) {
    viewerSegments[idx].isSubOnly = !viewerSegments[idx].isSubOnly;
    render();
  }

  function deleteSegment(idx) {
    viewerSegments[idx].deleted = true;
    render();
  }

  // ── Merge ───────────────────────────────────────────────

  async function buildMergedCanvas() {
    const active = viewerSegments.filter(s => !s.deleted);
    if (active.length === 0) throw new Error('No segments to merge');

    const firstFrame = viewerFrames[active[0].frameIdx];
    const width = firstFrame.width;

    let totalH = 0;
    for (const seg of active) {
      const frame = viewerFrames[seg.frameIdx];
      totalH += seg.isSubOnly
        ? Math.floor(frame.height * subRatio)
        : frame.height;
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = totalH;
    const ctx = canvas.getContext('2d');

    if (outFormat === 'jpeg') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, totalH);
    }

    let yOff = 0;
    for (const seg of active) {
      const frame = viewerFrames[seg.frameIdx];
      const img = await loadImage(frame.dataUrl);

      if (seg.isSubOnly) {
        const subH = Math.floor(frame.height * subRatio);
        const subY = frame.height - subH;
        ctx.drawImage(img, 0, subY, frame.width, subH, 0, yOff, width, subH);
        yOff += subH;
      } else {
        ctx.drawImage(img, 0, 0, frame.width, frame.height, 0, yOff, width, frame.height);
        yOff += frame.height;
      }
    }

    return canvas;
  }

  async function onSave() {
    try {
      btnSave.textContent = 'Saving...';
      btnSave.disabled = true;
      const canvas = await buildMergedCanvas();
      const mime = outFormat === 'jpeg' ? 'image/jpeg' : 'image/png';
      const dataUrl = canvas.toDataURL(mime, 0.92);

      const ext = outFormat === 'jpeg' ? '.jpg' : '.png';
      const dlName = filename.replace(/\.\w+$/, '') + ext;
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = dlName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      toast('Saved: ' + dlName);
    } catch (err) {
      toast('Error: ' + err.message);
    } finally {
      btnSave.textContent = 'Save';
      btnSave.disabled = false;
    }
  }

  async function onCopy() {
    try {
      btnCopy.textContent = 'Copying...';
      btnCopy.disabled = true;
      const canvas = await buildMergedCanvas();

      const blob = await new Promise(resolve =>
        canvas.toBlob(resolve, 'image/png')
      );
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blob })
      ]);
      toast('Copied!');
    } catch (err) {
      toast('Copy failed: ' + err.message);
    } finally {
      btnCopy.textContent = 'Copy';
      btnCopy.disabled = false;
    }
  }

  // ── Helpers ─────────────────────────────────────────────

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = src;
    });
  }

  function formatTime(sec) {
    if (sec == null || isNaN(sec)) return '--:--';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return m + ':' + String(s).padStart(2, '0');
  }

  function toast(msg) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    document.body.appendChild(el);
    el.style.opacity = '0';
    requestAnimationFrame(() => { el.style.opacity = '1'; });
    setTimeout(() => {
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 300);
    }, 1800);
  }
})();
