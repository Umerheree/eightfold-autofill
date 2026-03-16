/**
 * Zapply — Eightfold AI Autofill (PTC Careers)
 * content.js — v7
 *
 * Key findings from live DOM inspection:
 * - Dropdown options: <button role="option" class="menuItem-module_menu-item-button__-RdU7">
 * - Options are HIDDEN until trigger is clicked (offsetParent === null when closed)
 * - Trigger inputs have placeholder="Select" with ids like "input-25", "input-28"
 * - Disability name input id: "c2qpwlg" (random React id)
 * - Start date input id: "Position_Specific_Questions_Question_Setup_1"
 * - findSectionByLabel was failing because it required role="option" to already be visible
 */

"use strict";

// Guard against double-injection (Chrome sometimes runs content scripts twice)
if (window.__ZAPPLY_LOADED__) {
  console.log("[Zapply] Already loaded, skipping.");
} else {
  window.__ZAPPLY_LOADED__ = true;

const ZAPPLY_DATA = {
  resumeUrl:   "https://example.com/resume.pdf",
  firstName:   "John",
  lastName:    "Doe",
  email:       "john.doe@example.com",
  phoneNumber: "5551234567",

  source: "LinkedIn",

  disabilityName:   "John Michael Doe",
  disabilityDate:   "01/08/2025",
  disabilityStatus: "No, I Don't Have A Disability",

  veteranStatus: "I am not a protected veteran",
  relocation:    "Yes",

  coverLetterUrl: "https://example.com/resume.pdf",

  addressLine1: "123 Main Street",
  addressLine2: "",
  city:         "San Francisco",
  state:        "California",
  postalCode:   "94101",
  country:      "United States of America",

  salary:           "150000",
  remotePreference: "Hybrid",

  startDate:          "",
  authorizedToWork:   "Yes",
  requireSponsorship: "No",
};

// ─────────────────────────────────────────────────────────────────────────────
// UTILITIES
// ─────────────────────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function waitFor(fn, timeout = 6000) {
  return new Promise((resolve) => {
    if (fn()) { resolve(true); return; }
    const iv = setInterval(() => {
      if (fn()) { clearInterval(iv); clearTimeout(t); resolve(true); }
    }, 100);
    const t = setTimeout(() => { clearInterval(iv); resolve(false); }, timeout);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// REACT-AWARE SETTER
// ─────────────────────────────────────────────────────────────────────────────
const _nativeInputSetter = Object.getOwnPropertyDescriptor(
  HTMLInputElement.prototype, "value"
)?.set;
const _nativeTextareaSetter = Object.getOwnPropertyDescriptor(
  HTMLTextAreaElement.prototype, "value"
)?.set;

function reactSet(el, value) {
  // Focus first so React marks the field as "touched"
  el.focus();

  // Clear existing value
  if (el instanceof HTMLTextAreaElement && _nativeTextareaSetter) {
    _nativeTextareaSetter.call(el, "");
  } else if (_nativeInputSetter) {
    _nativeInputSetter.call(el, "");
  }
  el.dispatchEvent(new Event("input", { bubbles: true }));

  // Set new value via native setter (bypasses React's property override)
  if (el instanceof HTMLTextAreaElement && _nativeTextareaSetter) {
    _nativeTextareaSetter.call(el, value);
  } else if (_nativeInputSetter) {
    _nativeInputSetter.call(el, value);
  } else {
    el.value = value;
  }

  // InputEvent (not plain Event) — React 16+ uses this for onChange
  el.dispatchEvent(new InputEvent("input", { bubbles: true, data: value }));
  el.dispatchEvent(new Event("change", { bubbles: true }));

  // Blur to trigger validation clearing
  el.dispatchEvent(new FocusEvent("blur", { bubbles: true }));
  el.blur();
}

// ─────────────────────────────────────────────────────────────────────────────
// FILE UPLOAD
// ─────────────────────────────────────────────────────────────────────────────
async function uploadFileFromUrl(input, url, filename) {
  try {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const blob = await resp.blob();
    const file = new File([blob], filename, { type: blob.type || "application/pdf" });
    const dt   = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    input.dispatchEvent(new Event("input",  { bubbles: true }));
    return true;
  } catch (err) {
    console.warn(`[Zapply] File fetch failed (${url}):`, err.message);
    showToast(`⚠ Could not auto-attach ${filename} — upload manually`);
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DROPDOWN HANDLER
//
// Eightfold dropdowns:
//   - Trigger: an <input placeholder="Select"> or nearby button
//   - Options: <button role="option"> — hidden (display:none or visibility)
//              until trigger is clicked
//
// Strategy:
//   1. Find the section containing the label text (no longer requires
//      role="option" to be present — just label text match)
//   2. Find the trigger input (placeholder="Select") or button inside it
//   3. Click to open
//   4. Wait for role="option" buttons to become visible
//   5. Click the matching option
// ─────────────────────────────────────────────────────────────────────────────

function findSectionByLabel(labelText) {
  const lc = labelText.toLowerCase();

  // Collect all containers, sorted smallest first (most specific)
  const all = Array.from(document.querySelectorAll("div, section, fieldset, form"));
  // Sort: elements that don't contain others come first
  const sorted = all.sort((a, b) => {
    if (a.contains(b)) return 1;
    if (b.contains(a)) return -1;
    return 0;
  });

  for (const el of sorted) {
    const text = el.textContent?.toLowerCase() || "";
    if (!text.includes(lc)) continue;
    if (el.children.length > 80) continue; // skip page-level wrappers

    // Must contain a trigger (placeholder="Select" input or button)
    const hasTrigger =
      el.querySelector('input[placeholder="Select"]') ||
      el.querySelector('[aria-haspopup]') ||
      el.querySelector('[aria-expanded]') ||
      el.querySelector('button:not([type="submit"])');

    if (hasTrigger) return el;
  }
  return null;
}

function findTrigger(section) {
  // Most reliable: input with placeholder "Select"
  const selectInput = section.querySelector('input[placeholder="Select"]');
  if (selectInput) return selectInput;

  // aria-haspopup
  const ariaBtn = section.querySelector('[aria-haspopup], [aria-expanded]');
  if (ariaBtn) return ariaBtn;

  // Any non-submit button
  const btn = section.querySelector('button:not([type="submit"]):not([type="reset"])');
  if (btn) return btn;

  return null;
}

async function pickOption(labelText, optionText) {
  const optionLc = optionText.toLowerCase();

  // Native <select> fallback
  for (const sel of document.querySelectorAll("select")) {
    const cont = sel.closest("div,section,fieldset") || document.body;
    if (!cont.textContent.toLowerCase().includes(labelText.toLowerCase())) continue;
    for (const opt of sel.options) {
      if (!opt.value || opt.disabled) continue;
      if (opt.text.toLowerCase().includes(optionLc) || optionLc.includes(opt.text.toLowerCase().trim())) {
        sel.value = opt.value;
        sel.dispatchEvent(new Event("change", { bubbles: true }));
        console.log(`[Zapply] Native select "${labelText}" → "${opt.text}"`);
        return true;
      }
    }
  }

  // Find section
  const section = findSectionByLabel(labelText);
  if (!section) {
    console.warn(`[Zapply] Section not found: "${labelText}"`);
    return false;
  }

  // Find and click trigger
  const trigger = findTrigger(section);
  if (!trigger) {
    console.warn(`[Zapply] Trigger not found for: "${labelText}"`);
    return false;
  }

  // Click to open the dropdown
  trigger.focus();
  trigger.click();
  trigger.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
  await sleep(150);

  // Wait for role="option" buttons to become visible anywhere on the page
  // (they may render outside the section in a portal/overlay)
  const appeared = await waitFor(() => {
    return Array.from(document.querySelectorAll('[role="option"]'))
      .some(o => o.offsetParent !== null || o.style.display !== "none");
  }, 3000);

  if (!appeared) {
    console.warn(`[Zapply] Options did not appear for: "${labelText}"`);
    return false;
  }

  // Get all visible options from anywhere on the page
  const visibleOpts = Array.from(document.querySelectorAll('[role="option"]'))
    .filter(o => o.offsetParent !== null || getComputedStyle(o).display !== "none");

  // Exact match first (prevents "United States" matching "United States Minor Outlying Islands")
  let match = visibleOpts.find(o => o.textContent.trim().toLowerCase() === optionLc);
  // Then: option text starts with our search term (e.g. "United States" at start)
  if (!match) match = visibleOpts.find(o => o.textContent.trim().toLowerCase().startsWith(optionLc));
  // Then: our search term starts with option text (for shortened searches)
  if (!match) match = visibleOpts.find(o => optionLc.startsWith(o.textContent.trim().toLowerCase()) && o.textContent.trim().length > 4);
  // Last resort: contains match
  if (!match) match = visibleOpts.find(o => o.textContent.trim().toLowerCase().includes(optionLc));

  if (!match) {
    console.warn(`[Zapply] No match for "${optionText}". Available:`,
      visibleOpts.map(o => o.textContent.trim()));
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    return false;
  }

  match.click();
  console.log(`[Zapply] Picked "${labelText}" → "${match.textContent.trim()}"`);
  await sleep(300);
  return true;
}

// Exact-match version of pickOption — only clicks if text matches exactly
// Used for Country to prevent "United States" matching longer variants
async function pickOptionExact(labelText, optionText) {
  const optionLc = optionText.toLowerCase().trim();

  const section = findSectionByLabel(labelText);
  if (!section) { console.warn(`[Zapply] Section not found: "${labelText}"`); return false; }

  const trigger = findTrigger(section);
  if (!trigger) { console.warn(`[Zapply] Trigger not found: "${labelText}"`); return false; }

  trigger.focus();
  trigger.click();
  trigger.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
  await sleep(150);

  const appeared = await waitFor(() =>
    Array.from(document.querySelectorAll('[role="option"]')).some(o => o.offsetParent !== null), 3000);
  if (!appeared) { console.warn(`[Zapply] Options not visible for: "${labelText}"`); return false; }

  const visibleOpts = Array.from(document.querySelectorAll('[role="option"]'))
    .filter(o => o.offsetParent !== null);

  // EXACT match only
  let match = visibleOpts.find(o => o.textContent.trim().toLowerCase() === optionLc);

  if (!match) {
    // Log what's available so we can debug
    console.warn(`[Zapply] No exact match for "${optionText}". Available:`,
      visibleOpts.map(o => o.textContent.trim()).slice(0, 10));
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    return false;
  }

  match.click();
  console.log(`[Zapply] Exact pick "${labelText}" → "${match.textContent.trim()}"`);
  await sleep(300);
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// TEXT INPUT FILLER
// ─────────────────────────────────────────────────────────────────────────────
function findInputByLabel(labelText) {
  const lc = labelText.toLowerCase();

  // Standard <label>
  for (const label of document.querySelectorAll("label")) {
    if (!label.textContent.toLowerCase().includes(lc)) continue;
    if (label.htmlFor) {
      const el = document.getElementById(label.htmlFor);
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) return el;
    }
    const el = label.querySelector("input, textarea");
    if (el) return el;
  }

  // aria-label / aria-labelledby
  for (const el of document.querySelectorAll("input, textarea")) {
    const al = (el.getAttribute("aria-label") || "").toLowerCase();
    if (al.includes(lc)) return el;
    const lblId = el.getAttribute("aria-labelledby");
    if (lblId && document.getElementById(lblId)?.textContent.toLowerCase().includes(lc)) return el;
  }

  // Placeholder
  const ph = document.querySelector(`input[placeholder*="${labelText}" i], textarea[placeholder*="${labelText}" i]`);
  if (ph) return ph;

  // Proximity: find text node then look for nearby input
  for (const el of document.querySelectorAll("div, span, p, legend")) {
    if (el.children.length > 8) continue;
    const txt = el.textContent.trim().toLowerCase();
    if (!txt.includes(lc) || txt.length > 100) continue;

    const inner = el.querySelector("input:not([placeholder='Select']), textarea");
    if (inner) return inner;

    let sib = el.nextElementSibling;
    for (let i = 0; i < 4 && sib; i++) {
      const found = (sib.tagName === "INPUT" || sib.tagName === "TEXTAREA")
        ? sib : sib.querySelector("input:not([placeholder='Select']), textarea");
      if (found) return found;
      sib = sib.nextElementSibling;
    }

    const parentSib = el.parentElement?.nextElementSibling;
    if (parentSib) {
      const found = parentSib.querySelector("input:not([placeholder='Select']), textarea");
      if (found) return found;
    }
  }
  return null;
}

function fillText(labelText, value) {
  const el = findInputByLabel(labelText);
  if (!el) { console.warn(`[Zapply] Input not found: "${labelText}"`); return false; }
  reactSet(el, String(value));
  // Explicit focus/blur cycle to satisfy React validation
  el.focus();
  el.blur();
  console.log(`[Zapply] Text "${labelText}" → "${value}"`);
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// DATE FILLER
// ─────────────────────────────────────────────────────────────────────────────
async function fillDate(labelText, value) {
  const el = findInputByLabel(labelText);
  if (!el) { console.warn(`[Zapply] Date input not found: "${labelText}"`); return false; }

  if (el.type === "date") {
    const parts = value.split("/");
    const iso = parts.length === 3
      ? `${parts[2]}-${parts[0].padStart(2,"0")}-${parts[1].padStart(2,"0")}`
      : value;
    reactSet(el, iso);
  } else {
    el.focus();
    el.click();
    await sleep(100);
    reactSet(el, value);
    el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  }
  el.blur();
  console.log(`[Zapply] Date "${labelText}" → "${value}"`);
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// TOAST
// ─────────────────────────────────────────────────────────────────────────────
function showToast(msg) {
  let t = document.getElementById("zapply-toast");
  if (!t) {
    t = document.createElement("div");
    t.id = "zapply-toast";
    Object.assign(t.style, {
      position:"fixed", bottom:"24px", right:"24px",
      background:"#4F46E5", color:"#fff", padding:"12px 20px",
      borderRadius:"10px", fontSize:"13px", fontFamily:"system-ui,sans-serif",
      boxShadow:"0 4px 20px rgba(0,0,0,0.25)", zIndex:"999999",
      maxWidth:"340px", lineHeight:"1.5",
    });
    document.body.appendChild(t);
  }
  t.textContent = msg;
  console.log("[Zapply]", msg);
}

// ─────────────────────────────────────────────────────────────────────────────
// DEBUG
// ─────────────────────────────────────────────────────────────────────────────
window.zapplyDebug = function () {
  console.group("[Zapply Debug] All inputs:");
  document.querySelectorAll("input, textarea").forEach((el, i) => {
    const rect = el.getBoundingClientRect();
    if (rect.top >= 0)
      console.log(i, el.tagName, el.type, `id="${el.id}"`, `name="${el.name}"`,
        `placeholder="${el.placeholder}"`, `aria-label="${el.getAttribute("aria-label")}"`,
        `value="${el.value}"`);
  });
  console.groupEnd();
  console.group("[Zapply Debug] role=option buttons:");
  document.querySelectorAll('[role="option"]').forEach((el, i) => {
    console.log(i, `visible:${el.offsetParent !== null}`, el.textContent.trim());
  });
  console.groupEnd();
};

// ─────────────────────────────────────────────────────────────────────────────
// SECTION FILLERS
// ─────────────────────────────────────────────────────────────────────────────

async function fillResume() {
  showToast("Zapply — Resume…");
  const inputs = Array.from(document.querySelectorAll('input[type="file"]'));
  if (inputs[0] && !inputs[0].files?.length) {
    await uploadFileFromUrl(inputs[0], ZAPPLY_DATA.resumeUrl, "resume.pdf");
  }
}

async function fillContact() {
  showToast("Zapply — Contact info…");
  fillText("First Name",  ZAPPLY_DATA.firstName);
  fillText("Last Name",   ZAPPLY_DATA.lastName);
  fillText("Email",       ZAPPLY_DATA.email);
  fillText("Phone",       ZAPPLY_DATA.phoneNumber);
}

async function fillSource() {
  showToast("Zapply — Source…");
  await pickOption("How did you learn", ZAPPLY_DATA.source);
}

async function fillDisability() {
  showToast("Zapply — Disability form…");

  // The Name field has a randomly generated React id (e.g. "c2qpwlg").
  // Standard reactSet fights React's defaultValue — simulate real typing instead.
  const nameEl = findInputByLabel("Name:");
  if (nameEl) {
    nameEl.focus();
    await sleep(100);
    // Select all existing text and delete it
    nameEl.dispatchEvent(new KeyboardEvent("keydown", { key: "a", ctrlKey: true, bubbles: true }));
    await sleep(50);
    nameEl.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete", bubbles: true }));
    // Set value via native setter
    if (_nativeInputSetter) _nativeInputSetter.call(nameEl, ZAPPLY_DATA.disabilityName);
    // Fire InputEvent — React uses this for onChange
    nameEl.dispatchEvent(new InputEvent("input", {
      bubbles: true,
      cancelable: true,
      inputType: "insertText",
      data: ZAPPLY_DATA.disabilityName,
    }));
    nameEl.dispatchEvent(new Event("change", { bubbles: true }));
    await sleep(100);
    nameEl.dispatchEvent(new FocusEvent("blur", { bubbles: true }));
    nameEl.blur();
    console.log(`[Zapply] Name field typed: "${ZAPPLY_DATA.disabilityName}"`);
  } else {
    console.warn("[Zapply] Disability Name field not found");
  }

  await sleep(200);
  await fillDate("Date:", ZAPPLY_DATA.disabilityDate);
  await sleep(300);
  await pickOption("Disability Status", ZAPPLY_DATA.disabilityStatus);
}

async function fillVeteran() {
  showToast("Zapply — Veteran status…");
  // Try multiple unique substrings from the VEVRAA section
  const tried = await pickOption("outreach and positive recruitment", ZAPPLY_DATA.veteranStatus) ||
    await pickOption("VEVRAA", ZAPPLY_DATA.veteranStatus) ||
    await pickOption("Vietnam Era Veteran", ZAPPLY_DATA.veteranStatus) ||
    await pickOption("protected veteran", ZAPPLY_DATA.veteranStatus);
  if (!tried) console.warn("[Zapply] Veteran dropdown not filled");
}

async function fillRelocation() {
  showToast("Zapply — Relocation…");
  await pickOption("open to relocation", ZAPPLY_DATA.relocation) ||
  await pickOption("Relocation", ZAPPLY_DATA.relocation);
}

async function fillCoverLetter() {
  showToast("Zapply — Cover letter…");
  const inputs = Array.from(document.querySelectorAll('input[type="file"]'));
  if (inputs.length > 1) {
    await uploadFileFromUrl(inputs[1], ZAPPLY_DATA.coverLetterUrl, "cover-letter.pdf");
  }
}

async function fillAddress() {
  showToast("Zapply — Address…");
  fillText("Address Line 1", ZAPPLY_DATA.addressLine1);
  if (ZAPPLY_DATA.addressLine2) fillText("Address Line 2", ZAPPLY_DATA.addressLine2);
  fillText("City",           ZAPPLY_DATA.city);
  fillText("State",          ZAPPLY_DATA.state);
  fillText("Postal Code",    ZAPPLY_DATA.postalCode);
  await sleep(200);
  // Pass exact=true for country to prevent "United States Minor Outlying Islands" matching
  await pickOptionExact("Country", ZAPPLY_DATA.country);
}

async function fillApplicationQuestions() {
  showToast("Zapply — Application questions…");

  // Target salary by its confirmed DOM id: Application_questions_us_annual_salary
  const salaryEl = document.getElementById("Application_questions_us_annual_salary")
                || findInputByLabel("annual salary");
  if (salaryEl) {
    salaryEl.focus();
    await sleep(80);
    // Clear then set via native setter
    if (_nativeInputSetter) _nativeInputSetter.call(salaryEl, "");
    salaryEl.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "deleteContentBackward" }));
    if (_nativeInputSetter) _nativeInputSetter.call(salaryEl, ZAPPLY_DATA.salary);
    salaryEl.dispatchEvent(new InputEvent("input", {
      bubbles: true,
      cancelable: true,
      inputType: "insertText",
      data: ZAPPLY_DATA.salary,
    }));
    salaryEl.dispatchEvent(new Event("change", { bubbles: true }));
    await sleep(80);
    salaryEl.dispatchEvent(new FocusEvent("blur", { bubbles: true }));
    salaryEl.blur();
    console.log(`[Zapply] Salary filled: "${ZAPPLY_DATA.salary}"`);
  } else {
    console.warn("[Zapply] Salary field not found");
  }

  await sleep(200);
  await pickOption("on-site, hybrid", ZAPPLY_DATA.remotePreference) ||
  await pickOption("prefer to work",  ZAPPLY_DATA.remotePreference);
}

async function fillPositionQuestions() {
  showToast("Zapply — Position questions…");
  if (ZAPPLY_DATA.startDate) {
    await fillDate("start date", ZAPPLY_DATA.startDate);
    await sleep(200);
  }
  await pickOption("legally permitted", ZAPPLY_DATA.authorizedToWork) ||
  await pickOption("authorized to work", ZAPPLY_DATA.authorizedToWork);
  await sleep(300);
  await pickOption("sponsorship", ZAPPLY_DATA.requireSponsorship) ||
  await pickOption("require sponsorship", ZAPPLY_DATA.requireSponsorship);
}

// ─────────────────────────────────────────────────────────────────────────────
// ORCHESTRATOR
// ─────────────────────────────────────────────────────────────────────────────
let zapplyRunning = false;

async function runAutofill() {
  if (zapplyRunning) return;
  zapplyRunning = true;
  showToast("Zapply — Starting…");

  const found = await waitFor(
    () => !!document.querySelector("form, [class*='apply'], [class*='application']"),
    10000
  );
  if (!found) {
    showToast("⚠ Form not found.");
    zapplyRunning = false;
    return;
  }

  await sleep(1000);

  await fillResume();               await sleep(400);
  await fillContact();              await sleep(400);
  await fillSource();               await sleep(600);
  await fillDisability();           await sleep(600);
  await fillVeteran();              await sleep(600);
  await fillRelocation();           await sleep(600);
  await fillCoverLetter();          await sleep(400);
  await fillAddress();              await sleep(600);
  await fillApplicationQuestions(); await sleep(600);
  await fillPositionQuestions();

  showToast("Zapply — Done! Review before submitting ✓");
  zapplyRunning = false;
}

// ─────────────────────────────────────────────────────────────────────────────
// MESSAGE LISTENER
// ─────────────────────────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.action === "START_AUTOFILL") {
    runAutofill().then(() => sendResponse({ status: "done" }));
    return true;
  }
  if (msg.action === "PING") sendResponse({ status: "ready" });
});

console.log("[Zapply] v7 ready —", window.location.href);

} // end guard block
