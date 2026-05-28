"use strict";

// ── Payoff diagram ────────────────────────────────────────────
const _chartStore = {};

function drawBearCallPayoff(canvasId, shortStrike, longStrike, netCreditPerUnit, qty, currentSpot, isLive = true) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || typeof Chart === "undefined") return;
  if (_chartStore[canvasId]) { _chartStore[canvasId].destroy(); delete _chartStore[canvasId]; }

  const spread    = longStrike - shortStrike;
  const step      = spread <= 200 ? 10 : spread <= 500 ? 25 : 50;
  const lo        = shortStrike - spread - 100;
  const hi        = longStrike  + spread + 100;
  const spots     = [];
  for (let s = lo; s <= hi; s += step) spots.push(s);

  const breakeven = shortStrike + netCreditPerUnit;

  function payoffAt(s) {
    if (s <= shortStrike) return netCreditPerUnit * qty;
    if (s <= longStrike)  return (netCreditPerUnit - (s - shortStrike)) * qty;
    return (netCreditPerUnit - spread) * qty;
  }

  const pnls    = spots.map(payoffAt);
  const posData = pnls.map((p, i) => ({ x: spots[i], y: p >= 0 ? p : null }));
  const negData = pnls.map((p, i) => ({ x: spots[i], y: p <  0 ? p : null }));

  const maxP = netCreditPerUnit * qty;
  const minP = (netCreditPerUnit - spread) * qty;
  const pad  = Math.abs(maxP - minP) * 0.18 || 1000;

  // Mouse position tracked per canvas
  let _hoverX = null;

  // ── Custom overlay plugin (key levels + hover tooltip) ──────
  // All drawing happens in afterDraw so it survives Chart.js redraws.
  const overlayPlugin = {
    id: `overlay_${canvasId}`,
    afterDraw(chart) {
      const { ctx, chartArea: area, scales: { x: xScale, y: yScale } } = chart;
      if (!area) return;

      const isLight = document.documentElement.dataset.theme === "light";

      // ── Helpers ──
      function vertLine(strike, color, label, dash = [4, 4]) {
        const xPx = xScale.getPixelForValue(strike);
        if (xPx < area.left || xPx > area.right) return;
        ctx.save();
        ctx.beginPath();
        ctx.setLineDash(dash);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.moveTo(xPx, area.top);
        ctx.lineTo(xPx, area.bottom);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.font = "bold 10px 'Inter', sans-serif";
        ctx.fillStyle = color;
        const tw = ctx.measureText(label).width;
        const tx = Math.min(xPx + 4, area.right - tw - 4);
        ctx.fillText(label, tx, area.top + 12);
        ctx.restore();
      }

      function horizLine(y, color, dash = [3, 3]) {
        const yPx = yScale.getPixelForValue(y);
        if (yPx < area.top || yPx > area.bottom) return;
        ctx.save();
        ctx.beginPath();
        ctx.setLineDash(dash);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.moveTo(area.left, yPx);
        ctx.lineTo(area.right, yPx);
        ctx.stroke();
        ctx.restore();
      }

      // ── Zero baseline ──
      horizLine(0, "rgba(129,140,248,0.28)", [2, 4]);

      // ── Key levels — draw lines first, labels after with collision detection ──
      const _levels = [
        { strike: shortStrike, color: "rgba(255,95,109,0.85)", label: `↓ ${shortStrike.toLocaleString("en-IN")}`, dash: [4, 4] },
        { strike: longStrike,  color: "rgba(0,212,170,0.85)",  label: `↑ ${longStrike.toLocaleString("en-IN")}`,  dash: [4, 4] },
      ];
      if (breakeven > shortStrike && breakeven < longStrike) {
        _levels.push({ strike: breakeven, color: "rgba(129,140,248,0.85)", label: `BE ${breakeven.toLocaleString("en-IN")}`, dash: [6, 3] });
      }

      // Draw all vertical lines first (no labels yet)
      for (const lv of _levels) {
        lv.xPx = xScale.getPixelForValue(lv.strike);
        if (lv.xPx < area.left || lv.xPx > area.right) continue;
        ctx.save();
        ctx.beginPath();
        ctx.setLineDash(lv.dash);
        ctx.strokeStyle = lv.color;
        ctx.lineWidth = 1.5;
        ctx.moveTo(lv.xPx, area.top);
        ctx.lineTo(lv.xPx, area.bottom);
        ctx.stroke();
        ctx.restore();
      }

      // Spot line (draw line only here)
      const liveSpot = chart._spot ?? currentSpot;
      let spotXPx = null;
      if (liveSpot) {
        spotXPx = xScale.getPixelForValue(liveSpot);
        if (spotXPx >= area.left && spotXPx <= area.right) {
          ctx.save();
          ctx.beginPath();
          ctx.setLineDash([5, 3]);
          ctx.strokeStyle = "#f5a623";
          ctx.lineWidth = 2;
          ctx.moveTo(spotXPx, area.top);
          ctx.lineTo(spotXPx, area.bottom);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.beginPath();
          ctx.arc(spotXPx, area.bottom, 4, 0, Math.PI * 2);
          ctx.fillStyle = "#f5a623";
          ctx.fill();
          ctx.restore();
        }
      }

      // Now place labels with collision detection (sorted left→right)
      ctx.font = "bold 10px 'Inter', sans-serif";
      const ROW_H = 13; // height of one label row
      const PAD   = 3;  // horizontal gap from line

      // Collect all label candidates (key levels + spot)
      const _labelCandidates = _levels
        .filter(lv => lv.xPx != null && lv.xPx >= area.left && lv.xPx <= area.right)
        .map(lv => ({ xPx: lv.xPx, color: lv.color, text: lv.label }));

      if (spotXPx != null && spotXPx >= area.left && spotXPx <= area.right) {
        _labelCandidates.push({ xPx: spotXPx, color: "#f5a623", text: isLive ? "Live" : "Spot" });
      }

      _labelCandidates.sort((a, b) => a.xPx - b.xPx);

      // Assign rows: track occupied [lx, rx] per row index
      const _rows = []; // array of [{lx, rx}]
      for (const lbl of _labelCandidates) {
        const tw = ctx.measureText(lbl.text).width;
        const lx = Math.min(lbl.xPx + PAD, area.right - tw - PAD);
        const rx = lx + tw;

        // Find the first row where [lx, rx] doesn't overlap anything
        let row = 0;
        while (_rows[row] && _rows[row].some(seg => lx < seg.rx + PAD && rx > seg.lx - PAD)) {
          row++;
        }
        if (!_rows[row]) _rows[row] = [];
        _rows[row].push({ lx, rx });

        const y = area.top + 11 + row * ROW_H;
        ctx.fillStyle = lbl.color;
        ctx.fillText(lbl.text, lx, y);
      }

      // ── Hover crosshair + DhanHQ-style P&L tooltip ──
      if (_hoverX != null && _hoverX >= area.left && _hoverX <= area.right) {
        const niftyVal = xScale.getValueForPixel(_hoverX);
        const pnl      = payoffAt(niftyVal);
        const isProfit = pnl >= 0;
        const pnlColor = isProfit ? "#00d4aa" : "#ff5f6d";

        // Vertical crosshair
        ctx.save();
        ctx.beginPath();
        ctx.setLineDash([4, 3]);
        ctx.strokeStyle = isLight ? "rgba(0,0,0,0.18)" : "rgba(255,255,255,0.18)";
        ctx.lineWidth = 1;
        ctx.moveTo(_hoverX, area.top);
        ctx.lineTo(_hoverX, area.bottom);
        ctx.stroke();

        // Dot on the payoff curve
        const dotY = yScale.getPixelForValue(pnl);
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.arc(_hoverX, dotY, 5, 0, Math.PI * 2);
        ctx.fillStyle = pnlColor;
        ctx.fill();
        ctx.strokeStyle = isLight ? "rgba(255,255,255,0.90)" : "rgba(3,7,18,0.85)";
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // ── Tooltip box ──
        const niftyLabel = `NIFTY ${Math.round(niftyVal).toLocaleString("en-IN")}`;
        const pnlLabel   = (isProfit ? "+₹" : "−₹") +
          Math.abs(pnl).toLocaleString("en-IN", { maximumFractionDigits: 0 });
        const pctLabel   = (isProfit ? "+" : "−") +
          (Math.abs(pnl) / (Math.abs(minP) + Math.abs(maxP) || 1) * 100).toFixed(1) + "% P&L";

        ctx.font = "500 10px 'Inter', sans-serif";
        const nW = ctx.measureText(niftyLabel).width;
        ctx.font = "800 14px 'Inter', sans-serif";
        const pW = ctx.measureText(pnlLabel).width;
        const boxW = Math.max(nW, pW) + 28;
        const boxH = 52;

        let boxX = _hoverX + 14;
        if (boxX + boxW > area.right) boxX = _hoverX - boxW - 14;
        let boxY = dotY - boxH / 2;
        if (boxY < area.top + 4) boxY = area.top + 4;
        if (boxY + boxH > area.bottom - 4) boxY = area.bottom - boxH - 4;

        // Shadow
        ctx.shadowColor = isLight ? "rgba(0,0,0,0.14)" : "rgba(0,0,0,0.5)";
        ctx.shadowBlur  = isLight ? 8 : 12;
        ctx.shadowOffsetY = 4;

        // Box background
        ctx.fillStyle = isLight ? "rgba(255,255,255,0.97)" : "rgba(3,7,18,0.95)";
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(boxX, boxY, boxW, boxH, 7);
        else ctx.rect(boxX, boxY, boxW, boxH);
        ctx.fill();

        ctx.shadowColor = "transparent";
        ctx.shadowBlur  = 0;

        // Colored border
        ctx.strokeStyle = pnlColor;
        ctx.lineWidth = 1;
        ctx.setLineDash([]);
        ctx.stroke();

        // Left accent bar
        ctx.fillStyle = pnlColor;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(boxX, boxY + 8, 3, boxH - 16, 2);
        else ctx.fillRect(boxX, boxY + 8, 3, boxH - 16);
        ctx.fill();

        // NIFTY level label (muted)
        ctx.fillStyle = isLight ? "#475569" : "#9ab0cc";
        ctx.font = "500 10px 'Inter', sans-serif";
        ctx.fillText(niftyLabel, boxX + 14, boxY + 17);

        // P&L amount (color)
        ctx.fillStyle = pnlColor;
        ctx.font = "800 14px 'Inter', sans-serif";
        ctx.fillText(pnlLabel, boxX + 14, boxY + 35);

        // Percent label (muted, small)
        ctx.fillStyle = isLight ? "rgba(100,116,139,0.9)" : "rgba(78,99,128,0.9)";
        ctx.font = "500 9px 'Inter', sans-serif";
        ctx.fillText(pctLabel, boxX + 14, boxY + 48);

        ctx.restore();

        // X-axis price marker
        const markerW = 64;
        const markerH = 16;
        const mx = _hoverX - markerW / 2;
        const my = area.bottom + 2;
        ctx.save();
        ctx.fillStyle = pnlColor;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(mx, my, markerW, markerH, 3);
        else ctx.fillRect(mx, my, markerW, markerH);
        ctx.fill();
        ctx.fillStyle = isLight ? "#fff" : "#030712";
        ctx.font = "bold 9px 'Inter', sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(Math.round(niftyVal).toLocaleString("en-IN"), _hoverX, my + 11);
        ctx.restore();
      }
    },
  };

  // ── Chart ──────────────────────────────────────────────────
  _chartStore[canvasId] = new Chart(canvas, {
    type: "line",
    data: {
      datasets: [
        {
          label: "Profit zone",
          data: posData,
          borderColor: "#00d4aa",
          backgroundColor: "rgba(0,212,170,0.10)",
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
          backgroundColor: "rgba(255,95,109,0.10)",
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
        tooltip: { enabled: false }, // replaced by custom hover
      },
      scales: {
        x: {
          type: "linear",
          grid: { color: "rgba(128,128,128,0.10)", drawBorder: false },
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
          grid: { color: "rgba(128,128,128,0.10)", drawBorder: false },
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
    plugins: [overlayPlugin],
  });

  // Store spot mutably so live NIFTY updates can move the line
  _chartStore[canvasId]._spot = currentSpot;

  // ── Mouse tracking ─────────────────────────────────────────
  canvas.addEventListener("mousemove", e => {
    const rect = canvas.getBoundingClientRect();
    _hoverX = e.clientX - rect.left;
    const ch = _chartStore[canvasId];
    if (ch) ch.draw();
  });

  canvas.addEventListener("mouseleave", () => {
    _hoverX = null;
    const ch = _chartStore[canvasId];
    if (ch) ch.draw();
  });
}

// ── Multi-spread combined payoff chart ───────────────────────
// spreads = [{ shortStrike, longStrike, nc, qty }, ...]
function drawMultiSpreadPayoff(canvasId, spreads, currentSpot, isLive = false) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || typeof Chart === "undefined" || !spreads.length) return;
  if (_chartStore[canvasId]) { _chartStore[canvasId].destroy(); delete _chartStore[canvasId]; }

  // Build x-axis range covering all strikes
  const allStrikes = spreads.flatMap(sp => [sp.shortStrike, sp.longStrike]);
  const minStrike = Math.min(...allStrikes);
  const maxStrike = Math.max(...allStrikes);
  const totalSpread = maxStrike - minStrike || 400;
  const step = totalSpread <= 200 ? 10 : totalSpread <= 500 ? 25 : 50;
  const lo = minStrike - totalSpread - 100;
  const hi = maxStrike + totalSpread + 100;
  const spots = [];
  for (let s = lo; s <= hi; s += step) spots.push(s);

  // Per-spread payoff function
  function spreadPayoffAt(sp, s) {
    const w = sp.longStrike - sp.shortStrike;
    if (s <= sp.shortStrike) return sp.nc * sp.qty;
    if (s <= sp.longStrike)  return (sp.nc - (s - sp.shortStrike)) * sp.qty;
    return (sp.nc - w) * sp.qty;
  }

  // Combined payoff = sum of all spreads
  function combinedPayoffAt(s) {
    return spreads.reduce((sum, sp) => sum + spreadPayoffAt(sp, s), 0);
  }

  const pnls    = spots.map(combinedPayoffAt);
  const posData = pnls.map((p, i) => ({ x: spots[i], y: p >= 0 ? p : null }));
  const negData = pnls.map((p, i) => ({ x: spots[i], y: p <  0 ? p : null }));

  const maxP = Math.max(...pnls);
  const minP = Math.min(...pnls);
  const pad  = Math.abs(maxP - minP) * 0.18 || 1000;

  // Per-spread colors for individual overlay lines
  const SPREAD_COLORS = ["rgba(99,179,237,0.75)", "rgba(246,173,85,0.75)", "rgba(154,110,200,0.75)", "rgba(72,199,142,0.75)"];

  // Individual spread datasets (thin dashed lines for each spread)
  const indivDatasets = spreads.map((sp, idx) => ({
    label: `Spread ${idx + 1}`,
    data: spots.map(s => ({ x: s, y: spreadPayoffAt(sp, s) })),
    borderColor: SPREAD_COLORS[idx % SPREAD_COLORS.length],
    borderWidth: 1.2,
    borderDash: [5, 4],
    fill: false,
    pointRadius: 0,
    tension: 0,
    spanGaps: true,
  }));

  let _hoverX = null;

  const overlayPlugin = {
    id: `overlay_${canvasId}`,
    afterDraw(chart) {
      const { ctx, chartArea: area, scales: { x: xScale, y: yScale } } = chart;
      if (!area) return;

      const isLight = document.documentElement.dataset.theme === "light";

      // Zero baseline
      const zeroYPx = yScale.getPixelForValue(0);
      if (zeroYPx >= area.top && zeroYPx <= area.bottom) {
        ctx.save();
        ctx.beginPath();
        ctx.setLineDash([2, 4]);
        ctx.strokeStyle = "rgba(129,140,248,0.28)";
        ctx.lineWidth = 1;
        ctx.moveTo(area.left, zeroYPx);
        ctx.lineTo(area.right, zeroYPx);
        ctx.stroke();
        ctx.restore();
      }

      // Strike lines for each spread, labeled S1↓/S2↓ etc.
      ctx.font = "bold 10px 'Inter', sans-serif";
      const ROW_H = 13;
      const PAD   = 3;
      const _labelCandidates = [];

      spreads.forEach((sp, idx) => {
        const label = idx + 1;
        const shortColor = "rgba(255,95,109,0.80)";
        const longColor  = "rgba(0,212,170,0.80)";

        for (const [strike, color, tag] of [
          [sp.shortStrike, shortColor, `S${label}↓`],
          [sp.longStrike,  longColor,  `L${label}↑`],
        ]) {
          const xPx = xScale.getPixelForValue(strike);
          if (xPx < area.left || xPx > area.right) continue;
          ctx.save();
          ctx.beginPath();
          ctx.setLineDash([4, 4]);
          ctx.strokeStyle = color;
          ctx.lineWidth = 1.2;
          ctx.moveTo(xPx, area.top);
          ctx.lineTo(xPx, area.bottom);
          ctx.stroke();
          ctx.restore();
          _labelCandidates.push({ xPx, color, text: `${tag} ${strike.toLocaleString("en-IN")}` });
        }

        // Breakeven for this spread
        const be = sp.shortStrike + sp.nc;
        if (be > sp.shortStrike && be < sp.longStrike) {
          const xPx = xScale.getPixelForValue(be);
          if (xPx >= area.left && xPx <= area.right) {
            ctx.save();
            ctx.beginPath();
            ctx.setLineDash([6, 3]);
            ctx.strokeStyle = "rgba(129,140,248,0.70)";
            ctx.lineWidth = 1;
            ctx.moveTo(xPx, area.top);
            ctx.lineTo(xPx, area.bottom);
            ctx.stroke();
            ctx.restore();
            _labelCandidates.push({ xPx, color: "rgba(129,140,248,0.85)", text: `BE${label} ${be.toLocaleString("en-IN")}` });
          }
        }
      });

      // Spot line
      const liveSpot = chart._spot ?? currentSpot;
      let spotXPx = null;
      if (liveSpot) {
        spotXPx = xScale.getPixelForValue(liveSpot);
        if (spotXPx >= area.left && spotXPx <= area.right) {
          ctx.save();
          ctx.beginPath();
          ctx.setLineDash([5, 3]);
          ctx.strokeStyle = "#f5a623";
          ctx.lineWidth = 2;
          ctx.moveTo(spotXPx, area.top);
          ctx.lineTo(spotXPx, area.bottom);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.beginPath();
          ctx.arc(spotXPx, area.bottom, 4, 0, Math.PI * 2);
          ctx.fillStyle = "#f5a623";
          ctx.fill();
          ctx.restore();
          _labelCandidates.push({ xPx: spotXPx, color: "#f5a623", text: isLive ? "Live" : "Spot" });
        }
      }

      // Place labels with collision detection (left→right)
      _labelCandidates.sort((a, b) => a.xPx - b.xPx);
      const _rows = [];
      for (const lbl of _labelCandidates) {
        const tw = ctx.measureText(lbl.text).width;
        const lx = Math.min(lbl.xPx + PAD, area.right - tw - PAD);
        const rx = lx + tw;
        let row = 0;
        while (_rows[row] && _rows[row].some(seg => lx < seg.rx + PAD && rx > seg.lx - PAD)) row++;
        if (!_rows[row]) _rows[row] = [];
        _rows[row].push({ lx, rx });
        const y = area.top + 11 + row * ROW_H;
        ctx.fillStyle = lbl.color;
        ctx.fillText(lbl.text, lx, y);
      }

      // Hover crosshair + combined P&L tooltip
      if (_hoverX != null && _hoverX >= area.left && _hoverX <= area.right) {
        const niftyVal = xScale.getValueForPixel(_hoverX);
        const pnl      = combinedPayoffAt(niftyVal);
        const isProfit = pnl >= 0;
        const pnlColor = isProfit ? "#00d4aa" : "#ff5f6d";

        ctx.save();
        ctx.beginPath();
        ctx.setLineDash([4, 3]);
        ctx.strokeStyle = isLight ? "rgba(0,0,0,0.18)" : "rgba(255,255,255,0.18)";
        ctx.lineWidth = 1;
        ctx.moveTo(_hoverX, area.top);
        ctx.lineTo(_hoverX, area.bottom);
        ctx.stroke();

        const dotY = yScale.getPixelForValue(pnl);
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.arc(_hoverX, dotY, 5, 0, Math.PI * 2);
        ctx.fillStyle = pnlColor;
        ctx.fill();
        ctx.strokeStyle = isLight ? "rgba(255,255,255,0.90)" : "rgba(3,7,18,0.85)";
        ctx.lineWidth = 1.5;
        ctx.stroke();

        const niftyLabel = `NIFTY ${Math.round(niftyVal).toLocaleString("en-IN")}`;
        const pnlLabel   = (isProfit ? "+₹" : "−₹") + Math.abs(pnl).toLocaleString("en-IN", { maximumFractionDigits: 0 });
        const pctRange   = Math.abs(maxP - minP) || 1;
        const pctLabel   = (isProfit ? "+" : "−") + (Math.abs(pnl) / pctRange * 100).toFixed(1) + "% range";

        ctx.font = "500 10px 'Inter', sans-serif";
        const nW = ctx.measureText(niftyLabel).width;
        ctx.font = "800 14px 'Inter', sans-serif";
        const pW = ctx.measureText(pnlLabel).width;
        const boxW = Math.max(nW, pW) + 28;
        const boxH = 52;

        let boxX = _hoverX + 14;
        if (boxX + boxW > area.right) boxX = _hoverX - boxW - 14;
        let boxY = dotY - boxH / 2;
        if (boxY < area.top + 4) boxY = area.top + 4;
        if (boxY + boxH > area.bottom - 4) boxY = area.bottom - boxH - 4;

        ctx.shadowColor = isLight ? "rgba(0,0,0,0.14)" : "rgba(0,0,0,0.5)";
        ctx.shadowBlur  = isLight ? 8 : 12;
        ctx.shadowOffsetY = 4;
        ctx.fillStyle = isLight ? "rgba(255,255,255,0.97)" : "rgba(3,7,18,0.95)";
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(boxX, boxY, boxW, boxH, 7);
        else ctx.rect(boxX, boxY, boxW, boxH);
        ctx.fill();
        ctx.shadowColor = "transparent";
        ctx.shadowBlur  = 0;

        ctx.strokeStyle = pnlColor;
        ctx.lineWidth = 1;
        ctx.setLineDash([]);
        ctx.stroke();
        ctx.fillStyle = pnlColor;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(boxX, boxY + 8, 3, boxH - 16, 2);
        else ctx.fillRect(boxX, boxY + 8, 3, boxH - 16);
        ctx.fill();

        ctx.fillStyle = isLight ? "#475569" : "#9ab0cc";
        ctx.font = "500 10px 'Inter', sans-serif";
        ctx.fillText(niftyLabel, boxX + 14, boxY + 17);
        ctx.fillStyle = pnlColor;
        ctx.font = "800 14px 'Inter', sans-serif";
        ctx.fillText(pnlLabel, boxX + 14, boxY + 35);
        ctx.fillStyle = isLight ? "rgba(100,116,139,0.9)" : "rgba(78,99,128,0.9)";
        ctx.font = "500 9px 'Inter', sans-serif";
        ctx.fillText(pctLabel, boxX + 14, boxY + 48);
        ctx.restore();

        // X-axis price marker
        const markerW = 64;
        const markerH = 16;
        const mx = _hoverX - markerW / 2;
        const my = area.bottom + 2;
        ctx.save();
        ctx.fillStyle = pnlColor;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(mx, my, markerW, markerH, 3);
        else ctx.fillRect(mx, my, markerW, markerH);
        ctx.fill();
        ctx.fillStyle = isLight ? "#fff" : "#030712";
        ctx.font = "bold 9px 'Inter', sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(Math.round(niftyVal).toLocaleString("en-IN"), _hoverX, my + 11);
        ctx.restore();
      }
    },
  };

  _chartStore[canvasId] = new Chart(canvas, {
    type: "line",
    data: {
      datasets: [
        {
          label: "Combined profit zone",
          data: posData,
          borderColor: "#00d4aa",
          backgroundColor: "rgba(0,212,170,0.10)",
          borderWidth: 2.5,
          fill: true,
          pointRadius: 0,
          tension: 0,
          spanGaps: false,
        },
        {
          label: "Combined loss zone",
          data: negData,
          borderColor: "#ff5f6d",
          backgroundColor: "rgba(255,95,109,0.10)",
          borderWidth: 2.5,
          fill: true,
          pointRadius: 0,
          tension: 0,
          spanGaps: false,
        },
        ...indivDatasets,
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: {
        legend: { display: false },
        tooltip: { enabled: false },
      },
      scales: {
        x: {
          type: "linear",
          grid: { color: "rgba(128,128,128,0.10)", drawBorder: false },
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
          grid: { color: "rgba(128,128,128,0.10)", drawBorder: false },
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
    plugins: [overlayPlugin],
  });

  _chartStore[canvasId]._spot = currentSpot;

  canvas.addEventListener("mousemove", e => {
    const rect = canvas.getBoundingClientRect();
    _hoverX = e.clientX - rect.left;
    const ch = _chartStore[canvasId];
    if (ch) ch.draw();
  });

  canvas.addEventListener("mouseleave", () => {
    _hoverX = null;
    const ch = _chartStore[canvasId];
    if (ch) ch.draw();
  });
}

// ── Session payoff spot markers ───────────────────────────────
function _addSessionSpotMarkers(canvasId, spotEntry, spotClose, shortStrike, longStrike, nc, qty) {
  if (!spotEntry && !spotClose) return;
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ch = _chartStore[canvasId];
  if (!ch) return;
  const area   = ch.chartArea;
  const xScale = ch.scales.x;
  const yScale = ch.scales.y;
  const ctx    = canvas.getContext("2d");
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

// ── Realized P&L horizontal reference line (session charts) ──
function _addRealizedLine(canvasId, realizedPnl) {
  const ch = _chartStore[canvasId];
  if (!ch) return;
  const { ctx, chartArea: area, scales: { y: yScale } } = ch;
  if (!area) return;

  const yPx = yScale.getPixelForValue(realizedPnl);
  if (yPx < area.top || yPx > area.bottom) return;

  const isProfit = realizedPnl >= 0;
  const color    = isProfit ? "rgba(0,212,170,0.80)" : "rgba(255,95,109,0.80)";
  const sign     = isProfit ? "+" : "−";
  const label    = `Closed ${sign}₹${Math.abs(realizedPnl).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

  ctx.save();
  ctx.beginPath();
  ctx.setLineDash([6, 3]);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.moveTo(area.left, yPx);
  ctx.lineTo(area.right, yPx);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.font = "bold 10px 'Inter', sans-serif";
  const tw = ctx.measureText(label).width;
  const lx = area.right - tw - 8;

  // Pill background
  ctx.fillStyle = isProfit ? "rgba(0,212,170,0.14)" : "rgba(255,95,109,0.14)";
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(lx - 4, yPx - 11, tw + 8, 14, 3);
  else ctx.fillRect(lx - 4, yPx - 11, tw + 8, 14);
  ctx.fill();

  ctx.fillStyle = color;
  ctx.fillText(label, lx, yPx - 1);
  ctx.restore();
}
