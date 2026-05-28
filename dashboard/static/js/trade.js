"use strict";

// ── Trade Detail ──────────────────────────────────────────────
function buildTradeDetailPanel() {
  const panel = el("div", { class: "panel", id: "trade-detail-panel" });

  const session = state.sessions.find(s => s.date === state.selectedDate);
  const sessionPnl = session?.pnl ?? 0;

  // Find expiry from trades
  const expiry = state.trades.length ? state.trades[0].expiry : null;

  const header = el("div", { class: "panel-header" },
    el("div", { class: "flex items-center gap-8" },
      el("span", { class: "panel-title" }, fmtDate(state.selectedDate)),
      expiry ? el("span", { class: "detail-expiry" }, `Expiry: ${fmtDate(expiry)}`) : null
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

    const tbody = el("tbody", {});
    for (const t of state.trades) {
      const pnl = t.leg_pnl ?? 0;
      const expiryShort = t.expiry_date ? (() => {
        const m = t.expiry_date.match(/\d{4}-(\d{2})-(\d{2})/);
        const mon = ["","Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
        return m ? `${parseInt(m[2])} ${mon[parseInt(m[1])]}` : "—";
      })() : "—";
      const tr = el("tr", {},
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
      tbody.appendChild(tr);
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

    const sessionPayoffWrap = el("div", { class: "payoff-canvas-wrap", style: "margin-bottom:16px;" });
    const sessionPayoffCanvas = el("canvas", { id: "session-payoff-chart" });
    sessionPayoffWrap.appendChild(sessionPayoffCanvas);
    body.appendChild(sessionPayoffWrap);

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
    const shortStrike = shorts[0].strike;
    const longStrike  = longs[0].strike;
    const nc          = shorts[0].entry_price - longs[0].entry_price;
    const qty         = Math.abs(shorts[0].qty);
    const spotEntry   = shorts[0].nifty_spot_entry ?? null;
    const spotClose   = shorts[0].nifty_spot_close ?? null;
    const displaySpot = spotClose ?? spotEntry ?? (shortStrike + (longStrike - shortStrike) / 2);
    setTimeout(() => {
      drawBearCallPayoff("session-payoff-chart", shortStrike, longStrike, nc, qty, displaySpot);
      setTimeout(() => _addSessionSpotMarkers("session-payoff-chart", spotEntry, spotClose, shortStrike, longStrike, nc, qty), 120);
    }, 0);
  }

  return panel;
}
