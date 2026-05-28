"use strict";

// ── Sidebar ───────────────────────────────────────────────────
function renderSidebarSkeleton() {
  document.getElementById("sidebar-overall").innerHTML = `
    <div class="skeleton skeleton-line" style="width:100%;height:60px;margin-bottom:12px;border-radius:8px;"></div>
    <div class="skeleton skeleton-line" style="width:80%;"></div>
    <div class="skeleton skeleton-line" style="width:90%;"></div>
    <div class="skeleton skeleton-line" style="width:70%;"></div>
    <div class="skeleton skeleton-line" style="width:85%;"></div>
  `;
  document.getElementById("sidebar-months").innerHTML = `
    <div class="skeleton skeleton-line"></div>
    <div class="skeleton skeleton-line"></div>
    <div class="skeleton skeleton-line"></div>
  `;
}

function renderSidebarOverall() {
  const s = state.summary;
  if (!s) return;

  const overall = document.getElementById("sidebar-overall");
  overall.innerHTML = "";

  const totalBlock = el("div", { class: "total-pnl-block" },
    el("div", { class: "big-num " + colorClass(s.total_pnl) }, fmt(s.total_pnl)),
    el("div", { class: "sub" }, fmtPct(s.total_pct) + " total return")
  );
  overall.appendChild(totalBlock);

  const rows = [
    ["Sessions", s.sessions_count],
    ["Win Rate", { val: s.win_rate.toFixed(1) + "%", cls: "gold" }],
    ["W / L", `${s.wins} / ${s.losses}`],
    ["Best Day", { val: fmt(s.best_session?.pnl ?? 0), cls: "green" }],
    ["Worst Day", { val: fmt(s.worst_session?.pnl ?? 0), cls: "red" }],
    ["First Session", fmtDate(s.first_session)],
    ["Last Session", fmtDate(s.last_session)],
  ];

  for (const [label, value] of rows) {
    const row = el("div", { class: "metric-row" });
    row.appendChild(el("span", { class: "metric-label" }, label));
    if (typeof value === "object" && value !== null && value.val !== undefined) {
      row.appendChild(el("span", { class: "metric-value " + value.cls }, value.val));
    } else {
      row.appendChild(el("span", { class: "metric-value" }, String(value)));
    }
    overall.appendChild(row);
  }

}

function renderSidebarMonths() {
  const container = document.getElementById("sidebar-months");
  container.innerHTML = "";

  const monthMap = {};
  for (const m of (state.summary?.monthly || [])) {
    monthMap[m.month] = m;
  }

  if (!state.months.length) {
    container.appendChild(el("div", { class: "text-muted text-sm" }, "No data"));
    return;
  }

  // Show months in reverse chronological order
  const sorted = [...state.months].reverse();
  for (const key of sorted) {
    const data = monthMap[key];
    const pnl = data?.pnl ?? 0;
    const btn = el("button", {
      class: "month-btn" + (key === state.selectedMonth ? " active" : ""),
      "data-month": key,
    },
      el("span", { class: "month-name" }, fmtMonthLabel(key)),
      el("span", { class: "month-pnl " + colorClass(pnl) }, fmt(pnl))
    );
    btn.addEventListener("click", () => selectMonth(key));
    container.appendChild(btn);
  }
}

function updateHeaderPnl() {
  if (!state.summary) return;
  const pnl = state.summary.total_pnl;
  const pct = state.summary.total_pct;
  const hPnl = document.getElementById("header-pnl");
  const hPct = document.getElementById("header-pct");
  hPnl.textContent = fmt(pnl);
  hPnl.className = colorClass(pnl);
  hPct.textContent = fmtPct(pct);
}
