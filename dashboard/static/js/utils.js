"use strict";

// ── Formatting helpers ───────────────────────────────────────
function fmt(n) {
  const sign = n >= 0 ? "+" : "-";
  return sign + "₹" + Math.abs(n).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function fmtPct(n) {
  const sign = n >= 0 ? "+" : "-";
  return sign + Math.abs(n).toFixed(2) + "%";
}

function colorClass(n) {
  return n >= 0 ? "green" : "red";
}

function fmtDate(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

// Parse "May-2026" → {year:2026, month:5}
function parseMonthKey(key) {
  const [abbr, y] = key.split("-");
  const year = parseInt(y);
  const month = new Date(`${abbr} 1, ${year}`).getMonth() + 1;
  return { year, month };
}

function fmtMonthLabel(key) {
  return key; // "May-2026" is already display-ready
}

function daysToExpiry(expiryDateStr) {
  if (!expiryDateStr) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const exp = new Date(expiryDateStr + "T00:00:00");
  exp.setHours(0, 0, 0, 0);
  const diff = Math.round((exp - today) / (1000 * 60 * 60 * 24));
  return diff;
}

// ── Render helpers ────────────────────────────────────────────
function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") e.className = v;
    else if (k === "style") e.style.cssText = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2).toLowerCase(), v);
    else e.setAttribute(k, v);
  }
  for (const c of children) {
    if (c == null) continue;
    e.append(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return e;
}

function html(str) {
  const d = document.createElement("div");
  d.innerHTML = str;
  return d;
}

// ── Strategy label helpers ───────────────────────────────────
// Returns "Bear Call Spread · Curvature" from {spread_type, name}
function _buildStratTagText(strat) {
  if (!strat) return "";
  return strat.spread_type || strat.name || "";
}

// Returns a DOM span.strat-name-tag element
function _buildStratTag(strat) {
  const text = _buildStratTagText(strat);
  return text ? el("span", { class: "strat-name-tag" }, text) : null;
}
