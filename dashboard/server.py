"""
server.py — Flask REST API for the multi-strategy trading dashboard.

Auto-discovers strategies under strategies/ by scanning for metadata.json
files, then exposes computed session / trade / summary data via a JSON API.
"""

from __future__ import annotations

import json
import logging
import os
import time
import traceback
from pathlib import Path

import sys
from flask import Flask, Response, jsonify, send_from_directory

# ---------------------------------------------------------------------------
# Engine import  (server.py lives inside dashboard/, add it to path)
# ---------------------------------------------------------------------------
sys.path.insert(0, str(Path(__file__).resolve().parent))
from engine.spread_engine import compute_strategy_data  # noqa: E402

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
)
log = logging.getLogger("dashboard.server")

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
# server.py lives at  <project>/dashboard/server.py
# strategies/ lives at <project>/strategies/
_SERVER_DIR = Path(__file__).resolve().parent          # …/dashboard
_PROJECT_ROOT = _SERVER_DIR.parent                     # …/algo-trade-os
_STRATEGIES_ROOT = _PROJECT_ROOT / "strategies"
_STATIC_DIR = _SERVER_DIR / "static"

# ---------------------------------------------------------------------------
# Flask app
# ---------------------------------------------------------------------------
app = Flask(__name__, static_folder=str(_STATIC_DIR))


# ---------------------------------------------------------------------------
# CORS helper — attach to every response
# ---------------------------------------------------------------------------
@app.after_request
def _add_cors(response: Response) -> Response:
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    response.headers["Access-Control-Allow-Methods"] = "GET, OPTIONS"
    return response


# ---------------------------------------------------------------------------
# Strategy discovery
# ---------------------------------------------------------------------------
_STRATEGY_REFRESH_INTERVAL = 60  # seconds

_strategies: dict[str, dict] = {}       # id → metadata dict
_strategies_last_scanned: float = 0.0


def _scan_strategies() -> None:
    """Walk strategies/ and collect all metadata.json entries."""
    global _strategies, _strategies_last_scanned
    found: dict[str, dict] = {}
    for meta_path in _STRATEGIES_ROOT.rglob("metadata.json"):
        try:
            with open(meta_path) as f:
                meta = json.load(f)
            strat_dir = str(meta_path.parent)
            meta.setdefault("_dir", strat_dir)
            sid = meta.get("id") or meta_path.parent.name
            meta["id"] = sid
            found[sid] = meta
            log.debug("Discovered strategy: %s at %s", sid, strat_dir)
        except Exception:
            log.warning("Failed to parse metadata.json at %s", meta_path)

    # If no metadata.json files exist yet, fall back to hard-coded well-known
    # strategy directories that contain a data/ subfolder
    if not found:
        for candidate in _STRATEGIES_ROOT.rglob("data/orders.csv"):
            strat_dir = candidate.parent.parent
            sid = strat_dir.name
            if sid not in found:
                found[sid] = {
                    "id": sid,
                    "name": sid.replace("_", " ").title(),
                    "type": "fo",
                    "capital": 120_000,
                    "_dir": str(strat_dir),
                }
                log.debug("Auto-discovered strategy (no metadata.json): %s", sid)

    _strategies = found
    _strategies_last_scanned = time.time()
    log.info("Strategy scan complete — %d strategies found", len(_strategies))


def _ensure_strategies_fresh() -> None:
    if time.time() - _strategies_last_scanned > _STRATEGY_REFRESH_INTERVAL:
        _scan_strategies()


# ---------------------------------------------------------------------------
# Data cache
# ---------------------------------------------------------------------------
_CACHE_TTL = 30  # seconds
_cache: dict[str, dict] = {}
# cache entry: {data: (sessions, open_pos, summary), computed_at: float, mtime: float}


def _orders_mtime(strat_dir: str) -> float:
    orders_path = Path(strat_dir) / "data" / "orders.csv"
    try:
        return orders_path.stat().st_mtime
    except FileNotFoundError:
        return 0.0


