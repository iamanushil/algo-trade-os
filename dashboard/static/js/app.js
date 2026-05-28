"use strict";

// ── Bootstrap ─────────────────────────────────────────────────
async function init() {
  try {
    const strategies = await apiFetch("/api/strategies");
    state.strategies = strategies || [];

    renderStrategyDropdown();

    // Select first active strategy
    const first = state.strategies.find(s => s.status !== "coming_soon") || state.strategies[0];
    if (first) {
      await selectStrategy(first.id);
    } else {
      showMainError("No strategies found from API.");
    }
  } catch (err) {
    document.getElementById("sidebar-overall").innerHTML =
      `<div class="error-state" style="font-size:12px;">${err.message}</div>`;
    showMainError(err.message);
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  await init();
  startNiftyPolling(); // start live NIFTY after strategy loads
});
