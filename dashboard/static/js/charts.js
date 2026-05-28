"use strict";

// ── Payoff diagram ────────────────────────────────────────────
const _chartStore = {};

function drawBearCallPayoff(canvasId, shortStrike, longStrike, netCreditPerUnit, qty, currentSpot) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || typeof Chart === "undefined") return;
  if (_chartStore[canvasId]) { _chartStore[canvasId].destroy(); delete _chartStore[canvasId]; }

  const spread = longStrike - shortStrike;
  const step = spread <= 200 ? 10 : spread <= 500 ? 25 : 50;
  const lo = shortStrike - spread - 100;
  const hi = longStrike  + spread + 100;
  const spots = [];
  for (let s = lo; s <= hi; s += step) spots.push(s);

  const pnls = spots.map(s => {
    if (s <= shortStrike) return netCreditPerUnit * qty;
    if (s <= longStrike)  return (netCreditPerUnit - (s - shortStrike)) * qty;
    return (netCreditPerUnit - spread) * qty;
  });

  const posData = pnls.map((p, i) => ({ x: spots[i], y: p >= 0 ? p : null }));
  const negData = pnls.map((p, i) => ({ x: spots[i], y: p <  0 ? p : null }));

  const maxP = netCreditPerUnit * qty;
  const minP = (netCreditPerUnit - spread) * qty;
  const pad  = Math.abs(maxP - minP) * 0.15 || 1000;

  _chartStore[canvasId] = new Chart(canvas, {
    type: "line",
    data: {
      datasets: [
        {
          label: "Profit zone",
          data: posData,
          borderColor: "#22c55e",
          backgroundColor: "rgba(34,197,94,0.12)",
          borderWidth: 2,
          fill: true,
          pointRadius: 0,
          tension: 0,
          spanGaps: false,
        },
        {
          label: "Loss zone",
          data: negData,
          borderColor: "#ef4444",
          backgroundColor: "rgba(239,68,68,0.12)",
          borderWidth: 2,
          fill: true,
          pointRadius: 0,
          tension: 0,
          spanGaps: false,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => {
              const v = ctx.parsed.y;
              if (v == null) return null;
              return (v >= 0 ? "+₹" : "-₹") + Math.abs(v).toLocaleString("en-IN", { minimumFractionDigits: 2 });
            },
            title: ctx => `NIFTY ${ctx[0].parsed.x.toLocaleString("en-IN")}`,
          },
        },
        annotation: undefined,
      },
      scales: {
        x: {
          type: "linear",
          grid: { color: "rgba(42,51,71,0.6)" },
          ticks: {
            color: "#64748b",
            maxTicksLimit: 8,
            callback: v => v.toLocaleString("en-IN"),
          },
          min: lo,
          max: hi,
        },
        y: {
          grid: { color: "rgba(42,51,71,0.6)" },
          ticks: {
            color: "#64748b",
            callback: v => (v >= 0 ? "+" : "") + "₹" + Math.abs(v).toLocaleString("en-IN"),
          },
          min: minP - pad,
          max: maxP + pad,
        },
      },
    },
  });

  // Draw spot line as a canvas overlay after Chart renders
  setTimeout(() => {
    const ch = _chartStore[canvasId];
    if (!ch) return;
    const area = ch.chartArea;
    if (!area) return;
    const ctx2 = canvas.getContext("2d");
    const xScale = ch.scales.x;
    const xPx = xScale.getPixelForValue(currentSpot);
    if (xPx < area.left || xPx > area.right) return;
    ctx2.save();
    ctx2.beginPath();
    ctx2.setLineDash([4, 4]);
    ctx2.strokeStyle = "#f59e0b";
    ctx2.lineWidth = 1.5;
    ctx2.moveTo(xPx, area.top);
    ctx2.lineTo(xPx, area.bottom);
    ctx2.stroke();
    ctx2.font = "11px 'Segoe UI', sans-serif";
    ctx2.fillStyle = "#f59e0b";
    ctx2.fillText("Spot", xPx + 4, area.top + 14);
    ctx2.restore();
  }, 60);
}

// ── Session payoff spot markers ───────────────────────────────
function _addSessionSpotMarkers(canvasId, spotEntry, spotClose, shortStrike, longStrike, nc, qty) {
  if (!spotEntry && !spotClose) return;
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ch = _chartStore[canvasId];
  if (!ch) return;
  const area = ch.chartArea;
  const xScale = ch.scales.x;
  const yScale = ch.scales.y;
  const ctx = canvas.getContext("2d");
  const spread = longStrike - shortStrike;

  function payoffAt(s) {
    if (s <= shortStrike) return nc * qty;
    if (s <= longStrike)  return (nc - (s - shortStrike)) * qty;
    return (nc - spread) * qty;
  }

  function drawMarker(spot, color, label) {
    const xPx = xScale.getPixelForValue(spot);
    if (xPx < area.left || xPx > area.right) return;
    const pnl = payoffAt(spot);
    const yPx = yScale.getPixelForValue(pnl);
    ctx.save();
    // vertical line
    ctx.beginPath();
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.2;
    ctx.moveTo(xPx, area.top);
    ctx.lineTo(xPx, area.bottom);
    ctx.stroke();
    // dot at payoff curve
    ctx.beginPath();
    ctx.setLineDash([]);
    ctx.arc(xPx, yPx, 4, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    // label
    ctx.font = "11px 'Segoe UI', sans-serif";
    ctx.fillStyle = color;
    ctx.fillText(label, xPx + 5, area.top + 14);
    ctx.restore();
  }

  if (spotEntry) drawMarker(spotEntry, "#f59e0b", "Entry");
  if (spotClose) drawMarker(spotClose, "#94a3b8", "Exit");
}
