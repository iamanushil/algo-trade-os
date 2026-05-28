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

// ── Black-Scholes call price (European) ─────────────────────
function _normCdf(x) {
  // Abramowitz & Stegun 26.2.17 — max error 7.5e-8
  const a = [0.319381530, -0.356563782, 1.781477937, -1.821255978, 1.330274429];
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const pdf = Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
  let poly = 0, tp = t;
  for (let i = 0; i < 5; i++) { poly += a[i] * tp; tp *= t; }
  const cdf = 1 - pdf * poly;
  return x >= 0 ? cdf : 1 - cdf;
}

function _bsCall(S, K, T, r, sigma) {
  if (T <= 0) return Math.max(S - K, 0);
  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;
  return S * _normCdf(d1) - K * Math.exp(-r * T) * _normCdf(d2);
}

// Returns { pnl, shortCurrent, longCurrent } — MTM P&L if closing the spread today
function computeMtmPnl(spot, shortStrike, longStrike, expiryDateStr, vix, shortEntry, longEntry, qty) {
  const r     = 0.065; // India risk-free rate ~6.5%
  const sigma = Math.max((vix || 15), 5) / 100;
  // NSE expiry: market close 15:30 IST
  const expiry = new Date(expiryDateStr + "T15:30:00+05:30");
  const T = Math.max((expiry - new Date()) / (365.25 * 24 * 3600 * 1000), 0);
  const shortCurrent = _bsCall(spot, shortStrike, T, r, sigma);
  const longCurrent  = _bsCall(spot, longStrike,  T, r, sigma);
  // Bear call: you sold short leg, bought long leg
  const pnl = ((shortEntry - shortCurrent) + (longCurrent - longEntry)) * qty;
  return { pnl: Math.round(pnl), shortCurrent: +shortCurrent.toFixed(2), longCurrent: +longCurrent.toFixed(2) };
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
