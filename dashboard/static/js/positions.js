"use strict";

// ── Active Positions ──────────────────────────────────────────
function buildActivePositionPanel() {
  const panel = el("div", { class: "panel", id: "active-position-panel" });

  const header = el("div", { class: "panel-header" },
    el("span", { class: "panel-title" }, "Active Position"),
    el("span", { class: "badge-active" }, "ACTIVE")
  );
  panel.appendChild(header);

  const body = el("div", { class: "panel-body" });

  // Legs grid
  const legsGrid = el("div", { class: "legs-grid" });
  for (const pos of state.openPositions) {
    const dte = daysToExpiry(pos.expiry_date);
    const dteStr = dte !== null ? `${dte}d to expiry` : "";

    const row = el("div", { class: "leg-row" },
      el("span", { class: "leg-strike" }, `${pos.strike} ${pos.option_type}`),
      el("span", { class: "leg-type " + pos.option_type }, pos.option_type),
      el("span", { class: "role-badge " + pos.spread_role }, pos.spread_role.replace(/_/g, " ")),
      el("span", { class: "leg-detail" },
        el("strong", {}, `Qty: ${Math.abs(pos.qty)}`),
        (() => {
          const mon = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
          const actionLabel = (pos.spread_role === "SHORT_LEG" || pos.spread_role === "SHORT_LEG_ADJ") ? "Sold" : "Bought";
          const openDateStr = pos.open_date ? (() => {
            const [y, m, d] = pos.open_date.split("-").map(Number);
            return `${d} ${mon[m-1]}`;
          })() : null;
          return openDateStr ? document.createTextNode(` ${actionLabel} ${openDateStr}`) : null;
        })(),
        document.createTextNode(` · Entry @ ₹${pos.entry_price.toFixed(2)}`),
        pos.expiry_date ? el("span", { class: "text-muted" }, ` · Expiry ${fmtDate(pos.expiry_date)}`) : null,
        dteStr ? el("span", { class: "text-muted", style: "margin-left:6px;color:var(--gold);" }, `(${dteStr})`) : null
      )
    );
    legsGrid.appendChild(row);
  }
  // Compute position metrics
  const metrics = computePositionMetrics(state.openPositions);

  const metricsGrid = el("div", { class: "pos-metrics-grid" });

  const metricDefs = [
    { label: "Net Credit", val: metrics.netCreditStr, cls: "green" },
    { label: "Spread Width", val: metrics.spreadWidthStr, cls: "" },
    { label: "Days to Expiry", val: metrics.dteStr, cls: metrics.dte <= 3 ? "red" : metrics.dte <= 7 ? "gold" : "" },
    { label: "Max Profit", val: metrics.maxProfitStr, cls: "green" },
    { label: "Max Risk", val: metrics.maxRiskStr, cls: "red" },
    { label: "R:R Ratio", val: metrics.rrStr, cls: "" },
  ];

  for (const m of metricDefs) {
    metricsGrid.appendChild(
      el("div", { class: "pos-metric-card" },
        el("div", { class: "pos-metric-label" }, m.label),
        el("div", { class: "pos-metric-value " + m.cls }, m.val)
      )
    );
  }

  // Two-column split: legs left, chart right; metrics span full width below
  const leftCol  = el("div", { class: "panel-split-left" });
  const rightCol = el("div", { class: "panel-split-right" });
  const split    = el("div", { class: "panel-split" });

  leftCol.appendChild(legsGrid);

  const payoffWrap = el("div", { class: "payoff-canvas-wrap", style: "margin-top:0;" });
  const payoffCanvas = el("canvas", { id: "active-payoff-chart" });
  payoffWrap.appendChild(payoffCanvas);
  rightCol.appendChild(payoffWrap);

  split.appendChild(leftCol);
  split.appendChild(rightCol);
  body.appendChild(split);
  metricsGrid.style.marginTop = "16px";
  body.appendChild(metricsGrid);

  panel.appendChild(body);

  // Draw after DOM insertion
  const shorts = state.openPositions.filter(p => p.spread_role === "SHORT_LEG" || p.spread_role === "SHORT_LEG_ADJ");
  const longs  = state.openPositions.filter(p => p.spread_role === "LONG_LEG"  || p.spread_role === "LONG_LEG_ADJ");
  if (shorts.length && longs.length) {
    const sStrike = shorts[0].strike;
    const lStrike = longs[0].strike;
    const nc      = shorts[0].entry_price - longs[0].entry_price;
    const qty     = Math.abs(shorts[0].qty);
    const spot    = state.signalData?.spot ?? (sStrike - 200);
    if (nc > 0) {
      setTimeout(() => drawBearCallPayoff("active-payoff-chart", sStrike, lStrike, nc, qty, spot), 0);
    }
  }

  return panel;
}

function computePositionMetrics(positions) {
  if (!positions.length) return {};

  // Group short and long legs
  const shorts = positions.filter(p => p.spread_role === "SHORT_LEG" || p.spread_role === "SHORT_LEG_ADJ");
  const longs = positions.filter(p => p.spread_role === "LONG_LEG" || p.spread_role === "LONG_LEG_ADJ");

  // Net credit per unit: sum(short entry prices) - sum(long entry prices)
  const shortTotal = shorts.reduce((a, p) => a + p.entry_price * Math.abs(p.qty), 0);
  const longTotal = longs.reduce((a, p) => a + p.entry_price * Math.abs(p.qty), 0);
  const netCreditTotal = shortTotal - longTotal;

  // Spread width: difference in strikes (abs)
  let spreadWidth = 0;
  if (shorts.length && longs.length) {
    const shortStrike = shorts[0].strike;
    const longStrike = longs[0].strike;
    spreadWidth = Math.abs(longStrike - shortStrike);
  }

  // Total quantity (lots)
  const totalQty = shorts.length ? Math.abs(shorts[0].qty) : (longs.length ? Math.abs(longs[0].qty) : 1);

  // Net credit per unit
  const netCreditPerUnit = shorts.length && longs.length
    ? shorts[0].entry_price - longs[0].entry_price
    : netCreditTotal / Math.max(totalQty, 1);

  // Max profit = net credit received
  const maxProfit = netCreditTotal;

  // Max risk = (spread_width - net_credit_per_unit) * total_qty
  const maxRisk = (spreadWidth - netCreditPerUnit) * totalQty;

  // Days to expiry from first position's expiry_date
  const firstExpiry = positions[0]?.expiry_date;
  const dte = daysToExpiry(firstExpiry) ?? 0;

  // R:R ratio
  const rrRatio = maxRisk > 0 ? (maxProfit / maxRisk).toFixed(2) : "N/A";

  return {
    netCreditStr: fmt(netCreditTotal),
    spreadWidthStr: spreadWidth ? `₹${spreadWidth.toLocaleString("en-IN")}` : "—",
    dteStr: dte !== null ? `${dte} days` : "—",
    dte: dte,
    maxProfitStr: fmt(maxProfit),
    maxRiskStr: fmt(maxRisk),
    rrStr: typeof rrRatio === "string" ? rrRatio : `1 : ${(1 / parseFloat(rrRatio)).toFixed(2)}`,
  };
}
