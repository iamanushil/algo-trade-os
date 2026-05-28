"use strict";

// ── Main area ─────────────────────────────────────────────────
function showMainLoading() {
  const main = document.getElementById("main");
  main.innerHTML = "";
  main.appendChild(el("div", { class: "loading-state", id: "main-loading" },
    el("div", { class: "spinner" }),
    el("span", {}, "Loading strategy data…")
  ));
}

function showMainError(msg) {
  const main = document.getElementById("main");
  main.innerHTML = "";
  main.appendChild(el("div", { class: "error-state" },
    el("strong", {}, "Could not connect to server. "),
    document.createTextNode("Make sure the Flask server is running at " + API + ". Error: " + msg)
  ));
}

async function renderMain() {
  const main = document.getElementById("main");
  main.innerHTML = "";

  if (!state.summary) {
    main.appendChild(el("div", { class: "empty-state" },
      el("div", { class: "empty-icon" }, "📊"),
      el("div", {}, "No data available")
    ));
    return;
  }

  // Strategy overview cards (only when multiple strategies exist)
  const overview = await buildStrategyOverview();
  if (overview) main.appendChild(overview);

  // Active positions panel
  if (state.openPositions.length > 0) {
    main.appendChild(buildActivePositionPanel());
  }

  // Signal section — inserted prominently before the calendar
  const signalSection = el("div", { id: "signal-section" });
  main.appendChild(signalSection);
  // Kick off signal load after rendering (non-blocking)
  if (state.activeStrategyId) {
    loadSignal(state.activeStrategyId);
  }

  // Calendar panel
  if (state.selectedMonth) {
    main.appendChild(buildCalendarPanel());
  } else {
    main.appendChild(el("div", { class: "empty-state" },
      el("div", { class: "empty-icon" }, "📅"),
      el("div", {}, "No sessions found for this strategy")
    ));
  }

  // Trade detail panel
  if (state.selectedDate !== null) {
    main.appendChild(buildTradeDetailPanel());
  }
}