def _get_strategy_data(strategy_id: str) -> tuple[list, list, dict]:
    """Return (sessions, open_positions, summary), using cache when valid."""
    meta = _strategies.get(strategy_id)
    if meta is None:
        raise KeyError(f"Strategy not found: {strategy_id}")

    strat_dir = meta["_dir"]
    capital = float(meta.get("capital", 120_000))
    current_mtime = _orders_mtime(strat_dir)
    now = time.time()

    entry = _cache.get(strategy_id)
    if (
        entry
        and (now - entry["computed_at"]) < _CACHE_TTL
        and entry["mtime"] == current_mtime
    ):
        return entry["data"]

    log.info("Computing strategy data for %s", strategy_id)
    data = compute_strategy_data(strat_dir, capital=capital)
    _cache[strategy_id] = {
        "data": data,
        "computed_at": now,
        "mtime": current_mtime,
    }
    return data


# ---------------------------------------------------------------------------
# Serialisation helpers
# ---------------------------------------------------------------------------
def _serialise_date(d) -> str | None:
    if d is None:
        return None
    if hasattr(d, "isoformat"):
        return d.isoformat()
    return str(d)


def _serialise_session(s: dict) -> dict:
    return {
        "date": _serialise_date(s["session_date"]),
        "pnl": s["session_pnl"],
        "pct": s["session_pct"],
        "month": s["month"],
        "has_legs": s["has_legs"],
        "source": s.get("source", ""),
    }


def _serialise_trade(t: dict) -> dict:
    return {
        "expiry_date": _serialise_date(t.get("expiry_date")),
        "strike": t.get("strike"),
        "option_type": t.get("option_type"),
        "qty": t.get("qty"),
        "entry_price": t.get("entry_price"),
        "exit_price": t.get("exit_price"),
        "leg_pnl": t.get("leg_pnl"),
        "open_date": _serialise_date(t.get("open_date")),
        "open_time": t.get("open_time", ""),
        "close_date": _serialise_date(t.get("close_date")),
        "close_time": t.get("close_time", ""),
        "spread_role": t.get("spread_role"),
        "side": t.get("side") or ("SELL" if "SHORT" in (t.get("spread_role") or "") else "BUY" if t.get("spread_role") else None),
        "nifty_spot_entry": t.get("nifty_spot_entry"),
        "nifty_spot_close": t.get("nifty_spot_close"),
    }


def _serialise_open_position(p: dict) -> dict:
    return {
        "expiry_date": _serialise_date(p.get("expiry_date")),
        "strike": p.get("strike"),
        "option_type": p.get("option_type"),
        "qty": p.get("qty"),
        "entry_price": p.get("entry_price"),
        "spread_role": p.get("spread_role"),
        "open_date": _serialise_date(p.get("open_date")),
        "nifty_spot_entry": p.get("nifty_spot_entry"),
    }


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.route("/")
def index():
    return send_from_directory(str(_STATIC_DIR), "index.html")


@app.route("/<path:filename>")
def static_files(filename):
    return send_from_directory(str(_STATIC_DIR), filename)


@app.route("/api/strategies")
def list_strategies():
    _ensure_strategies_fresh()
    result = []
    for sid, meta in _strategies.items():
        result.append({
            "id": sid,
            "name": meta.get("name", sid),
            "type": meta.get("type", "fo"),
            "spread_type": meta.get("spread_type"),
            "status": meta.get("status", "active"),
        })
    return jsonify(result)


@app.route("/api/strategies/<strategy_id>/summary")
def strategy_summary(strategy_id: str):
    _ensure_strategies_fresh()
    if strategy_id not in _strategies:
        return jsonify({"error": f"Strategy '{strategy_id}' not found"}), 404
    try:
        _, _, summary = _get_strategy_data(strategy_id)
        return jsonify(summary)
    except Exception:
        log.error("Error computing summary for %s:\n%s", strategy_id, traceback.format_exc())
        return jsonify({"error": "Computation failed — see server logs"}), 500


