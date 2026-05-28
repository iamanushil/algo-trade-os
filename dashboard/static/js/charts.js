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
  const pad  = Math.abs(maxP - minP) * 0.18 || 1000;
  const breakeven = shortStrike + netCreditPerUnit;

  _chartStore[canvasId] = new Chart(canvas, {
    type: "line",
    data: {
      datasets: [
        {
          label: "Profit zone",
          data: posData,
          borderColor: "#00d4aa",
          backgroundColor: "rgba(0,212,170,0.1)",
          borderWidth: 2.5,
          fill: true,
          pointRadius: 0,
          tension: 0,
          spanGaps: false,
        },
        {
          label: "Loss zone",
          data: negData,
          borderColor: "#ff5f6d",
          backgroundColor: "rgba(255,95,109,0.1)",
          borderWidth: 2.5,
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
          backgroundColor: "rgba(3,7,18,0.92)",
          borderColor: "rgba(255,255,255,0.12)",
          borderWidth: 1,
          titleColor: "#9ab0cc",
          bodyColor: "#e4eaf6",
          padding: 10,
          callbacks: {
            label: ctx => {
              const v = ctx.parsed.y;
              if (v == null) return null;
              return (v >= 0 ? "+₹" : "−₹") + Math.abs(v).toLocaleString("en-IN", { minimumFractionDigits: 2 });
            },
            title: ctx => `NIFTY ${ctx[0].parsed.x.toLocaleString("en-IN")}`,
          },
        },
      },
      scales: {
        x: {
          type: "linear",
          grid: { color: "rgba(255,255,255,0.06)", drawBorder: false },
          ticks: {
            color: "#4e6380",
            maxTicksLimit: 7,
            font: { size: 10, family: "'Inter', sans-serif" },
            callback: v => v.toLocaleString("en-IN"),
          },
          min: lo,
          max: hi,
        },
        y: {
          grid: { color: "rgba(255,255,255,0.06)", drawBorder: false },
          ticks: {
            color: "#4e6380",
            font: { size: 10, family: "'Inter', sans-serif" },
            callback: v => (v >= 0 ? "+" : "") + "₹" + Math.abs(v).toLocaleString("en-IN"),
          },
          min: minP - pad,
          max: maxP + pad,
        },
      },
    },
  });

  // Draw key level overlays after chart renders
  setTimeout(() => {
    const ch = _chartStore[canvasId];
    if (!ch) return;
    const area = ch.chartArea;
    if (!area) return;
    const ctx2 = canvas.getContext("2d");
    const xScale = ch.scales.x;
    const yScale = ch.scales.y;

    function drawVertLine(strike, color, label, style = [4, 4]) {
      const xPx = xScale.getPixelForValue(strike);
      if (xPx < area.left || xPx > area.right) return;
      ctx2.save();
      ctx2.beginPath();
      ctx2.setLineDash(style);
      ctx2.strokeStyle = color;
      ctx2.lineWidth = 1.5;
      ctx2.moveTo(xPx, area.top);
      ctx2.lineTo(xPx, area.bottom);
      ctx2.stroke();
      // Label tag
      ctx2.setLineDash([]);
      ctx2.font = "bold 10px 'Inter', sans-serif";
      ctx2.fillStyle = color;
      const textW = ctx2.measureText(label).width;
      const tagX = Math.min(xPx + 4, area.right - textW - 4);
      ctx2.fillText(label, tagX, area.top + 12);
      ctx2.restore();
    }

    function drawHorizLine(y, color, style = [3, 3]) {
      const yPx = yScale.getPixelForValue(y);
      if (yPx < area.top || yPx > area.bottom) return;
      ctx2.save();
      ctx2.beginPath();
      ctx2.setLineDash(style);
      ctx2.strokeStyle = color;
      ctx2.lineWidth = 1;
      ctx2.moveTo(area.left, yPx);
      ctx2.lineTo(area.right, yPx);
      ctx2.stroke();
      ctx2.restore();
    }

    // Zero baseline
    drawHorizLine(0, "rgba(91,142,240,0.35)", [2, 4]);

    // Key vertical levels
    drawVertLine(shortStrike, "rgba(255,95,109,0.8)", `↓${shortStrike.toLocaleString("en-IN")}`);
    drawVertLine(longStrike,  "rgba(0,212,170,0.8)",  `↑${longStrike.toLocaleString("en-IN")}`);
    if (breakeven > shortStrike && breakeven < longStrike) {
      drawVertLine(breakeven, "rgba(91,142,240,0.7)", `BE ${breakeven.toLocaleString("en-IN")}`, [6, 3]);
    }

    // Current spot
    if (currentSpot) {
      const sxPx = xScale.getPixelForValue(currentSpot);
      if (sxPx >= area.left && sxPx <= area.right) {
        ctx2.save();
        ctx2.beginPath();
        ctx2.setLineDash([5, 3]);
        ctx2.strokeStyle = "#f5a623";
        ctx2.lineWidth = 2;
        ctx2.moveTo(sxPx, area.top);
        ctx2.lineTo(sxPx, area.bottom);
        ctx2.stroke();
        // Dot on x-axis
        ctx2.setLineDash([]);
        ctx2.beginPath();
        ctx2.arc(sxPx, area.bottom, 4, 0, Math.PI * 2);
        ctx2.fillStyle = "#f5a623";
        ctx2.fill();
        ctx2.font = "bold 10px 'Inter', sans-serif";
        ctx2.fillStyle = "#f5a623";
        ctx2.fillText("Spot", sxPx + 5, area.top + 26);
        ctx2.restore();
      }
    }
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
    ctx.beginPath();
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.2;
    ctx.moveTo(xPx, area.top);
    ctx.lineTo(xPx, area.bottom);
    ctx.stroke();
    ctx.beginPath();
    ctx.setLineDash([]);
    ctx.arc(xPx, yPx, 4, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.font = "bold 10px 'Inter', sans-serif";
    ctx.fillStyle = color;
    ctx.fillText(label, xPx + 5, area.top + 14);
    ctx.restore();
  }

  if (spotEntry) drawMarker(spotEntry, "#f5a623", "Entry");
  if (spotClose) drawMarker(spotClose, "#9ab0cc", "Exit");
}
