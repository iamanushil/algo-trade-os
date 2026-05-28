"use strict";

// ── Signal ────────────────────────────────────────────────────
let signalRefreshTimer = null;

async function loadSignal(strategyId) {
  const section = document.getElementById("signal-section");
  if (!section) return;

  // Show skeleton while loading
  renderSignalSkeleton(section);

  try {
    const data = await apiFetch(`/api/strategies/${strategyId}/signal`);
    renderSignalData(section, data);
  } catch (err) {
    renderSignalError(section, err.message);
  }
}

function renderSignalSkeleton(section) {
  section.innerHTML = `
    <div class="signal-card">
      <div class="signal-card-header">
        <span class="signal-card-title">Next Signal</span>
        <div class="signal-refresh" style="margin-left:auto;">
          <span class="signal-updated text-muted">Loading…</span>
        </div>
      </div>
      <div class="signal-card-body">
        <div class="signal-top-row">
          <div class="skeleton signal-skeleton-badge"></div>
          <div style="flex:1;padding-top:4px;">
            <div class="skeleton skeleton-line" style="width:85%;"></div>
            <div class="skeleton skeleton-line" style="width:60%;"></div>
          </div>
        </div>
        <div class="skeleton skeleton-line" style="width:100%;height:42px;border-radius:7px;"></div>
        <div class="signal-meta">
          <div class="skeleton skeleton-line" style="height:48px;border-radius:6px;"></div>
          <div class="skeleton skeleton-line" style="height:48px;border-radius:6px;"></div>
          <div class="skeleton skeleton-line" style="height:48px;border-radius:6px;"></div>
          <div class="skeleton skeleton-line" style="height:48px;border-radius:6px;"></div>
          <div class="skeleton skeleton-line" style="height:48px;border-radius:6px;"></div>
        </div>
      </div>
    </div>
  `;
}

