/**
 * Popup - User interface for Video Subtitle Capture.
 *
 * Communicates directly with the content script for capture commands.
 * Listens for progress/completion events broadcast by the content script.
 * Persists form state to chrome.storage.local so values survive popup close/reopen.
 */
(function () {
  'use strict';

  const STORAGE_KEY = 'vsync_settings';

  // DOM elements
  const siteBadge = document.getElementById('siteBadge');
  const errorMsg = document.getElementById('errorMsg');
  const startTimeInput = document.getElementById('startTime');
  const endTimeInput = document.getElementById('endTime');
  const btnGrabStart = document.getElementById('btnGrabStart');
  const btnGrabEnd = document.getElementById('btnGrabEnd');
  const currentTimeInfo = document.getElementById('currentTimeInfo');
  const frameIntervalInput = document.getElementById('frameInterval');
  const similarityThresholdInput = document.getElementById('similarityThreshold');
  const btnGenerate = document.getElementById('btnGenerate');
  const progressWrap = document.getElementById('progressWrap');
  const progressFill = document.getElementById('progressFill');
  const progressText = document.getElementById('progressText');

  let currentTabId = null;

  init();

  async function init() {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabs || tabs.length === 0) return;
    currentTabId = tabs[0].id;

    try {
      const res = await sendToContent({ action: 'checkSupport' });
      if (res && res.supported) {
        siteBadge.textContent = res.siteName;
      } else {
        showError('This site is not supported. Open a bilibili.com video page.');
        btnGenerate.disabled = true;
        return;
      }
    } catch (e) {
      showError('Cannot connect. Make sure you are on a supported video page.');
      btnGenerate.disabled = true;
      return;
    }

    loadSettings();
    refreshCurrentTime();

    // Event listeners
    btnGrabStart.addEventListener('click', () => grabCurrentTime('start'));
    btnGrabEnd.addEventListener('click', () => grabCurrentTime('end'));
    btnGenerate.addEventListener('click', onGenerate);

    // Persist on input change (type, paste, etc.)
    startTimeInput.addEventListener('input', saveSettings);
    endTimeInput.addEventListener('input', saveSettings);
    frameIntervalInput.addEventListener('input', saveSettings);
    similarityThresholdInput.addEventListener('input', saveSettings);
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === 'captureProgress') {
      updateProgress(message.current, message.total);
    }
    if (message.action === 'captureComplete') {
      window.close();
    }
    if (message.action === 'captureError') {
      showError(message.error);
      resetUI();
    }
  });

  // ── Persistence ──────────────────────────────────────────

  function loadSettings() {
    chrome.storage.local.get(STORAGE_KEY, (data) => {
      const s = data[STORAGE_KEY] || {};
      if (s.startTime) startTimeInput.value = s.startTime;
      if (s.endTime) endTimeInput.value = s.endTime;
      if (s.frameInterval) frameIntervalInput.value = s.frameInterval;
      if (s.similarityThreshold) similarityThresholdInput.value = s.similarityThreshold;
    });
  }

  function saveSettings() {
    chrome.storage.local.set({
      [STORAGE_KEY]: {
        startTime: startTimeInput.value,
        endTime: endTimeInput.value,
        frameInterval: frameIntervalInput.value,
        similarityThreshold: similarityThresholdInput.value
      }
    });
  }

  // ── Messaging ────────────────────────────────────────────

  async function sendToContent(message) {
    return chrome.tabs.sendMessage(currentTabId, message);
  }

  async function refreshCurrentTime() {
    try {
      const res = await sendToContent({ action: 'getCurrentTime' });
      if (res && res.currentTime !== undefined) {
        currentTimeInfo.textContent =
          'Current: ' + formatTime(res.currentTime) +
          ' / ' + formatTime(res.duration);
      }
    } catch (e) {
      currentTimeInfo.textContent = 'Current: --';
    }
  }

  async function grabCurrentTime(field) {
    try {
      const res = await sendToContent({ action: 'getCurrentTime' });
      if (res && res.currentTime !== undefined) {
        const formatted = formatTime(res.currentTime);
        if (field === 'start') {
          startTimeInput.value = formatted;
        } else {
          endTimeInput.value = formatted;
        }
        saveSettings();
        refreshCurrentTime();
      }
    } catch (e) {
      showError('Failed to get current time.');
    }
  }

  async function onGenerate() {
    hideError();
    const startStr = startTimeInput.value.trim();
    const endStr = endTimeInput.value.trim();

    if (!startStr || !endStr) {
      showError('Please enter both start and end times.');
      return;
    }

    const startTime = parseTime(startStr);
    const endTime = parseTime(endStr);

    if (startTime === null || endTime === null) {
      showError('Invalid time format. Use "mm:ss" or seconds.');
      return;
    }

    if (startTime >= endTime) {
      showError('Start time must be before end time.');
      return;
    }

    const frameInterval = parseInt(frameIntervalInput.value) || 500;
    const similarityThreshold = (parseInt(similarityThresholdInput.value) || 80) / 100;

    btnGenerate.disabled = true;
    btnGenerate.textContent = 'Capturing...';
    progressWrap.style.display = '';
    updateProgress(0, 1);

    try {
      const result = await sendToContent({
        action: 'startCapture',
        params: { startTime, endTime, frameInterval, similarityThreshold }
      });

      if (result && result.error) {
        showError(result.error);
        resetUI();
      }
    } catch (e) {
      showError('Failed to connect: ' + (e.message || 'Unknown error'));
      resetUI();
    }
  }

  function updateProgress(current, total) {
    const pct = total > 0 ? Math.round((current / total) * 100) : 0;
    progressFill.style.width = pct + '%';
    progressText.textContent = current + ' / ' + total + ' frames';
  }

  function resetUI() {
    btnGenerate.disabled = false;
    btnGenerate.textContent = 'Generate';
    progressWrap.style.display = 'none';
  }

  function showError(msg) {
    errorMsg.textContent = msg;
    errorMsg.style.display = '';
  }

  function hideError() {
    errorMsg.style.display = 'none';
  }

  function formatTime(seconds) {
    if (seconds === undefined || seconds === null || isNaN(seconds)) return '0:00';
    const s = Math.floor(seconds);
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return mins + ':' + secs.toString().padStart(2, '0');
  }

  function parseTime(str) {
    str = str.trim();
    if (str === '') return null;
    if (/^\d+(\.\d+)?$/.test(str)) {
      return parseFloat(str);
    }
    const match = str.match(/^(?:(\d+):)?(\d+):(\d+(?:\.\d+)?)$/);
    if (match) {
      const hours = parseInt(match[1] || '0');
      const minutes = parseInt(match[2]);
      const seconds = parseFloat(match[3]);
      return hours * 3600 + minutes * 60 + seconds;
    }
    return null;
  }
})();
