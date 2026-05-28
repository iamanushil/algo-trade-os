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

  const header = el("div", { class: "panel-header" },
    el("div", { class: "flex items-center gap-8" },
      el("span", { class: "panel-title" }, fmtDate(state.selectedDate)),
      expiry   ? el("span", { class: "detail-expiry" }, `Expiry: ${fmtDate(expiry)}`) : null,
      timeInfo ? el("span", { class: "detail-session-times" }, timeInfo) : null
    ),
    el("div", { class: "detail-header-right" },
      el("span", {
        class: "detail-session-pnl " + colorClass(sessionPnl)
      }, fmt(sessionPnl))
    )
  );
  panel.appendChild(header);

  const body = el("div", { class: "panel-body" });

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

    const sessionPayoffWrap = el("div", { class: "payoff-canvas-wrap" });
    const sessionPayoffCanvas = el("canvas", { id: "session-payoff-chart" });
    sessionPayoffWrap.appendChild(sessionPayoffCanvas);
    body.appendChild(sessionPayoffWrap);

    // Note explaining the chart is theoretical (actual profit came from early exit)
    body.appendChild(el("div", { class: "chart-note-muted" },
      "Theoretical payoff at expiry" +
      (exitTime ? ` · position was closed early at ${exitTime} — actual P&L differs from the curve` : "")
    ));

    body.appendChild(table);

    // Session Total uses authoritative P&L from session object (not sum of visible legs)
    const summaryRow = el("div", { class: "metric-row", style: "margin-top:12px;padding-top:12px;border-top:1px solid var(--border);" },
      el("span", { class: "metric-label" }, "Session Total"),
      el("span", { class: "metric-value " + colorClass(sessionPnl) }, fmt(sessionPnl))
    );
    body.appendChild(summaryRow);
  }

  panel.appendChild(body);

  // Draw session payoff chart if we have both legs
  const shorts = state.trades.filter(t => (t.spread_role || "").includes("SHORT"));
  const longs  = state.trades.filter(t => (t.spread_role || "").includes("LONG"));
  if (shorts.length && longs.length) {
    // Build spread groups keyed by open_time (same grouping logic as the table)
    const _sgTimes = [];
    const _sgMap   = {};
    for (const t of state.trades) {
      const ot = t.open_time || "__none__";
      if (!_sgMap[ot]) { _sgMap[ot] = { shorts: [], longs: [] }; _sgTimes.push(ot); }
      if ((t.spread_role || "").includes("SHORT")) _sgMap[ot].shorts.push(t);
      else if ((t.spread_role || "").includes("LONG")) _sgMap[ot].longs.push(t);
    }

    // Build spread descriptors: pair 1st SHORT with 1st LONG per time group,
    // then fall back to positional pairing if a group has unbalanced legs.
    const spreadGroups = [];
    for (const ot of _sgTimes) {
      const grp = _sgMap[ot];
      const count = Math.min(grp.shorts.length, grp.longs.length);
      for (let i = 0; i < count; i++) {
        spreadGroups.push({ short: grp.shorts[i], long: grp.longs[i] });
      }
    }

    const spotEntry   = shorts[0].nifty_spot_entry ?? null;
    const spotClose   = shorts[0].nifty_spot_close ?? null;
    const allStrikes  = [...shorts.map(s => s.strike), ...longs.map(l => l.strike)];
    const midStrike   = (Math.min(...allStrikes) + Math.max(...allStrikes)) / 2;
    const displaySpot = spotClose ?? spotEntry ?? midStrike;

    if (spreadGroups.length === 1) {
      // Single spread — use the existing detailed chart (preserves hover, spot markers)
      const sp = spreadGroups[0];
      const shortStrike = sp.short.strike;
      const longStrike  = sp.long.strike;
      const nc          = sp.short.entry_price - sp.long.entry_price;
      const qty         = Math.abs(sp.short.qty);
      setTimeout(() => {
        drawBearCallPayoff("session-payoff-chart", shortStrike, longStrike, nc, qty, displaySpot, false);
        setTimeout(() => _addSessionSpotMarkers("session-payoff-chart", spotEntry, spotClose, shortStrike, longStrike, nc, qty), 120);
        if (sessionPnl != null) setTimeout(() => _addRealizedLine("session-payoff-chart", sessionPnl), 130);
      }, 0);
    } else {
      // Multiple spreads — draw combined payoff with individual overlays
      const spreadsArr = spreadGroups.map(sp => ({
        shortStrike: sp.short.strike,
        longStrike:  sp.long.strike,
        nc:          sp.short.entry_price - sp.long.entry_price,
        qty:         Math.abs(sp.short.qty),
      }));
      setTimeout(() => {
        drawMultiSpreadPayoff("session-payoff-chart", spreadsArr, displaySpot, false);
        if (sessionPnl != null) setTimeout(() => _addRealizedLine("session-payoff-chart", sessionPnl), 130);
      }, 0);
    }
  }

  return panel;
}
