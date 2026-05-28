"use strict";

// ── Strategy custom dropdown ──────────────────────────────────
(function () {
  let _open = false;
  let _focusIdx = -1;

  function _options() {
    return Array.from(document.querySelectorAll(".strat-option"));
  }

  function _close() {
    const btn = document.getElementById("strat-btn");
    const panel = document.getElementById("strat-panel");
    if (!btn || !panel) return;
    _open = false;
    _focusIdx = -1;
    panel.classList.remove("open");
    btn.setAttribute("aria-expanded", "false");
    _options().forEach(o => o.classList.remove("focused"));
  }

  function _open_panel() {
    const btn = document.getElementById("strat-btn");
    const panel = document.getElementById("strat-panel");
    if (!btn || !panel) return;
    _open = true;
    panel.classList.add("open");
    btn.setAttribute("aria-expanded", "true");
    // Focus the active option
    const opts = _options();
    _focusIdx = opts.findIndex(o => o.dataset.id === state.activeStrategyId);
    if (_focusIdx < 0) _focusIdx = 0;
    opts.forEach((o, i) => o.classList.toggle("focused", i === _focusIdx));
  }

  function _moveFocus(delta) {
    const opts = _options().filter(o => !o.classList.contains("disabled"));
    if (!opts.length) return;
    const allOpts = _options();
    // find current focused in full list
    const cur = allOpts.findIndex(o => o.classList.contains("focused"));
    // map to enabled list
    const enabledIdx = opts.findIndex(o => o === allOpts[cur]);
    const next = Math.max(0, Math.min(opts.length - 1, enabledIdx + delta));
    _focusIdx = allOpts.indexOf(opts[next]);
    allOpts.forEach((o, i) => o.classList.toggle("focused", i === _focusIdx));
    opts[next].scrollIntoView({ block: "nearest" });
  }

  function _selectFocused() {
    const opts = _options();
    const focused = opts[_focusIdx];
    if (focused && !focused.classList.contains("disabled")) {
      const id = focused.dataset.id;
      _close();
      if (id && id !== state.activeStrategyId) selectStrategy(id);
    }
  }

  function _initListeners() {
    const btn = document.getElementById("strat-btn");
    if (!btn || btn._stratInit) return;
    btn._stratInit = true;

    btn.addEventListener("click", () => { _open ? _close() : _open_panel(); });

    btn.addEventListener("keydown", e => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); _open ? _selectFocused() : _open_panel(); }
      else if (e.key === "ArrowDown") { e.preventDefault(); _open ? _moveFocus(1) : _open_panel(); }
      else if (e.key === "ArrowUp")   { e.preventDefault(); _open ? _moveFocus(-1) : _open_panel(); }
      else if (e.key === "Escape")    { _close(); btn.focus(); }
    });

    document.addEventListener("click", e => {
      if (_open && !document.getElementById("strategy-picker").contains(e.target)) _close();
    }, { capture: true });
  }

  window._stratDropdown = { close: _close, initListeners: _initListeners };
})();

function renderStrategyDropdown() {
  const btn = document.getElementById("strat-btn");
  const panel = document.getElementById("strat-panel");
  const label = document.getElementById("strat-label");
  if (!btn || !panel || !label) return;

  window._stratDropdown.initListeners();

  panel.innerHTML = "";

  if (!state.strategies.length) {
    const empty = document.createElement("div");
    empty.className = "strat-empty";
    empty.textContent = "No strategies found";
    panel.appendChild(empty);
    label.textContent = "No strategies";
    return;
  }

  for (const s of state.strategies) {
    const isActive = s.id === state.activeStrategyId;
    const isDisabled = s.status === "coming_soon";
    const displayName = isDisabled ? s.name + " (soon)" : s.name;

    const row = document.createElement("div");
    row.className = "strat-option" + (isActive ? " active" : "") + (isDisabled ? " disabled" : "");
    row.dataset.id = s.id;
    row.setAttribute("role", "option");
    row.setAttribute("aria-selected", isActive ? "true" : "false");
    row.tabIndex = -1;

    const nameEl = document.createElement("span");
    nameEl.className = "strat-option-name";
    nameEl.textContent = displayName;

    const badge = document.createElement("span");
    const typeKey = (s.type || "").toLowerCase();
    const badgeClass = typeKey.includes("fo") || typeKey.includes("f&o") || typeKey.includes("option") || typeKey.includes("future")
      ? "fo" : typeKey.includes("eq") || typeKey.includes("equity") ? "eq" : "";
    badge.className = "strat-type-badge" + (badgeClass ? " " + badgeClass : "");
    badge.textContent = badgeClass === "fo" ? "FO" : badgeClass === "eq" ? "EQ" : (s.type || "—").toUpperCase().slice(0, 4);

    row.appendChild(nameEl);
    row.appendChild(badge);
    panel.appendChild(row);

    if (!isDisabled) {
      row.addEventListener("click", () => {
        window._stratDropdown.close();
        if (s.id !== state.activeStrategyId) selectStrategy(s.id);
      });
    }

    if (isActive) {
      label.textContent = s.name;
      _updateSpreadTypeChip(s);
    }
  }

  // If no active strategy label was set yet
  if (!state.activeStrategyId && state.strategies.length) {
    label.textContent = state.strategies[0].name;
  }
}

function _updateSpreadTypeChip(strat) {
  const chip = document.getElementById("header-spread-type");
  if (!chip) return;
  const text = _buildStratTagText(strat);
  if (text) {
    chip.textContent = text;
    chip.style.display = "";
  } else {
    chip.style.display = "none";
  }
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
