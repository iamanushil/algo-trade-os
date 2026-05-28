"use strict";

// ── API helpers ──────────────────────────────────────────────
async function apiFetch(path) {
  const res = await fetch(API + path);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${path}`);
  return res.json();
}

// ── Live NIFTY polling ──────────────────────────────────────

function _isMarketOpen() {
  const ist = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const day = ist.getDay(); // 0=Sun, 6=Sat
  if (day === 0 || day === 6) return false;
  const mins = ist.getHours() * 60 + ist.getMinutes();
  return mins >= 9 * 60 + 15 && mins <= 15 * 60 + 30;
}

let _niftyPollTimer = null;

async function fetchNiftySpot() {
  try {
    const data = await apiFetch("/api/nifty/spot");
    if (data.spot != null) {
      state.liveNifty = data;
      _onNiftyUpdate(data);
    }
  } catch (_) { /* silently skip — header shows last known */ }
}

function _onNiftyUpdate(d) {
  // ── Header ticker ──────────────────────────────────────
  const priceEl  = document.getElementById("header-nifty-price");
  const changeEl = document.getElementById("header-nifty-change");
  if (priceEl) {
    priceEl.textContent = "₹" + d.spot.toLocaleString("en-IN", {
      minimumFractionDigits: 2, maximumFractionDigits: 2,
    });
    priceEl.className = "header-nifty-price " + (d.change >= 0 ? "up" : "down");
  }
  if (changeEl) {
    const sign = d.change >= 0 ? "▲" : "▼";
    const abs  = Math.abs(d.change).toLocaleString("en-IN", {
      minimumFractionDigits: 2, maximumFractionDigits: 2,
    });
    changeEl.textContent = `${sign}${abs} (${Math.abs(d.change_pct).toFixed(2)}%)`;
    changeEl.className = "header-nifty-change " + (d.change >= 0 ? "up" : "down");
  }

  // ── Signal market bar spot ─────────────────────────────
  const sigSpot = document.getElementById("live-signal-spot");
  if (sigSpot) {
    sigSpot.textContent = "₹" + d.spot.toLocaleString("en-IN", {
      minimumFractionDigits: 2, maximumFractionDigits: 2,
    }) + (d.change_pct != null
      ? ` (${d.change_pct >= 0 ? "+" : ""}${d.change_pct.toFixed(2)}%)`
      : "");
    sigSpot.className = "signal-market-value " + (d.change >= 0 ? "bullish" : "bearish");
  }

  // ── Active position live bar ───────────────────────────
  _updateActivePosLiveBar(d.spot);

  // ── Move payoff chart spot lines ───────────────────────
  ["active-payoff-chart", "signal-payoff-chart"].forEach(id => {
    const ch = _chartStore[id];
    if (ch) { ch._spot = d.spot; ch.draw(); }
  });
}

function _updateActivePosLiveBar(spot) {
  const bar = document.getElementById("active-pos-live-bar");
  if (!bar || !state.openPositions.length) return;

  const shorts = state.openPositions.filter(
    p => p.spread_role === "SHORT_LEG" || p.spread_role === "SHORT_LEG_ADJ"
  );
  const longs = state.openPositions.filter(
    p => p.spread_role === "LONG_LEG" || p.spread_role === "LONG_LEG_ADJ"
  );
  if (!shorts.length || !longs.length) return;

  const shortStrike = shorts[0].strike;
  const longStrike  = longs[0].strike;
  const nc          = shorts[0].entry_price - longs[0].entry_price;
  const qty         = Math.abs(shorts[0].qty);
  const spread      = longStrike - shortStrike;
  const breakeven   = shortStrike + nc;
  const fmt2        = n => n.toLocaleString("en-IN", { maximumFractionDigits: 0 });

  // Theoretical P&L at expiry if NIFTY stays exactly here
  let theoreticalPnl;
  if (spot <= shortStrike)     theoreticalPnl = nc * qty;
  else if (spot <= longStrike) theoreticalPnl = (nc - (spot - shortStrike)) * qty;
  else                         theoreticalPnl = (nc - spread) * qty;
  const tIsProfit = theoreticalPnl >= 0;
  const tPnlStr = (tIsProfit ? "+₹" : "−₹") +
    Math.abs(theoreticalPnl).toLocaleString("en-IN", { maximumFractionDigits: 0 });

  let statusCls, statusLabel, distText;
  if (spot < shortStrike - 50) {
    statusCls = "safe"; statusLabel = "SAFE";
    distText = `${fmt2(shortStrike - spot)} pts below short strike`;
  } else if (spot < shortStrike) {
    statusCls = "watch"; statusLabel = "WATCH";
    distText = `${fmt2(shortStrike - spot)} pts to short strike`;
  } else if (spot < breakeven) {
    statusCls = "caution"; statusLabel = "CAUTION";
    distText = `${fmt2(breakeven - spot)} pts to breakeven`;
  } else {
    statusCls = "danger"; statusLabel = "DANGER";
    distText = `${fmt2(spot - breakeven)} pts past breakeven`;
  }

  const spotStr = "₹" + spot.toLocaleString("en-IN", {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });
  bar.innerHTML = `
    <span class="live-bar-label">NIFTY LIVE</span>
    <span class="live-bar-spot">${spotStr}</span>
    <span class="live-bar-sep"></span>
    <span class="live-bar-dist">${distText}</span>
    <span class="live-bar-status ${statusCls}">${statusLabel}</span>
    <span class="live-bar-sep"></span>
    <span class="live-bar-pnl-label">If held to expiry</span>
    <span class="live-bar-pnl-val ${tIsProfit ? "green" : "red"}">${tPnlStr}</span>
  `;
}

function startNiftyPolling() {
  fetchNiftySpot(); // immediate first fetch
  function schedule() {
    const delay = _isMarketOpen() ? 20_000 : 120_000;
    _niftyPollTimer = setTimeout(async () => {
      await fetchNiftySpot();
      schedule();
    }, delay);
  }
  schedule();
}
