"use strict";

// ── Calendar ─────────────────────────────────────────────────
function buildCalendarPanel() {
  const panel = el("div", { class: "panel", id: "calendar-panel" });

  const header = el("div", { class: "panel-header" },
    el("span", { class: "panel-title" }, "Session Calendar"),
    el("div", { class: "cal-month-nav" },
      el("button", { class: "cal-nav-btn", id: "cal-prev", title: "Previous month" }, "‹"),
      el("span", { class: "cal-month-label", id: "cal-month-label" }, fmtMonthLabel(state.selectedMonth)),
      el("button", { class: "cal-nav-btn", id: "cal-next", title: "Next month" }, "›")
    )
  );
  panel.appendChild(header);

  const grid = el("div", { class: "calendar-grid", id: "cal-grid" });
  buildCalendarGrid(grid);
  panel.appendChild(grid);

  // Wire up nav buttons after panel is in DOM (use event delegation on the grid)
  // We attach listeners after returning, so use setTimeout 0 or attach here:
  setTimeout(() => {
    const prevBtn = document.getElementById("cal-prev");
    const nextBtn = document.getElementById("cal-next");
    if (prevBtn) {
      const idx = state.months.indexOf(state.selectedMonth);
      prevBtn.disabled = idx <= 0;
      prevBtn.addEventListener("click", () => {
        const i = state.months.indexOf(state.selectedMonth);
        if (i > 0) selectMonth(state.months[i - 1]);
      });
    }
    if (nextBtn) {
      const idx = state.months.indexOf(state.selectedMonth);
      nextBtn.disabled = idx >= state.months.length - 1;
      nextBtn.addEventListener("click", () => {
        const i = state.months.indexOf(state.selectedMonth);
        if (i < state.months.length - 1) selectMonth(state.months[i + 1]);
      });
    }
  }, 0);

  return panel;
}

function buildCalendarGrid(grid) {
  // Day headers Mon-Fri
  const dayHeaders = ["Mon", "Tue", "Wed", "Thu", "Fri"];
  for (const d of dayHeaders) {
    grid.appendChild(el("div", { class: "cal-day-header" }, d));
  }

  const { year, month } = parseMonthKey(state.selectedMonth);

  // Session lookup by date string
  const sessionMap = {};
  for (const s of state.sessions) {
    if (s.month === state.selectedMonth) {
      sessionMap[s.date] = s;
    }
  }

  // Build all week days in the month
  const cells = buildMonthCells(year, month, sessionMap);

  for (const cell of cells) {
    grid.appendChild(cell);
  }
}

