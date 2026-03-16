/**
 * Zapply - Eightfold AI Autofill Extension
 * background.js — service worker (Manifest V3)
 */

chrome.runtime.onInstalled.addListener(() => {
  console.log("[Zapply] Extension installed.");
});

/**
 * Relay messages from the popup to the active tab's content script.
 */
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.action === "TRIGGER_AUTOFILL") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (!tab) {
        sendResponse({ error: "No active tab found." });
        return;
      }

      // First ensure content script is injected (handles cases where
      // the user navigated before the content script ran)
      chrome.scripting.executeScript(
        {
          target: { tabId: tab.id },
          files: ["content.js"],
        },
        () => {
          // Ignore "already injected" errors
          const err = chrome.runtime.lastError;
          if (err) console.warn("[Zapply BG]", err.message);

          // Send autofill command to content script
          chrome.tabs.sendMessage(tab.id, { action: "START_AUTOFILL" }, (resp) => {
            const lastErr = chrome.runtime.lastError;
            if (lastErr) {
              console.error("[Zapply BG] Message error:", lastErr.message);
              sendResponse({ error: lastErr.message });
            } else {
              sendResponse(resp || { status: "sent" });
            }
          });
        }
      );
    });
    return true; // keep channel open for async
  }
});