function renderSignalData(section, d) {
  const action = d.action || "WAIT";
  const updated = d.updated_at ? (() => {
    const dt = new Date(d.updated_at);
    return dt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true }) + " IST";
  })() : "—";

  const spotChangeStr = d.spot_change_pct != null
    ? (d.spot_change_pct >= 0 ? "+" : "") + d.spot_change_pct.toFixed(2) + "%"
    : "";
  const spotStr = d.spot != null
    ? "₹" + d.spot.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : "—";

  const trendCls = (d.trend || "").toLowerCase();
  const trendDisplay = d.trend || "—";
  const pcrStr = d.pcr != null ? d.pcr.toFixed(2) : "—";
  const maxPainStr = d.max_pain != null ? "₹" + d.max_pain.toLocaleString("en-IN") : "—";
  const entryWindow = d.entry_window || "—";
  const expiryStr = (() => {
    if (!d.expiry) return "—";
    const [y, m, day] = d.expiry.split("-").map(Number);
    const mon = ["","Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return `${day} ${mon[m]} ${y}`;
  })();

  const ss = d.suggested_spread;
  const hasSpread = ss && ss.short_strike && ss.long_strike;
  const fmtR = v => "₹" + Math.abs(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // Build trade ticket HTML
  let tradeTicketHTML = "";
  if (hasSpread) {
    const shortStr  = ss.short_strike.toLocaleString("en-IN");
    const longStr   = ss.long_strike.toLocaleString("en-IN");
    const shortPx   = ss.short_premium != null ? `@ <strong>₹${ss.short_premium.toFixed(2)}</strong>` : "";
    const longPx    = ss.long_premium  != null ? `@ <strong>₹${ss.long_premium.toFixed(2)}</strong>`  : "";
    const lotsStr   = ss.lot_size ? `${ss.lot_size} lots` : "";
    tradeTicketHTML = `
      <div class="signal-section-label">Suggested Spread</div>
      <div class="trade-ticket">
        <div class="trade-ticket-leg">
          <span class="trade-ticket-action sell">SELL</span>
          <span class="trade-ticket-strike">${shortStr} CE</span>
          <span class="trade-ticket-role">Short Leg</span>
          ${shortPx ? `<span class="trade-ticket-price">${shortPx}</span>` : ""}
        </div>
        <div class="trade-ticket-sep"></div>
        <div class="trade-ticket-leg">
          <span class="trade-ticket-action buy">BUY</span>
          <span class="trade-ticket-strike">${longStr} CE</span>
          <span class="trade-ticket-role">Long Leg</span>
          ${longPx ? `<span class="trade-ticket-price">${longPx}</span>` : ""}
        </div>
        ${lotsStr ? `<div class="trade-ticket-qty">${lotsStr}</div>` : ""}
      </div>
    `;
  }

  // Build P&L block HTML
  let pnlBlockHTML = "";
  let unavailNote = "";
  if (hasSpread) {
    const netCreditTotal = ss.net_credit_total ?? (ss.net_credit != null && ss.lot_size ? ss.net_credit * ss.lot_size : null);
    const maxProfitHTML  = ss.max_profit  != null ? `<div class="signal-pnl-block-value profit">+${fmtR(ss.max_profit)}</div>`  : `<div class="signal-pnl-block-value">—</div>`;
    const maxLossHTML    = ss.max_loss    != null ? `<div class="signal-pnl-block-value loss">−${fmtR(ss.max_loss)}</div>`      : `<div class="signal-pnl-block-value">—</div>`;
    const netCrHTML      = netCreditTotal != null ? `<div class="signal-pnl-block-value">+${fmtR(netCreditTotal)}</div>` : `<div class="signal-pnl-block-value">—</div>`;
    const bkHTML         = ss.breakeven   != null ? `<div class="signal-pnl-block-value">${ss.breakeven.toLocaleString("en-IN")}</div>` : `<div class="signal-pnl-block-value">—</div>`;

    if (ss.net_credit == null) {
      unavailNote = `<div class="signal-unavail-note">Premiums unavailable (market closed) — P&amp;L and payoff are theoretical estimates</div>`;
    }

    pnlBlockHTML = `
      <div class="signal-pnl-block">
        <div class="signal-pnl-block-grid">
          <div>
            <div class="signal-pnl-block-label">Max Profit</div>
            ${maxProfitHTML}
          </div>
          <div>
            <div class="signal-pnl-block-label">Max Loss</div>
            ${maxLossHTML}
          </div>
          <div>
            <div class="signal-pnl-block-label">Net Credit</div>
            ${netCrHTML}
          </div>
          <div>
            <div class="signal-pnl-block-label">Breakeven</div>
            ${bkHTML}
          </div>
        </div>
      </div>
      ${unavailNote}
    `;
  }

  let exitPlanHTML = "";
  if (hasSpread) {
    const maxP = ss.max_profit;
    const t50  = maxP != null ? `+${fmtR(maxP * 0.50)}` : "50% of premium received";
    const t70  = maxP != null ? `+${fmtR(maxP * 0.70)}` : "70% of premium received";
    const shortStrikeStr = ss.short_strike.toLocaleString("en-IN");
    exitPlanHTML = `
      <div class="signal-section-label">Exit Plan</div>
      <div class="exit-plan-card signal-exit-plan">
        <div class="exit-plan-rules">
          <div class="exit-plan-rule">
            <span class="exit-rule-icon profit">✓</span>
            <div class="exit-rule-body">
              <span class="exit-rule-label">Profit target</span>
              <span class="exit-rule-value green">${t50}</span>
              <span class="exit-rule-note">50% of max premium captured · or hold to 70% (${t70})</span>
            </div>
          </div>
          <div class="exit-plan-rule">
            <span class="exit-rule-icon stop">✗</span>
            <div class="exit-rule-body">
              <span class="exit-rule-label">Stop loss</span>
              <span class="exit-rule-value red">NIFTY > ${shortStrikeStr}</span>
              <span class="exit-rule-note">Exit immediately if short strike is breached · consider rolling up</span>
            </div>
          </div>
          <div class="exit-plan-rule">
            <span class="exit-rule-icon time">⏱</span>
            <div class="exit-rule-body">
              <span class="exit-rule-label">Time stop</span>
              <span class="exit-rule-value">Close 1 DTE minimum</span>
              <span class="exit-rule-note">Gamma risk spikes in final 24h — do not hold through expiry unless deep OTM</span>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  const actionColors = { ENTER: "#00d4aa", MONITOR: "#f5a623", WAIT: "#ff5f6d" };
  const borderColor = actionColors[action] || "#5b8ef0";

  // P&L metrics as a compact 4-column row (same pattern as pos-metrics-grid)
  let pnlMetricsHTML = "";
  if (hasSpread) {
    const netCreditTotal = ss.net_credit_total ?? (ss.net_credit != null && ss.lot_size ? ss.net_credit * ss.lot_size : null);
    const unavailNote = ss.net_credit == null
      ? `<div class="signal-unavail-note">Premiums unavailable (market closed) — values are theoretical estimates</div>`
      : "";
    const mp  = ss.max_profit  != null ? `<div class="sig-metric-value profit">+${fmtR(ss.max_profit)}</div>`        : `<div class="sig-metric-value">—</div>`;
    const ml  = ss.max_loss    != null ? `<div class="sig-metric-value loss">−${fmtR(ss.max_loss)}</div>`            : `<div class="sig-metric-value">—</div>`;
    const nc  = netCreditTotal != null ? `<div class="sig-metric-value">+${fmtR(netCreditTotal)}</div>`              : `<div class="sig-metric-value">—</div>`;
    const bk  = ss.breakeven   != null ? `<div class="sig-metric-value">${ss.breakeven.toLocaleString("en-IN")}</div>` : `<div class="sig-metric-value">—</div>`;
    pnlMetricsHTML = `
      <div class="signal-pnl-metrics">
        <div class="sig-metric-card">
          <div class="sig-metric-label">Max Profit</div>${mp}
        </div>
        <div class="sig-metric-card">
          <div class="sig-metric-label">Max Loss</div>${ml}
        </div>
        <div class="sig-metric-card">
          <div class="sig-metric-label">Net Credit</div>${nc}
        </div>
        <div class="sig-metric-card">
          <div class="sig-metric-label">Breakeven</div>${bk}
        </div>
      </div>
      ${unavailNote}
    `;
  }

  section.innerHTML = `
    <div class="signal-card" id="signal-card-inner" style="border-left-color:${borderColor};">
      <div class="signal-card-header">
        <span class="signal-card-title">NEXT SIGNAL</span>
        <div class="signal-refresh">
          <span class="signal-updated" id="signal-updated-ts">Updated ${updated}</span>
          <button class="signal-refresh-btn" id="signal-refresh-btn" title="Refresh signal">↻ Refresh</button>
        </div>
      </div>
      <div class="signal-card-body">
        ${d.error ? `<div class="signal-unavailable">Signal unavailable — ${d.error}</div>` : ""}
        <div class="signal-top-row">
          <span class="signal-badge ${action}">${action}</span>
          <div class="signal-reason">${d.action_reason || "No reason provided."}</div>
        </div>
        ${tradeTicketHTML}
        ${hasSpread ? `
          <div class="signal-section-label">Expected P&amp;L</div>
          ${pnlMetricsHTML}
          <div class="signal-section-label">Payoff at Expiry</div>
          <div class="payoff-canvas-wrap signal-payoff-wrap">
            <canvas id="signal-payoff-chart"></canvas>
          </div>
          ${exitPlanHTML}
        ` : ""}
        <div class="signal-market-bar">
          <div class="signal-market-item">
            <span class="signal-market-label">Expiry</span>
            <span class="signal-market-value">${expiryStr}</span>
          </div>
          <div class="signal-market-sep"></div>
          <div class="signal-market-item">
            <span class="signal-market-label">Spot (NIFTY)</span>
            <span id="live-signal-spot" class="signal-market-value">${spotStr}${spotChangeStr ? `<span style="font-size:10px;font-weight:500;color:var(--muted);margin-left:4px;">${spotChangeStr}</span>` : ""}</span>
          </div>
          <div class="signal-market-sep"></div>
          <div class="signal-market-item">
            <span class="signal-market-label">Trend</span>
            <span class="signal-market-value ${trendCls}">${trendDisplay}</span>
          </div>
          <div class="signal-market-sep"></div>
          <div class="signal-market-item">
            <span class="signal-market-label">PCR</span>
            <span class="signal-market-value">${pcrStr}</span>
          </div>
          <div class="signal-market-sep"></div>
          <div class="signal-market-item">
            <span class="signal-market-label">Max Pain</span>
            <span class="signal-market-value">${maxPainStr}</span>
          </div>
          <div class="signal-market-sep"></div>
          <div class="signal-market-item">
            <span class="signal-market-label">Entry Window</span>
            <span class="signal-market-value">${entryWindow}</span>
          </div>
        </div>
      </div>
    </div>
  `;

  // Wire up refresh button
  const refreshBtn = document.getElementById("signal-refresh-btn");
  if (refreshBtn) {
    refreshBtn.addEventListener("click", () => {
      if (state.activeStrategyId) {
        refreshBtn.disabled = true;
        loadSignal(state.activeStrategyId).finally(() => {
          const btn = document.getElementById("signal-refresh-btn");
          if (btn) btn.disabled = false;
        });
      }
    });
  }

  if (hasSpread) {
    const nc  = ss.net_credit ?? ((ss.long_strike - ss.short_strike) * 0.10);
    const qty = ss.lot_size  ?? 65;
    const sp  = d.spot ?? ss.short_strike;
    setTimeout(() => drawBearCallPayoff("signal-payoff-chart", ss.short_strike, ss.long_strike, nc, qty, sp), 0);
  }
  state.signalData = d;
}

function renderSignalError(section, msg) {
  section.innerHTML = `
    <div class="signal-card">
      <div class="signal-card-header">
        <span class="signal-card-title">Next Signal</span>
        <div class="signal-refresh">
          <button class="signal-refresh-btn" id="signal-refresh-btn">↻ Refresh</button>
        </div>
      </div>
      <div class="signal-card-body">
        <div class="signal-unavailable">Signal unavailable — ${msg}</div>
      </div>
    </div>
  `;
  const refreshBtn = document.getElementById("signal-refresh-btn");
  if (refreshBtn) {
    refreshBtn.addEventListener("click", () => {
      if (state.activeStrategyId) loadSignal(state.activeStrategyId);
    });
  }
}

function scheduleSignalRefresh(strategyId) {
  if (signalRefreshTimer) clearInterval(signalRefreshTimer);
  signalRefreshTimer = setInterval(() => {
    const section = document.getElementById("signal-section");
    if (section && state.activeStrategyId === strategyId) {
      loadSignal(strategyId);
    } else {
      clearInterval(signalRefreshTimer);
    }
  }, 300000); // 5 minutes
}