@app.route("/api/strategies/<strategy_id>/sessions")
def strategy_sessions(strategy_id: str):
    _ensure_strategies_fresh()
    if strategy_id not in _strategies:
        return jsonify({"error": f"Strategy '{strategy_id}' not found"}), 404
    try:
        sessions, _, _ = _get_strategy_data(strategy_id)
        return jsonify([_serialise_session(s) for s in sessions])
    except Exception:
        log.error("Error fetching sessions for %s:\n%s", strategy_id, traceback.format_exc())
        return jsonify({"error": "Computation failed — see server logs"}), 500


@app.route("/api/strategies/<strategy_id>/trades/<session_date>")
def session_trades(strategy_id: str, session_date: str):
    _ensure_strategies_fresh()
    if strategy_id not in _strategies:
        return jsonify({"error": f"Strategy '{strategy_id}' not found"}), 404
    try:
        sessions, _, _ = _get_strategy_data(strategy_id)
        for s in sessions:
            if _serialise_date(s["session_date"]) == session_date:
                trades = s.get("trades", [])
                return jsonify([_serialise_trade(t) for t in trades])
        return jsonify({"error": f"Session '{session_date}' not found"}), 404
    except Exception:
        log.error(
            "Error fetching trades for %s / %s:\n%s",
            strategy_id, session_date, traceback.format_exc()
        )
        return jsonify({"error": "Computation failed — see server logs"}), 500


@app.route("/api/strategies/<strategy_id>/open")
def open_positions(strategy_id: str):
    from datetime import date as _date
    _ensure_strategies_fresh()
    if strategy_id not in _strategies:
        return jsonify({"error": f"Strategy '{strategy_id}' not found"}), 404
    try:
        _, open_pos, _ = _get_strategy_data(strategy_id)
        today = _date.today()
        # Only return positions whose expiry hasn't passed yet
        active = [p for p in open_pos if p.get("expiry_date") and p["expiry_date"] >= today]
        return jsonify([_serialise_open_position(p) for p in active])
    except Exception:
        log.error(
            "Error fetching open positions for %s:\n%s",
            strategy_id, traceback.format_exc()
        )
        return jsonify({"error": "Computation failed — see server logs"}), 500


@app.route("/api/strategies/<strategy_id>/signal")
def strategy_signal(strategy_id: str):
    from engine.signal_engine import generate_signal
    _ensure_strategies_fresh()
    if strategy_id not in _strategies:
        return jsonify({"error": f"Strategy '{strategy_id}' not found"}), 404
    try:
        meta = _strategies[strategy_id]
        strat_dir = meta["_dir"]
        capital = float(meta.get("capital", 120_000))
        sig = generate_signal(strat_dir, capital=capital)
        return jsonify(sig)
    except Exception:
        log.error("Error generating signal for %s:\n%s", strategy_id, traceback.format_exc())
        return jsonify({"error": "Signal generation failed", "action": "MONITOR"}), 500


# ---------------------------------------------------------------------------
# Live NIFTY spot  (yfinance, 15 s server-side cache)
# ---------------------------------------------------------------------------
_nifty_cache: dict = {"data": None, "fetched_at": 0.0}
_NIFTY_CACHE_TTL = 15  # seconds


@app.route("/api/nifty/spot")
def nifty_spot():
    global _nifty_cache
    now = time.time()
    if _nifty_cache["data"] and (now - _nifty_cache["fetched_at"]) < _NIFTY_CACHE_TTL:
        return jsonify(_nifty_cache["data"])
    try:
        import yfinance as yf
        fi = yf.Ticker("^NSEI").fast_info
        spot = fi.last_price
        prev = fi.previous_close or spot
        change = round(spot - prev, 2)
        change_pct = round((change / prev) * 100, 2) if prev else 0.0
        data = {
            "spot": round(spot, 2),
            "change": change,
            "change_pct": change_pct,
            "prev_close": round(prev, 2),
        }
        _nifty_cache = {"data": data, "fetched_at": now}
        return jsonify(data)
    except Exception as exc:
        log.warning("Nifty spot fetch failed: %s", exc)
        # Return stale data (200) so frontend degrades gracefully
        if _nifty_cache["data"]:
            return jsonify({**_nifty_cache["data"], "stale": True})
        return jsonify({"spot": None, "error": str(exc)})


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    _scan_strategies()
    app.run(host="0.0.0.0", port=5555, debug=True)
