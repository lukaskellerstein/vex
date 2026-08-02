chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "captureTab") {
    chrome.tabs
      .captureVisibleTab(sender.tab!.windowId, { format: "png" })
      .then((dataUrl) => sendResponse({ dataUrl }))
      .catch((err) => sendResponse({ error: err.message || "Cannot capture this page" }));
    return true;
  }

  if (message.action === "openScreenshot") {
    const base64 = message.base64 as string;
    const key = "_vex_screenshot_" + Date.now();
    chrome.storage.local.set({ [key]: base64 }, () => {
      // Open a new tab that will read from storage and display the image
      chrome.tabs.create({
        url: chrome.runtime.getURL("screenshot-viewer.html") + "?key=" + encodeURIComponent(key),
      });
    });
    sendResponse({ ok: true });
    return true;
  }
});
