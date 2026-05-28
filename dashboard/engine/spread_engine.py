"""
spread_engine.py — FIFO-based P&L engine for credit spread strategies.

Processes orders.csv to compute realized leg trades via FIFO matching per
(expiry_date, strike), then merges with session_calendar.csv to produce
final session list, open positions, and summary statistics.
"""

from __future__ import annotations

import json
import os
from collections import deque
from datetime import date, timedelta
from pathlib import Path
from typing import Any

import pandas as pd


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _load_orders(orders_path: str) -> pd.DataFrame:
    """Load and normalise orders.csv."""
    df = pd.read_csv(orders_path)
    df.columns = df.columns.str.strip()
    df["datetime_ist"] = pd.to_datetime(df["datetime_ist"])
    df["expiry_date"] = pd.to_datetime(df["expiry_date"]).dt.date
    df["strike"] = df["strike"].astype(int)
    df["qty"] = df["qty"].astype(int)
    df["price"] = df["price"].astype(float)
    df["side"] = df["side"].str.upper().str.strip()
    df["option_type"] = df["option_type"].str.upper().str.strip()
    if "nifty_spot" in df.columns:
        df["nifty_spot"] = pd.to_numeric(df["nifty_spot"], errors="coerce")
    else:
        df["nifty_spot"] = float("nan")
    df = df.sort_values("order_id").reset_index(drop=True)
    return df


def _load_session_calendar(cal_path: str) -> pd.DataFrame:
    """Load and normalise session_calendar.csv; return empty df if missing."""
    if not os.path.exists(cal_path):
        return pd.DataFrame(
            columns=["session_date", "session_pnl", "session_pct",
                     "month", "has_leg_data", "source"]
        )
    df = pd.read_csv(cal_path)
    df.columns = df.columns.str.strip()
    df["session_date"] = pd.to_datetime(df["session_date"]).dt.date
    df["session_pnl"] = df["session_pnl"].astype(float)
    df["session_pct"] = df["session_pct"].astype(float)
    return df


# ---------------------------------------------------------------------------
# FIFO matching
# ---------------------------------------------------------------------------

def _fifo_match(orders: pd.DataFrame) -> tuple[list[dict], list[dict]]:
    """
    Match orders FIFO per (expiry_date, strike).

    Returns
    -------
    realized : list of closed trade dicts
    open_pos : list of open (unmatched) position dicts
    """
    # inventory: (expiry_date, strike) -> deque of lots
    # Each lot: {side, option_type, qty, price, open_date}
    inventory: dict[tuple, deque] = {}
    realized: list[dict] = []

    for _, row in orders.iterrows():
        key = (row["expiry_date"], row["strike"])
        q = inventory.setdefault(key, deque())

        incoming_side = row["side"]
        incoming_qty = row["qty"]
        incoming_price = row["price"]
        incoming_dt = row["datetime_ist"]
        incoming_date = incoming_dt.date()
        incoming_time = incoming_dt.strftime("%H:%M")
        opt_type = row["option_type"]

        if not q or q[0]["side"] == incoming_side:
            # Same direction — add to inventory
            q.append({
                "side": incoming_side,
                "option_type": opt_type,
                "qty": incoming_qty,
                "price": incoming_price,
                "open_date": incoming_date,
                "open_time": incoming_time,
                "nifty_spot": row["nifty_spot"] if not pd.isna(row["nifty_spot"]) else None,
            })
        else:
            # Opposite side — FIFO close
            remaining = incoming_qty
            while remaining > 0 and q:
                top = q[0]
                match_qty = min(top["qty"], remaining)

                if top["side"] == "SELL":
                    leg_pnl = (top["price"] - incoming_price) * match_qty
                    spread_role = "SHORT_LEG"
                    entry_price = top["price"]
                    exit_price = incoming_price
                else:
                    leg_pnl = (incoming_price - top["price"]) * match_qty
                    spread_role = "LONG_LEG"
                    entry_price = top["price"]
                    exit_price = incoming_price

                realized.append({
                    "expiry_date": row["expiry_date"],
                    "strike": int(row["strike"]),
                    "option_type": opt_type,
                    "qty": match_qty,
                    "entry_price": entry_price,
                    "exit_price": exit_price,
                    "leg_pnl": round(leg_pnl, 2),
                    "open_date": top["open_date"],
                    "open_time": top.get("open_time", ""),
                    "close_date": incoming_date,
                    "close_time": incoming_time,
                    "spread_role": spread_role,
                    "nifty_spot_entry": top.get("nifty_spot"),
                    "nifty_spot_close": row["nifty_spot"] if not pd.isna(row["nifty_spot"]) else None,
                })

                remaining -= match_qty
                if match_qty == top["qty"]:
                    q.popleft()
                else:
                    top["qty"] -= match_qty

            # If any remaining qty after exhausting opposite inventory, open new
            if remaining > 0:
                q.append({
                    "side": incoming_side,
                    "option_type": opt_type,
                    "qty": remaining,
                    "price": incoming_price,
                    "open_date": incoming_date,
                    "open_time": incoming_time,
                    "nifty_spot": row["nifty_spot"] if not pd.isna(row["nifty_spot"]) else None,
                })

    # Collect open positions
    open_pos: list[dict] = []
    for (expiry_date, strike), q in inventory.items():
        for lot in q:
            open_pos.append({
                "expiry_date": expiry_date,
                "strike": strike,
                "option_type": lot["option_type"],
                "qty": lot["qty"],
                "entry_price": lot["price"],
                "spread_role": "SHORT_LEG" if lot["side"] == "SELL" else "LONG_LEG",
                "open_date": lot["open_date"],
                "open_time": lot.get("open_time", ""),
                "nifty_spot_entry": lot.get("nifty_spot"),
            })

    return realized, open_pos


