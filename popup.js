/**
 * Zapply - popup.js
 * Handles the extension popup UI logic.
 */

const fillBtn    = document.getElementById("fillBtn");
const statusText = document.getElementById("status-text");
const dot        = document.getElementById("dot");

function setStatus(msg, state = "idle") {
  statusText.textContent = msg;
  dot.className = "status-dot";
  if (state === "ready") dot.classList.add("ready");
  if (state === "busy")  dot.classList.add("busy");
  if (state === "error") dot.classList.add("error");
}

// Check if the current tab is an Eightfold AI page
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  const tab = tabs[0];
  if (!tab) { setStatus("No active tab.", "error"); return; }

  const url = tab.url || "";
  const isEightfold = url.includes("eightfold.ai");

  if (isEightfold) {
    setStatus("Eightfold AI page detected — ready!", "ready");
    fillBtn.disabled = false;
  } else {
    setStatus("Navigate to an Eightfold AI job application first.", "error");
    fillBtn.disabled = true;
  }
});

fillBtn.addEventListener("click", () => {
  fillBtn.disabled = true;
  setStatus("Autofill running…", "busy");

  chrome.runtime.sendMessage({ action: "TRIGGER_AUTOFILL" }, (response) => {
    const err = chrome.runtime.lastError;
    if (err || (response && response.error)) {
      setStatus("Error: " + (err?.message || response?.error), "error");
      fillBtn.disabled = false;
    } else {
      setStatus("Autofill complete! 🎉", "ready");
    }
  });
});
