"use strict";

// ── Active Positions ──────────────────────────────────────────
function buildActivePositionPanel() {
  const panel = el("div", { class: "panel", id: "active-position-panel" });

  const shorts = state.openPositions.filter(p => p.spread_role === "SHORT_LEG" || p.spread_role === "SHORT_LEG_ADJ");
  const longs  = state.openPositions.filter(p => p.spread_role === "LONG_LEG"  || p.spread_role === "LONG_LEG_ADJ");
  const metrics = computePositionMetrics(state.openPositions);

  // ── Header ──
  const expiryInfo = state.openPositions[0]?.expiry_date
    ? el("span", { class: "pos-expiry-tag" }, `Expiry ${fmtDate(state.openPositions[0].expiry_date)}`)
    : null;
  const dteTag = metrics.dte != null
    ? el("span", {
        class: "pos-dte-tag" + (metrics.dte <= 3 ? " urgent" : metrics.dte <= 7 ? " warn" : "")
      }, `${metrics.dte}d left`)
    : null;

  panel.appendChild(el("div", { class: "panel-header" },
    el("span", { class: "panel-title" }, "Active Position"),
    el("span", { class: "badge-active" }, "ACTIVE"),
    expiryInfo,
    dteTag
  ));

  const body = el("div", { class: "panel-body" });

  // ── Legs (compact full-width rows) ──
  const legsGrid = el("div", { class: "legs-grid" });
  const mon = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  for (const pos of state.openPositions) {
    const actionLabel = (pos.spread_role === "SHORT_LEG" || pos.spread_role === "SHORT_LEG_ADJ") ? "SELL" : "BUY";
    const actionCls   = (pos.spread_role === "SHORT_LEG" || pos.spread_role === "SHORT_LEG_ADJ") ? "sell" : "buy";
    const openDateStr = pos.open_date ? (() => {
      const [y, m, d] = pos.open_date.split("-").map(Number);
      return `${d} ${mon[m-1]}`;
    })() : null;

    const row = el("div", { class: "leg-row" },
      el("span", { class: `leg-action-tag ${actionCls}` }, actionLabel),
      el("span", { class: "leg-strike" }, `${pos.strike.toLocaleString("en-IN")} ${pos.option_type}`),
      el("span", { class: "leg-type " + pos.option_type }, pos.option_type),
      el("span", { class: "role-badge " + pos.spread_role }, pos.spread_role.replace(/_/g, " ")),
      el("span", { class: "leg-detail" },
        el("strong", {}, `Qty: ${Math.abs(pos.qty)}`),
        openDateStr ? document.createTextNode(` · ${actionLabel === "SELL" ? "Sold" : "Bought"} ${openDateStr}`) : null,
        document.createTextNode(` · Entry @ ₹${pos.entry_price.toFixed(2)}`),
      )
    );
    legsGrid.appendChild(row);
  }
  body.appendChild(legsGrid);

  // ── Metrics (compact inline row) ──
  const metricDefs = [
    { label: "Net Credit",    val: metrics.netCreditStr,  cls: "green" },
    { label: "Spread Width",  val: metrics.spreadWidthStr, cls: "" },
    { label: "Days to Expiry",val: metrics.dteStr,         cls: metrics.dte <= 3 ? "red" : metrics.dte <= 7 ? "gold" : "" },
    { label: "Max Profit",    val: metrics.maxProfitStr,   cls: "green" },
    { label: "Max Risk",      val: metrics.maxRiskStr,     cls: "red" },
    { label: "R:R Ratio",     val: metrics.rrStr,          cls: "" },
  ];

  const metricsGrid = el("div", { class: "pos-metrics-grid" });
  for (const m of metricDefs) {
    metricsGrid.appendChild(
      el("div", { class: "pos-metric-card" },
        el("div", { class: "pos-metric-label" }, m.label),
        el("div", { class: "pos-metric-value " + m.cls }, m.val)
      )
    );
  }
  body.appendChild(metricsGrid);

  // ── Live NIFTY bar ──
  const liveBar = el("div", { id: "active-pos-live-bar", class: "active-pos-live-bar" },
    el("span", { class: "live-bar-label" }, "NIFTY LIVE"),
    el("span", { class: "live-bar-spot" }, "fetching…")
  );
  body.appendChild(liveBar);
  // Populate immediately if we already have live data
  if (state.liveNifty?.spot) _updateActivePosLiveBar(state.liveNifty.spot);

  // ── Payoff chart (full width, taller) ──
  const payoffWrap = el("div", { class: "payoff-canvas-wrap pos-payoff-wrap" });
  const payoffCanvas = el("canvas", { id: "active-payoff-chart" });
  payoffWrap.appendChild(payoffCanvas);
  body.appendChild(payoffWrap);
  body.appendChild(el("div", { class: "chart-note-muted pos-payoff-note" },
    "Orange dot = position at current NIFTY · Amber line = estimated exit P&L today (Black-Scholes, India VIX) · Green line = P&L if held to expiry · Hover to explore any level"
  ));

  panel.appendChild(body);

  // Draw chart + set up MTM params after DOM insertion
  if (shorts.length && longs.length) {
    const sStrike = shorts[0].strike;
    const lStrike = longs[0].strike;
    const nc      = shorts[0].entry_price - longs[0].entry_price;
    const qty     = Math.abs(shorts[0].qty);
    const spot    = state.signalData?.spot ?? (sStrike - 200);
    if (nc > 0) {
      setTimeout(() => drawBearCallPayoff("active-payoff-chart", sStrike, lStrike, nc, qty, spot), 0);
    }
    // Store params for live MTM computation
    state.activePosMtmParams = {
      shortStrike: sStrike,
      longStrike:  lStrike,
      expiry:      state.openPositions[0]?.expiry_date ?? "",
      shortEntry:  shorts[0].entry_price,
      longEntry:   longs[0].entry_price,
      qty,
    };
    // Fetch India VIX once (cache persists across renders)
    if (state.liveVix == null) {
      apiFetch("/api/vix").then(d => {
        state.liveVix = d.vix ?? 15;
        if (state.liveNifty?.spot) _updateActivePosLiveBar(state.liveNifty.spot);
      }).catch(() => { state.liveVix = 15; });
    }
  }

  return panel;
}

