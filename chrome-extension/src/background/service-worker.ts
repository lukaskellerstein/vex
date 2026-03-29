chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "captureTab") {
    chrome.tabs
      .captureVisibleTab(sender.tab!.windowId, { format: "png" })
      .then((dataUrl) => sendResponse({ dataUrl }))
      .catch((err) =>
        sendResponse({ error: err.message || "Cannot capture this page" }),
      );
    return true;
  }
});

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { action: "ping" });
  } catch {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["src/content/index.js"],
      });
    } catch (err) {
      console.error(
        "Cannot inject content script:",
        (err as Error).message,
      );
    }
  }
});
