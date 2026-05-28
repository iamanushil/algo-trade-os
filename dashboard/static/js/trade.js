"use strict";

// ── Trade Detail ──────────────────────────────────────────────
function buildTradeDetailPanel() {
  const panel = el("div", { class: "panel", id: "trade-detail-panel" });

  const session = state.sessions.find(s => s.date === state.selectedDate);
  const sessionPnl = session?.pnl ?? 0;

  // Find expiry from trades
  const expiry = state.trades.length ? state.trades[0].expiry : null;

  // Extract entry/exit times from first SHORT leg
  const firstShort = state.trades.find(t => (t.spread_role || "").includes("SHORT"));
  const entryTime = firstShort?.open_time || null;
  const exitTime  = firstShort?.close_time || null;
  const timeInfo  = [
    entryTime ? `Entered ${entryTime}` : null,
    exitTime  ? `Closed ${exitTime}` : null,
  ].filter(Boolean).join(" · ");

  const exitType  = session?.exit_type  ?? null;
  const capPct    = session?.capture_pct ?? null;
  const dteAtExit = session?.dte_at_exit ?? null;

  const EXIT_LABELS = {
    held_to_expiry: { label: "Held to Expiry",     cls: "exit-held"   },
    profit_booked:  { label: "Profit Booked",       cls: "exit-profit" },
    rolled:         { label: "Rolled / Adjusted",   cls: "exit-rolled" },
    early_exit:     { label: "Early Exit",          cls: "exit-early"  },
  };
  const exitMeta  = exitType ? EXIT_LABELS[exitType] : null;
  const exitBadge = exitMeta
    ? el("span", { class: `exit-type-badge ${exitMeta.cls}` }, exitMeta.label)
    : null;
  const capBadge  = capPct != null
    ? el("span", { class: "exit-capture-pct" }, `${capPct >= 0 ? "+" : ""}${capPct}% captured`)
    : null;
  const dteBadge  = dteAtExit != null && dteAtExit > 0
    ? el("span", { class: "exit-dte-badge" }, `${dteAtExit}d before expiry`)
    : null;

  const header = el("div", { class: "panel-header" },
    el("div", { class: "flex items-center gap-8" },
      el("span", { class: "panel-title" }, fmtDate(state.selectedDate)),
      expiry   ? el("span", { class: "detail-expiry" }, `Expiry: ${fmtDate(expiry)}`) : null,
      timeInfo ? el("span", { class: "detail-session-times" }, timeInfo) : null,
      exitBadge,
      capBadge,
      dteBadge
    ),
    el("div", { class: "detail-header-right" },
      el("span", {
        class: "detail-session-pnl " + colorClass(sessionPnl)
      }, fmt(sessionPnl))
    )
  );
  panel.appendChild(header);

  const body = el("div", { class: "panel-body" });
  let _spreadGroups = [];   // populated inside the else branch, read in chart-draw section

  if (!state.trades.length) {
    body.appendChild(el("div", { class: "no-detail-msg" }, "No leg detail available for this session."));
  } else {
    const table = el("table", { class: "data-table" });

    const thead = el("thead",
      {},
      el("tr", {},
        el("th", {}, "Side"),
        el("th", {}, "Strike"),
        el("th", {}, "Expiry"),
        el("th", {}, "Type"),
        el("th", {}, "Qty"),
        el("th", {}, "Entry"),
        el("th", { class: "td-time-h" }, "In Time"),
        el("th", {}, "Exit"),
        el("th", { class: "td-time-h" }, "Out Time"),
        el("th", {}, "P&L"),
        el("th", {}, "Role")
      )
    );
    table.appendChild(thead);

    // Group trades by open_time to identify spread pairs
    const _timeGroups = [];
    const _seenTimes = [];
    for (const t of state.trades) {
      const ot = t.open_time || "__none__";
      if (!_seenTimes.includes(ot)) {
        _seenTimes.push(ot);
        _timeGroups.push({ time: ot, trades: [] });
      }
      _timeGroups.find(g => g.time === ot).trades.push(t);
    }
    const _multiGroup = _timeGroups.length > 1;

    // Spread groups for chart rendering (SHORT+LONG pairs keyed by open_time)
    _spreadGroups = (() => {
      const times = [], map = {};
      for (const t of state.trades) {
        const ot = t.open_time || "__none__";
        if (!map[ot]) { map[ot] = { shorts: [], longs: [] }; times.push(ot); }
        if ((t.spread_role || "").includes("SHORT")) map[ot].shorts.push(t);
        else if ((t.spread_role || "").includes("LONG")) map[ot].longs.push(t);
      }
      const groups = [];
      for (const ot of times) {
        const g = map[ot];
        const n = Math.min(g.shorts.length, g.longs.length);
        for (let i = 0; i < n; i++) groups.push({ short: g.shorts[i], long: g.longs[i] });
      }
      return groups;
    })();

    function _fmtExpiryShort(t) {
      if (!t.expiry_date) return "—";
      const m = t.expiry_date.match(/\d{4}-(\d{2})-(\d{2})/);
      const mon = ["","Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
      return m ? `${parseInt(m[2])} ${mon[parseInt(m[1])]}` : "—";
    }

    function _buildLegRow(t) {
      const pnl = t.leg_pnl ?? 0;
      const expiryShort = _fmtExpiryShort(t);
      const sideVal = (t.side || "").toUpperCase();
      const sideClass = sideVal === "SELL" ? "leg-action-tag sell" : "leg-action-tag buy";
      return el("tr", {},
        el("td", {}, sideVal ? el("span", { class: sideClass }, sideVal) : "—"),
        el("td", { class: "td-strike" }, String(t.strike)),
        el("td", { class: "td-expiry" }, expiryShort),
        el("td", {},
          el("span", { class: "leg-type " + t.option_type }, t.option_type)
        ),
        el("td", {}, String(Math.abs(t.qty))),
        el("td", {}, t.entry_price != null ? `₹${t.entry_price.toFixed(2)}` : "—"),
        el("td", { class: "td-time" }, t.open_time || "—"),
        el("td", {}, t.exit_price != null ? `₹${t.exit_price.toFixed(2)}` : "—"),
        el("td", { class: "td-time" }, t.close_time || "—"),
        el("td", { class: colorClass(pnl) === "green" ? "td-green" : "td-red" }, fmt(pnl)),
        el("td", {},
          el("span", { class: "role-badge " + t.spread_role }, t.spread_role?.replace(/_/g, " ") ?? "—")
        )
      );
    }

    const tbody = el("tbody", {});
    if (_multiGroup) {
      _timeGroups.forEach((grp, idx) => {
        const timeLabel = grp.time === "__none__" ? "—" : grp.time;
        const headerRow = el("tr", { class: "spread-group-header" },
          el("td", { colspan: "11", class: "spread-group-label" },
            `Spread ${idx + 1} · entered ${timeLabel}`
          )
        );
        tbody.appendChild(headerRow);
        for (const t of grp.trades) tbody.appendChild(_buildLegRow(t));
      });
    } else {
      for (const t of state.trades) tbody.appendChild(_buildLegRow(t));
    }
    table.appendChild(tbody);

    const maxAbs = Math.max(...state.trades.map(t => Math.abs(t.leg_pnl ?? 0)), 1);
    const barsDiv = el("div", { class: "leg-bars" });
    for (const t of state.trades) {
      const pnl   = t.leg_pnl ?? 0;
      const pct   = Math.round(Math.abs(pnl) / maxAbs * 55);  // max 55% width
      const cls   = pnl >= 0 ? "profit" : "loss";
      const vcls  = pnl >= 0 ? "green" : "red";
      const role  = (t.spread_role || "").includes("SHORT") ? "SHORT" : "LONG";
      const label = `${t.strike} ${t.option_type} · ${role}`;

      const fill  = el("div", { class: `leg-bar-fill ${cls}`, style: `width:${pct}%` });
      const track = el("div", { class: "leg-bar-track" }, fill);

      barsDiv.appendChild(
        el("div", { class: "leg-bar-row" },
          el("div", { class: "leg-bar-label", title: label }, label),
          track,
          el("div", { class: `leg-bar-value ${vcls}` }, fmt(pnl))
        )
      );
    }
    body.appendChild(barsDiv);

    // ── Payoff charts (one per spread) ──
    if (_spreadGroups.length === 1) {
      const wrap = el("div", { class: "payoff-canvas-wrap" });
      wrap.appendChild(el("canvas", { id: "session-payoff-chart" }));
      body.appendChild(wrap);
      body.appendChild(el("div", { class: "chart-note-muted" },
        "Theoretical payoff at expiry" +
        (exitTime ? ` · closed early at ${exitTime} — realized P&L is the dashed line` : "")
      ));
    } else if (_spreadGroups.length > 1) {
      const chartsWrap = el("div", { class: "spread-charts-wrap" });
      _spreadGroups.forEach((sp, idx) => {
        const spreadPnl = (sp.short.leg_pnl ?? 0) + (sp.long.leg_pnl ?? 0);
        const spreadExit = sp.short.close_time || sp.long.close_time || null;
        const card = el("div", { class: "spread-chart-card" });
        card.appendChild(el("div", { class: "spread-chart-card-header" },
          el("span", { class: "spread-chart-label" },
            `Spread ${idx + 1}`,
            el("span", { class: "spread-chart-strikes" }, ` · ${sp.short.strike} / ${sp.long.strike} CE`)
          ),
          el("div", { class: "spread-chart-meta" },
            sp.short.open_time ? el("span", { class: "spread-chart-time" }, `In ${sp.short.open_time}`) : null,
            spreadExit ? el("span", { class: "spread-chart-time" }, `Out ${spreadExit}`) : null,
            el("span", { class: "spread-chart-pnl " + (spreadPnl >= 0 ? "green" : "red") },
              (spreadPnl >= 0 ? "+" : "−") + "₹" + Math.abs(spreadPnl).toLocaleString("en-IN", { maximumFractionDigits: 0 })
            )
          )
        ));
        const canvasWrap = el("div", { class: "payoff-canvas-wrap", style: "margin-top:6px;" });
        canvasWrap.appendChild(el("canvas", { id: `session-payoff-chart-${idx}` }));
        card.appendChild(canvasWrap);
        chartsWrap.appendChild(card);
      });
      body.appendChild(chartsWrap);
      body.appendChild(el("div", { class: "chart-note-muted" },
        "Each chart shows theoretical payoff at expiry for that spread · dashed line = realized P&L"
      ));
    }

    body.appendChild(table);

    // Exit analysis card (why was the position closed when it was?)
    body.appendChild(_buildExitAnalysis(state.trades, session));

    // P&L breakdown card
    body.appendChild(_buildPnlBreakdown(state.trades, sessionPnl));
  }

  panel.appendChild(body);

  // Draw payoff charts using the _spreadGroups computed during DOM build
  if (_spreadGroups && _spreadGroups.length) {
    const allStrikes = _spreadGroups.flatMap(sp => [sp.short.strike, sp.long.strike]);
    const midStrike  = (Math.min(...allStrikes) + Math.max(...allStrikes)) / 2;
    const displaySpot = midStrike;

    if (_spreadGroups.length === 1) {
      const sp  = _spreadGroups[0];
      const nc  = sp.short.entry_price - sp.long.entry_price;
      const qty = Math.abs(sp.short.qty);
      const spotEntry = sp.short.nifty_spot_entry ?? null;
      const spotClose = sp.short.nifty_spot_close ?? null;
      setTimeout(() => {
        drawBearCallPayoff("session-payoff-chart", sp.short.strike, sp.long.strike, nc, qty, displaySpot, false);
        setTimeout(() => _addSessionSpotMarkers("session-payoff-chart", spotEntry, spotClose, sp.short.strike, sp.long.strike, nc, qty), 120);
        if (sessionPnl != null) setTimeout(() => _addRealizedLine("session-payoff-chart", sessionPnl), 130);
      }, 0);
    } else {
      // Individual chart per spread
      _spreadGroups.forEach((sp, idx) => {
        const canvasId  = `session-payoff-chart-${idx}`;
        const nc        = sp.short.entry_price - sp.long.entry_price;
        const qty       = Math.abs(sp.short.qty);
        const spreadPnl = (sp.short.leg_pnl ?? 0) + (sp.long.leg_pnl ?? 0);
        setTimeout(() => {
          drawBearCallPayoff(canvasId, sp.short.strike, sp.long.strike, nc, qty, displaySpot, false);
          if (spreadPnl != null) setTimeout(() => _addRealizedLine(canvasId, spreadPnl), 130);
        }, idx * 20);
      });
    }

    // Fetch NIFTY close → draw exit vertical line on each chart
    if (state.selectedDate) {
      const _chartTargets = _spreadGroups.length === 1
        ? [{ id: "session-payoff-chart", et: exitTime || "" }]
        : _spreadGroups.map((sp, i) => ({
            id: `session-payoff-chart-${i}`,
            et: sp.short.close_time || sp.long.close_time || "",
          }));
      apiFetch(`/api/nifty_at?date=${state.selectedDate}`).then(d => {
        if (!d || !d.spot) return;
        for (const { id, et } of _chartTargets) {
          const ch = _chartStore[id];
          if (!ch) continue;
          ch._exitSpot = d.spot;
          ch._exitTime = et;
          ch.update("none");
        }
      }).catch(() => {});
    }
  }

  return panel;
}

function _buildExitAnalysis(trades, session) {
  const fmtP = v => "₹" + Math.abs(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // Group trades by open_time (one group = one spread pair)
  const groups = [], seenTimes = [];
  for (const t of trades) {
    const ot = t.open_time || "__none__";
    if (!seenTimes.includes(ot)) { seenTimes.push(ot); groups.push({ time: ot, trades: [] }); }
    groups.find(g => g.time === ot).trades.push(t);
  }

  const wrap = el("div", { class: "exit-analysis-card" });
  wrap.appendChild(el("div", { class: "exit-analysis-title" }, "Exit Analysis — Why was this position closed?"));

  const items = el("div", { class: "exit-analysis-items" });

  groups.forEach((grp, idx) => {
    const short = grp.trades.find(t => (t.spread_role || "").includes("SHORT"));
    const long  = grp.trades.find(t => (t.spread_role || "").includes("LONG"));
    if (!short) return;

    const entryPrice   = short.entry_price ?? 1;
    const exitPrice    = short.exit_price  ?? 0;
    const ratio        = exitPrice / Math.max(entryPrice, 0.01);
    const heldToExpiry = short.close_date === short.expiry_date;
    const closeAtZero  = exitPrice <= 1.0;

    let reason, detail, cls;

    if (heldToExpiry && closeAtZero) {
      reason = "Expired worthless — full premium kept";
      detail = `${short.strike} CE expired at ₹${exitPrice.toFixed(2)} on expiry day. NIFTY stayed below the short strike — the option went to zero and the entire net premium was retained.`;
      cls = "reason-expiry";
    } else if (heldToExpiry && !closeAtZero) {
      reason = "Settled at expiry — option was in-the-money";
      detail = `${short.strike} CE settled at ₹${exitPrice.toFixed(2)} at expiry. NIFTY closed above the short strike — the short leg settled with intrinsic value, causing a loss on this leg.`;
      cls = "reason-loss";
    } else if (ratio > 1.1) {
      const pctUp = ((ratio - 1) * 100).toFixed(0);
      reason = `Defensive roll — NIFTY moved toward the strike (+${pctUp}% reprice)`;
      detail = `${short.strike} CE was sold at ₹${entryPrice.toFixed(2)} but had to be bought back at ₹${exitPrice.toFixed(2)} — the option repriced ${pctUp}% higher because NIFTY moved toward the short strike. This is a defensive close. The strategy almost always immediately re-opened a new spread at higher strikes (same session or next) to collect fresh premium.`;
      cls = "reason-rolled";
    } else if (ratio < 0.55) {
      const pctDecay = ((1 - ratio) * 100).toFixed(0);
      reason = `Profit booked — ${pctDecay}% of premium decayed`;
      detail = `${short.strike} CE fell from ₹${entryPrice.toFixed(2)} to ₹${exitPrice.toFixed(2)} — ${pctDecay}% of premium decayed (NIFTY stayed well below the strike). Position closed early to lock in gains rather than waiting for full expiry.`;
      cls = "reason-profit";
    } else {
      const pctDecay = ((1 - ratio) * 100).toFixed(0);
      reason = `Partial decay captured (${pctDecay}% premium lost)`;
      detail = `${short.strike} CE moved from ₹${entryPrice.toFixed(2)} to ₹${exitPrice.toFixed(2)}. Some time decay was captured before closing. Exit may have been part of a roll to adjust the position.`;
      cls = "reason-partial";
    }

    const spreadLabel = groups.length > 1
      ? `Spread ${idx + 1} · ${short.strike}/${long ? long.strike : "—"} CE`
      : `${short.strike}/${long ? long.strike : "—"} CE`;

    const shortLegPnl = short.leg_pnl ?? 0;
    const longLegPnl  = long ? (long.leg_pnl ?? 0) : 0;
    const spreadTotal = shortLegPnl + longLegPnl;

    const item = el("div", { class: `exit-analysis-item ${cls}` },
      el("div", { class: "exit-analysis-row" },
        el("div", { class: "exit-analysis-left" },
          el("div", { class: "exit-analysis-spread" }, spreadLabel),
          el("div", { class: "exit-analysis-reason" }, reason),
          el("div", { class: "exit-analysis-detail" }, detail)
        ),
        el("div", { class: "exit-analysis-prices" },
          el("div", { class: "exit-price-block" },
            el("div", { class: "exit-price-label2" }, "SHORT leg"),
            el("div", { class: "exit-price-compare-row" },
              el("span", { class: "exit-price-entry" }, `₹${entryPrice.toFixed(2)}`),
              el("span", { class: "exit-price-arrow " + (ratio > 1 ? "up" : "down") }, ratio > 1 ? "↑" : "↓"),
              el("span", { class: "exit-price-exit " + (ratio > 1 ? "red" : "green") }, `₹${exitPrice.toFixed(2)}`)
            ),
            el("div", { class: "exit-price-pnl " + (shortLegPnl >= 0 ? "green" : "red") },
              (shortLegPnl >= 0 ? "+" : "−") + fmtP(shortLegPnl)
            )
          ),
          long ? el("div", { class: "exit-price-block" },
            el("div", { class: "exit-price-label2" }, "LONG leg"),
            el("div", { class: "exit-price-compare-row" },
              el("span", { class: "exit-price-entry" }, `₹${(long.entry_price ?? 0).toFixed(2)}`),
              el("span", { class: "exit-price-arrow " + ((long.exit_price ?? 0) > (long.entry_price ?? 0) ? "up" : "down") },
                (long.exit_price ?? 0) > (long.entry_price ?? 0) ? "↑" : "↓"
              ),
              el("span", { class: "exit-price-exit " + (longLegPnl >= 0 ? "green" : "red") },
                `₹${(long.exit_price ?? 0).toFixed(2)}`
              )
            ),
            el("div", { class: "exit-price-pnl " + (longLegPnl >= 0 ? "green" : "red") },
              (longLegPnl >= 0 ? "+" : "−") + fmtP(longLegPnl)
            )
          ) : null,
          el("div", { class: "exit-price-block exit-price-total" },
            el("div", { class: "exit-price-label2" }, "Spread P&L"),
            el("div", { class: "exit-price-pnl " + (spreadTotal >= 0 ? "green" : "red") },
              (spreadTotal >= 0 ? "+" : "−") + fmtP(spreadTotal)
            )
          )
        )
      )
    );
    items.appendChild(item);
  });

  wrap.appendChild(items);

  // Overall narrative
  const exitType = session?.exit_type;
  const narratives = {
    held_to_expiry: "Full theta decay captured — position held to expiry and both options settled worthless. No early exit cost. This is the ideal outcome for a credit spread.",
    rolled:         "NIFTY moved toward the short strike, threatening the position. The spread was closed early (at a loss on that leg) and a new spread was re-opened at higher strikes to collect fresh credit and reset the risk. This is the defensive roll pattern — a loss on one leg is offset by the new credit received.",
    profit_booked:  "Premium decayed significantly before expiry. Position was closed early to lock in gains — the remaining time value was small enough that the risk of holding to expiry outweighed the benefit.",
    early_exit:     "Position closed before expiry. Based on the exit prices, this appears to be a partial unwind or position adjustment.",
  };
  const narrative = narratives[exitType];
  if (narrative) {
    wrap.appendChild(el("div", { class: "exit-analysis-narrative" },
      el("span", { class: "exit-analysis-narrative-label" }, "Why: "),
      narrative
    ));
  }

  return wrap;
}

function _buildPnlBreakdown(trades, sessionPnl) {
  const fmtAmt = v => "₹" + Math.abs(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const pnlSpan = (v) => el("span", { class: "pnl-bd-val " + (v >= 0 ? "green" : "red") },
    (v >= 0 ? "+" : "−") + fmtAmt(v)
  );

  const wrap = el("div", { class: "pnl-breakdown" });
  wrap.appendChild(el("div", { class: "pnl-bd-title" }, "How this P&L was calculated"));

  // Group trades by open_time for multi-spread subtotals
  const groups = [];
  const seenTimes = [];
  for (const t of trades) {
    const ot = t.open_time || "__none__";
    if (!seenTimes.includes(ot)) { seenTimes.push(ot); groups.push({ time: ot, trades: [] }); }
    groups.find(g => g.time === ot).trades.push(t);
  }
  const multiGroup = groups.length > 1;

  let theoreticalMax = 0;
  for (const t of trades) {
    const isShort = (t.spread_role || "").includes("SHORT");
    theoreticalMax += isShort ? (t.entry_price ?? 0) * Math.abs(t.qty || 0) : -(t.entry_price ?? 0) * Math.abs(t.qty || 0);
  }

  groups.forEach((grp, idx) => {
    if (multiGroup) {
      const grpPnl = grp.trades.reduce((s, t) => s + (t.leg_pnl ?? 0), 0);
      wrap.appendChild(el("div", { class: "pnl-bd-group-header" },
        el("span", {}, `Spread ${idx + 1}  ·  entered ${grp.time === "__none__" ? "—" : grp.time}`),
        pnlSpan(grpPnl)
      ));
    }
    const rows = el("div", { class: "pnl-bd-rows" + (multiGroup ? " pnl-bd-rows-indented" : "") });
    for (const t of grp.trades) {
      const isShort = (t.spread_role || "").includes("SHORT");
      const entry   = t.entry_price ?? 0;
      const exit    = t.exit_price  ?? 0;
      const qty     = Math.abs(t.qty || 0);
      const pnl     = t.leg_pnl ?? 0;
      const sideTag = isShort ? "SELL" : "BUY";
      const sideCls = isShort ? "sell" : "buy";
      const hi = isShort ? entry : exit;
      const lo = isShort ? exit  : entry;
      rows.appendChild(el("div", { class: "pnl-bd-row" },
        el("span", { class: `leg-action-tag ${sideCls} pnl-bd-side` }, sideTag),
        el("span", { class: "pnl-bd-inst" }, `${t.strike} ${t.option_type}`),
        el("span", { class: "pnl-bd-formula" }, `(₹${hi.toFixed(2)} − ₹${lo.toFixed(2)}) × ${qty}`),
        el("span", { class: "pnl-bd-eq" }, "="),
        pnlSpan(pnl)
      ));
    }
    wrap.appendChild(rows);
  });

  // Session total
  wrap.appendChild(el("div", { class: "pnl-bd-divider" }));
  wrap.appendChild(el("div", { class: "pnl-bd-total-row" },
    el("span", { class: "pnl-bd-total-label" }, "Realized P&L"),
    el("span", { class: "pnl-bd-total-val " + (sessionPnl >= 0 ? "green" : "red") },
      (sessionPnl >= 0 ? "+" : "−") + fmtAmt(sessionPnl)
    )
  ));

  // Early exit note
  const earlyExitCost = theoreticalMax - sessionPnl;
  if (Math.abs(earlyExitCost) > 0.5) {
    wrap.appendChild(el("div", { class: "pnl-bd-note" },
      `Max at expiry (→ ₹0): ${theoreticalMax >= 0 ? "+" : "−"}${fmtAmt(theoreticalMax)}`,
      el("span", { class: "pnl-bd-note-sep" }, "·"),
      `Early exit cost: −${fmtAmt(earlyExitCost)}`,
      el("span", { class: "pnl-bd-note-sep" }, "·"),
      `= Realized ${sessionPnl >= 0 ? "+" : "−"}${fmtAmt(sessionPnl)}`
    ));
  }

  return wrap;
}