function computePositionMetrics(positions) {
  if (!positions.length) return {};

  const shorts = positions.filter(p => p.spread_role === "SHORT_LEG" || p.spread_role === "SHORT_LEG_ADJ");
  const longs  = positions.filter(p => p.spread_role === "LONG_LEG"  || p.spread_role === "LONG_LEG_ADJ");

  const shortTotal = shorts.reduce((a, p) => a + p.entry_price * Math.abs(p.qty), 0);
  const longTotal  = longs.reduce((a, p)  => a + p.entry_price * Math.abs(p.qty), 0);
  const netCreditTotal = shortTotal - longTotal;

  let spreadWidth = 0;
  if (shorts.length && longs.length) {
    spreadWidth = Math.abs(longs[0].strike - shorts[0].strike);
  }

  const totalQty = shorts.length ? Math.abs(shorts[0].qty) : (longs.length ? Math.abs(longs[0].qty) : 1);

  const netCreditPerUnit = shorts.length && longs.length
    ? shorts[0].entry_price - longs[0].entry_price
    : netCreditTotal / Math.max(totalQty, 1);

  const maxProfit = netCreditTotal;
  const maxRisk   = (spreadWidth - netCreditPerUnit) * totalQty;

  const firstExpiry = positions[0]?.expiry_date;
  const dte = daysToExpiry(firstExpiry) ?? 0;

  const rrRatio = maxRisk > 0 ? (maxProfit / maxRisk).toFixed(2) : "N/A";

  return {
    netCreditStr:  fmt(netCreditTotal),
    spreadWidthStr: spreadWidth ? `₹${spreadWidth.toLocaleString("en-IN")}` : "—",
    dteStr:        dte !== null ? `${dte} days` : "—",
    dte,
    maxProfitStr:  fmt(maxProfit),
    maxRiskStr:    fmt(maxRisk),
    rrStr: typeof rrRatio === "string" ? rrRatio : `1 : ${(1 / parseFloat(rrRatio)).toFixed(2)}`,
  };
}
