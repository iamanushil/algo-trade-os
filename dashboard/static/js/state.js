"use strict";

// ── Config ──────────────────────────────────────────────────
const API = "";

// ── App state ───────────────────────────────────────────────
let state = {
  strategies: [],
  activeStrategyId: null,
  summary: null,
  sessions: [],          // [{date, pnl, pct, month, has_legs}]
  openPositions: [],     // [{expiry_date, strike, option_type, qty, entry_price, spread_role, open_date}]
  months: [],            // sorted month keys "YYYY-MM"
  selectedMonth: null,
  selectedDate: null,
  trades: [],            // [{expiry, strike, option_type, qty, entry_price, exit_price, leg_pnl, spread_role}]
  loadingTrades: false,
  signalData: null,
  liveNifty: null,          // { spot, change, change_pct, prev_close, stale? }
  liveVix: null,            // India VIX value (for B-S pricing)
  activePosMtmParams: null, // { shortStrike, longStrike, expiry, shortEntry, longEntry, qty }
};
