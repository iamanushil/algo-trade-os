"use strict";

// ── Strategy dropdown ─────────────────────────────────────────
function renderStrategyDropdown() {
  const select = document.getElementById("strategy-select");
  if (!select) return;

  // Rebuild options only when the strategy list changes
  select.innerHTML = "";

  if (!state.strategies.length) {
    const opt = document.createElement("option");
    opt.textContent = "No strategies found";
    opt.disabled = true;
    select.appendChild(opt);
    return;
  }

  for (const s of state.strategies) {
    const opt = document.createElement("option");
    opt.value = s.id;
    opt.textContent = s.status === "coming_soon" ? s.name + " (soon)" : s.name;
    opt.disabled = s.status === "coming_soon";
    if (s.id === state.activeStrategyId) opt.selected = true;
    select.appendChild(opt);
  }

  // Remove any pre-existing listener by replacing the element clone trick
  const fresh = select.cloneNode(true);
  select.parentNode.replaceChild(fresh, select);
  fresh.addEventListener("change", () => {
    const id = fresh.value;
    if (id && id !== state.activeStrategyId) {
      selectStrategy(id);
    }
  });
}

// ── Select strategy ───────────────────────────────────────────
async function selectStrategy(id) {
  state.activeStrategyId = id;
  state.summary = null;
  state.sessions = [];
  state.openPositions = [];
  state.months = [];
  state.selectedMonth = null;
  state.selectedDate = null;
  state.trades = [];

  renderStrategyDropdown();
  showMainLoading();
  renderSidebarSkeleton();

  document.getElementById("header-pnl").textContent = "—";
  document.getElementById("header-pnl").className = "";
  document.getElementById("header-pct").textContent = "";

  try {
    const [summary, sessions, openPositions] = await Promise.all([
      apiFetch(`/api/strategies/${id}/summary`),
      apiFetch(`/api/strategies/${id}/sessions`),
      apiFetch(`/api/strategies/${id}/open`),
    ]);

    state.summary = summary;
    state.sessions = sessions || [];
    state.openPositions = openPositions || [];

    // Build sorted month list (chronological, not alphabetical)
    const monthSet = new Set(state.sessions.map(s => s.month));
    state.months = Array.from(monthSet).sort((a, b) => {
      const pa = parseMonthKey(a), pb = parseMonthKey(b);
      return (pa.year * 12 + pa.month) - (pb.year * 12 + pb.month);
    });

    // Default to latest month
    state.selectedMonth = state.months.length ? state.months[state.months.length - 1] : null;

    updateHeaderPnl();
    renderSidebarOverall();
    renderSidebarMonths();
    renderMain();
    scheduleSignalRefresh(id);
  } catch (err) {
    showMainError(err.message);
  }
}

async function buildStrategyOverview() {
  if (state.strategies.length <= 1) return null;

  const capturedId = state.activeStrategyId;
  const grid = el("div", { class: "strategy-cards-grid" });

  const results = await Promise.allSettled(
    state.strategies.map(s =>
      apiFetch(`/api/strategies/${s.id}/summary`).then(d => ({ id: s.id, name: s.name, type: s.type, ...d }))
    )
  );

  // Bail if strategy changed during fetch
  if (state.activeStrategyId !== capturedId) return null;

  for (const result of results) {
    if (result.status !== "fulfilled") continue;
    const d = result.value;
    const isActive = d.id === state.activeStrategyId;

    const sigBadge = el("span", {
      class: "signal-badge loading",
      style: "font-size:11px;padding:3px 10px;letter-spacing:0.5px;"
    }, "…");

    const card = el("div", { class: "strategy-card" + (isActive ? " active" : "") },
      el("div", { class: "strategy-card-header" },
        el("div", {},
          el("div", { class: "strategy-card-name" }, d.name),
          el("div", { class: "strategy-card-type" }, d.type || "Options F&O")
        ),
        sigBadge
      ),
      el("div", { class: "strategy-card-pnl " + colorClass(d.total_pnl) }, fmt(d.total_pnl)),
      el("div", { class: "text-muted text-sm" }, fmtPct(d.total_pct) + " return"),
      el("div", { class: "strategy-card-stats" },
        el("div", {},
          el("div", { class: "strategy-card-stat-label" }, "Sessions"),
          el("div", { class: "strategy-card-stat-value" }, String(d.sessions_count ?? "—"))
        ),
        el("div", {},
          el("div", { class: "strategy-card-stat-label" }, "Win Rate"),
          el("div", { class: "strategy-card-stat-value gold" }, d.win_rate != null ? d.win_rate.toFixed(1) + "%" : "—")
        ),
        el("div", {},
          el("div", { class: "strategy-card-stat-label" }, "W / L"),
          el("div", { class: "strategy-card-stat-value" }, `${d.wins ?? 0} / ${d.losses ?? 0}`)
        )
      )
    );

    card.addEventListener("click", () => selectStrategy(d.id));
    grid.appendChild(card);

    // Async: fetch signal badge (fire-and-forget)
    apiFetch(`/api/strategies/${d.id}/signal`).then(sig => {
      const a = sig.action || "MONITOR";
      sigBadge.className = `signal-badge ${a}`;
      sigBadge.style.fontSize = "11px";
      sigBadge.style.padding = "3px 10px";
      sigBadge.textContent = a;
    }).catch(() => { sigBadge.textContent = "—"; });
  }

  return grid;
}