function buildMonthCells(year, month, sessionMap) {
  // month is 1-based
  const cells = [];

  // First day of month
  const firstDay = new Date(year, month - 1, 1);
  // Day of week: 0=Sun,1=Mon,...,6=Sat
  let startDow = firstDay.getDay(); // 0=Sun
  // Convert to Mon-based offset (Mon=0,...Fri=4)
  // For Mon-Fri grid: skip weekends
  // We need to figure out which weekday column the 1st falls on
  // If it's Sat or Sun, skip to Monday

  const daysInMonth = new Date(year, month, 0).getDate();

  // Collect all Mon-Fri dates in the month
  const tradingDays = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const dt = new Date(year, month - 1, d);
    const dow = dt.getDay(); // 0=Sun,6=Sat
    if (dow >= 1 && dow <= 5) {
      tradingDays.push(d);
    }
  }

  if (!tradingDays.length) return cells;

  // Determine the weekday (Mon=0,...Fri=4) of the first trading day
  const firstTradingDate = new Date(year, month - 1, tradingDays[0]);
  const firstColIndex = firstTradingDate.getDay() - 1; // 0=Mon,...4=Fri

  // Add empty cells before the first trading day
  for (let i = 0; i < firstColIndex; i++) {
    cells.push(el("div", { class: "cal-cell empty" }));
  }

  // Render all Mon-Fri in the month
  let col = firstColIndex;
  for (const d of tradingDays) {
    const dt = new Date(year, month - 1, d);
    const dowIndex = dt.getDay() - 1; // 0=Mon...4=Fri

    // If there's a gap (holiday skipped days), fill with empties
    while (col < dowIndex || (col === 5)) {
      // This shouldn't happen since we only collected Mon-Fri
      // but guard anyway
      cells.push(el("div", { class: "cal-cell empty" }));
      col = (col + 1) % 5;
    }

    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const session = sessionMap[dateStr];

    let cell;
    if (session) {
      const isWin = session.pnl >= 0;
      const isSelected = state.selectedDate === dateStr;
      cell = el("div", {
        class: ["cal-cell", "session", isWin ? "win" : "loss", isSelected ? "selected" : ""].filter(Boolean).join(" "),
        "data-date": dateStr,
        title: `${fmtDate(dateStr)} — ${fmt(session.pnl)} (${fmtPct(session.pct)})`
      });
      cell.addEventListener("click", () => selectDate(dateStr));

      cell.appendChild(el("div", { class: "cal-date" }, String(d)));
      cell.appendChild(el("div", { class: "cal-pnl " + colorClass(session.pnl) }, fmt(session.pnl)));
      cell.appendChild(el("div", { class: "cal-pct" }, fmtPct(session.pct)));

      // Dot indicator
      const dotRow = el("div", { class: "cal-dot-row" });
      dotRow.appendChild(el("div", { class: "cal-dot " + (session.has_legs ? "blue" : "grey") }));
      cell.appendChild(dotRow);
    } else {
      cell = el("div", {
        class: "cal-cell no-trade",
        title: fmtDate(dateStr) + " — No trade"
      });
      cell.appendChild(el("div", { class: "cal-date" }, String(d)));
    }

    cells.push(cell);
    col = dowIndex + 1;
    if (col >= 5) col = 0;
  }

  return cells;
}

async function selectDate(dateStr) {
  if (state.selectedDate === dateStr) {
    // Toggle off
    state.selectedDate = null;
    state.trades = [];
    refreshCalendarSelection();
    // Remove trade detail panel
    const existing = document.getElementById("trade-detail-panel");
    if (existing) existing.remove();
    return;
  }

  state.selectedDate = dateStr;
  state.trades = [];

  refreshCalendarSelection();

  // Remove old trade detail
  const existing = document.getElementById("trade-detail-panel");
  if (existing) existing.remove();

  // Add loading placeholder
  const main = document.getElementById("main");
  const placeholder = el("div", { class: "panel", id: "trade-detail-panel" },
    el("div", { class: "panel-header" }, el("span", { class: "panel-title" }, "Loading trades…")),
    el("div", { class: "panel-body" },
      el("div", { class: "loading-state", style: "padding:24px;flex:none;" },
        el("div", { class: "spinner" }),
        el("span", {}, "Fetching leg data…")
      )
    )
  );
  main.appendChild(placeholder);
  main.scrollTo({ top: main.scrollHeight, behavior: "smooth" });

  try {
    const trades = await apiFetch(`/api/strategies/${state.activeStrategyId}/trades/${dateStr}`);
    state.trades = trades || [];
  } catch (err) {
    state.trades = [];
  }

  // Replace placeholder
  const panel = document.getElementById("trade-detail-panel");
  if (panel) panel.remove();

  const newPanel = buildTradeDetailPanel();
  document.getElementById("main").appendChild(newPanel);
  newPanel.scrollIntoView({ behavior: "smooth", block: "start" });
}

function refreshCalendarSelection() {
  document.querySelectorAll(".cal-cell.session").forEach(c => {
    c.classList.toggle("selected", c.dataset.date === state.selectedDate);
  });
}

function selectMonth(key) {
  state.selectedMonth = key;
  state.selectedDate = null;
  state.trades = [];

  // Update month button active states
  document.querySelectorAll(".month-btn").forEach(b => {
    b.classList.toggle("active", b.dataset.month === key);
  });

  renderMain();

  setTimeout(() => {
    const cal = document.getElementById("calendar-panel");
    if (cal) {
      const main = document.getElementById("main");
      const calRect = cal.getBoundingClientRect();
      const mainRect = main.getBoundingClientRect();
      // Only scroll if not already in view
      if (calRect.top > mainRect.bottom || calRect.bottom < mainRect.top) {
        cal.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
  }, 80);
}
