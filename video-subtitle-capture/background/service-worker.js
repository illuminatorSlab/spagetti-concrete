/**
 * Background Service Worker
 *
 * Minimal coordinator. Listens for completion events from the content script
 * and opens the viewer tab. This handles cases where the popup has been closed.
 */

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'captureComplete') {
    openViewerTab();
    sendResponse({ ok: true });
    return false;
  }

  return false;
});

async function openViewerTab() {
  const viewerUrl = chrome.runtime.getURL('viewer/viewer.html');
  await chrome.tabs.create({ url: viewerUrl });
}