# ---------------------------------------------------------------------------
# Session computation
# ---------------------------------------------------------------------------

def _build_fifo_sessions(
    realized: list[dict], capital: float
) -> dict[date, dict]:
    """
    Group realized trades by close_date → fifo session per date.
    Returns dict keyed by session_date.
    """
    sessions: dict[date, dict] = {}
    for trade in realized:
        d = trade["close_date"]
        if d not in sessions:
            sessions[d] = {"trades": [], "session_pnl": 0.0}
        sessions[d]["trades"].append(trade)
        sessions[d]["session_pnl"] += trade["leg_pnl"]

    for d, s in sessions.items():
        s["session_pnl"] = round(s["session_pnl"], 2)
        s["session_pct"] = round(s["session_pnl"] / capital * 100, 2)

    return sessions


def _derive_month(d: date) -> str:
    """Return 'Mon-YYYY' label matching the session_calendar format."""
    months = [
        "Jan", "Feb", "Mar", "Apr", "May", "Jun",
        "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ]
    return f"{months[d.month - 1]}-{d.year}"


# ---------------------------------------------------------------------------
# Merge logic
# ---------------------------------------------------------------------------

def _merge_sessions(
    fifo_sessions: dict[date, dict],
    cal_df: pd.DataFrame,
    capital: float,
) -> list[dict]:
    """
    Merge FIFO sessions with session_calendar rows.

    Priority / rules:
    - Dates only in calendar (has_leg_data=N or not in FIFO) → calendar P&L, no legs
    - Dates in BOTH → calendar P&L (trusted), attach FIFO leg detail
    - Dates only in FIFO → FIFO data
    """
    all_dates: set[date] = set(fifo_sessions.keys())

    cal_by_date: dict[date, dict] = {}
    if not cal_df.empty:
        for _, row in cal_df.iterrows():
            cal_by_date[row["session_date"]] = row.to_dict()
            all_dates.add(row["session_date"])

    result: list[dict] = []
    for d in sorted(all_dates):
        in_fifo = d in fifo_sessions
        in_cal = d in cal_by_date

        if in_cal and not in_fifo:
            # Pure calendar fallback — no leg data
            cal = cal_by_date[d]
            result.append({
                "session_date": d,
                "session_pnl": round(float(cal["session_pnl"]), 2),
                "session_pct": round(float(cal["session_pct"]), 2),
                "month": cal.get("month", _derive_month(d)),
                "has_legs": False,
                "trades": [],
                "source": cal.get("source", "CALENDAR"),
            })

        elif in_cal and in_fifo:
            # Calendar P&L is authoritative; attach FIFO trades
            cal = cal_by_date[d]
            fifo = fifo_sessions[d]
            result.append({
                "session_date": d,
                "session_pnl": round(float(cal["session_pnl"]), 2),
                "session_pct": round(float(cal["session_pct"]), 2),
                "month": cal.get("month", _derive_month(d)),
                "has_legs": True,
                "trades": fifo["trades"],
                "source": cal.get("source", "DHAN_PNL"),
            })

        else:
            # Only in FIFO
            fifo = fifo_sessions[d]
            result.append({
                "session_date": d,
                "session_pnl": fifo["session_pnl"],
                "session_pct": fifo["session_pct"],
                "month": _derive_month(d),
                "has_legs": True,
                "trades": fifo["trades"],
                "source": "FIFO",
            })

    return result


# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------

def _build_summary(sessions: list[dict], capital: float) -> dict[str, Any]:
    """Compute aggregate summary statistics from merged session list."""
    if not sessions:
        return {
            "total_pnl": 0.0,
            "total_pct": 0.0,
            "sessions_count": 0,
            "wins": 0,
            "losses": 0,
            "win_rate": 0.0,
            "best_session": None,
            "worst_session": None,
            "first_session": None,
            "last_session": None,
            "monthly": [],
        }

    total_pnl = round(sum(s["session_pnl"] for s in sessions), 2)
    total_pct = round(total_pnl / capital * 100, 2)
    wins = sum(1 for s in sessions if s["session_pnl"] > 0)
    losses = sum(1 for s in sessions if s["session_pnl"] < 0)
    win_rate = round(wins / len(sessions) * 100, 2) if sessions else 0.0

    best = max(sessions, key=lambda s: s["session_pnl"])
    worst = min(sessions, key=lambda s: s["session_pnl"])

    # Monthly breakdown
    monthly_map: dict[str, dict] = {}
    for s in sessions:
        m = s["month"]
        if m not in monthly_map:
            monthly_map[m] = {"month": m, "pnl": 0.0, "sessions": 0, "wins": 0, "losses": 0}
        monthly_map[m]["pnl"] += s["session_pnl"]
        monthly_map[m]["sessions"] += 1
        if s["session_pnl"] > 0:
            monthly_map[m]["wins"] += 1
        elif s["session_pnl"] < 0:
            monthly_map[m]["losses"] += 1

    monthly = []
    for v in monthly_map.values():
        v["pnl"] = round(v["pnl"], 2)
        v["pct"] = round(v["pnl"] / capital * 100, 2)
        monthly.append(v)

    return {
        "total_pnl": total_pnl,
        "total_pct": total_pct,
        "sessions_count": len(sessions),
        "wins": wins,
        "losses": losses,
        "win_rate": win_rate,
        "best_session": {
            "date": best["session_date"].isoformat(),
            "pnl": best["session_pnl"],
            "pct": best["session_pct"],
        },
        "worst_session": {
            "date": worst["session_date"].isoformat(),
            "pnl": worst["session_pnl"],
            "pct": worst["session_pct"],
        },
        "first_session": sessions[0]["session_date"].isoformat(),
        "last_session": sessions[-1]["session_date"].isoformat(),
        "monthly": monthly,
    }


# ---------------------------------------------------------------------------
# Exit classification
# ---------------------------------------------------------------------------

def _classify_exit(session: dict) -> dict:
    """Classify exit type and capture % for a session."""
    trades = session.get("trades", [])
    if not trades:
        return {"exit_type": None, "capture_pct": None, "dte_at_exit": None}

    expiry_dates = [t["expiry_date"] for t in trades if t.get("expiry_date")]
    close_dates  = [t["close_date"]  for t in trades if t.get("close_date")]
    if not expiry_dates or not close_dates:
        return {"exit_type": None, "capture_pct": None, "dte_at_exit": None}

    max_expiry  = max(expiry_dates)
    min_close   = min(close_dates)
    dte_at_exit = (max_expiry - min_close).days

    # Max theoretical P&L = sum(net_credit × qty) per spread pair (matched by open_time)
    shorts = [t for t in trades if t.get("spread_role") == "SHORT_LEG"]
    longs  = [t for t in trades if t.get("spread_role") == "LONG_LEG"]
    max_possible = 0.0
    for s in shorts:
        ot = s.get("open_time", "")
        match = next((l for l in longs if l.get("open_time") == ot), None)
        if match:
            nc = s["entry_price"] - match["entry_price"]
            if nc > 0:
                max_possible += nc * s["qty"]

    session_pnl = session.get("session_pnl", 0.0)
    capture_pct = round(session_pnl / max_possible * 100, 1) if max_possible > 0 else None

    if dte_at_exit == 0:
        exit_type = "held_to_expiry"
    elif session_pnl < 0:
        exit_type = "rolled"
    elif capture_pct is not None and capture_pct >= 30:
        exit_type = "profit_booked"
    else:
        exit_type = "early_exit"

    return {"exit_type": exit_type, "capture_pct": capture_pct, "dte_at_exit": dte_at_exit}


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def compute_strategy_data(
    strategy_dir: str,
    capital: float = 120_000,
) -> tuple[list[dict], list[dict], dict]:
    """
    Compute sessions, open positions, and summary for a credit spread strategy.

    Parameters
    ----------
    strategy_dir : str
        Absolute path to the strategy directory (must contain data/ subdir).
    capital : float
        Notional capital for pct calculations (default ₹1,20,000).

    Returns
    -------
    sessions : list[dict]
        Each dict: session_date(date), session_pnl, session_pct, month,
        has_legs(bool), trades(list), source(str)
    open_positions : list[dict]
        Each dict: expiry_date(date), strike, option_type, qty,
        entry_price, spread_role, open_date(date)
    summary : dict
        Aggregate stats — see _build_summary for keys.
    """
    data_dir = Path(strategy_dir) / "data"
    orders_path = data_dir / "orders.csv"
    cal_path = data_dir / "session_calendar.csv"

    # Load orders (required)
    orders = _load_orders(str(orders_path))

    # FIFO matching
    realized, open_positions = _fifo_match(orders)

    # Build FIFO session map
    fifo_sessions = _build_fifo_sessions(realized, capital)

    # Load calendar (optional)
    cal_df = _load_session_calendar(str(cal_path))

    # Merge
    sessions = _merge_sessions(fifo_sessions, cal_df, capital)

    # Classify exits
    for s in sessions:
        if s.get("has_legs"):
            s.update(_classify_exit(s))
        else:
            s["exit_type"] = None
            s["capture_pct"] = None
            s["dte_at_exit"] = None

    # Summary
    summary = _build_summary(sessions, capital)

    return sessions, open_positions, summary
