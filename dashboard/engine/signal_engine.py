"""
signal_engine.py — Live market signal generator for NIFTY credit spread strategies.

Fetches NIFTY spot price and 5-day trend via yfinance, attempts NSE option chain
for PCR and max pain, then returns a structured signal dict for the dashboard API.
"""

from __future__ import annotations

import json
import math
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Any

try:
    import yfinance as yf
    _YF_AVAILABLE = True
except ImportError:
    _YF_AVAILABLE = False

_IST = timezone(timedelta(hours=5, minutes=30))
_LOT_SIZE = 65


def _ist_now() -> str:
    return datetime.now(_IST).replace(tzinfo=None).isoformat(timespec="seconds")


def _next_weekly_expiry() -> str:
    """Next NIFTY weekly expiry date (Tuesdays since NSE 2024 change)."""
    now = datetime.now(_IST)
    days_to_tuesday = (1 - now.weekday()) % 7  # Tuesday = weekday 1
    if days_to_tuesday == 0:
        # Today is Tuesday — if past 3:30 PM IST use next week
        if now.hour > 15 or (now.hour == 15 and now.minute >= 30):
            days_to_tuesday = 7
    expiry = (now + timedelta(days=days_to_tuesday)).date()
    return expiry.isoformat()


def _fetch_spot() -> tuple[float, float]:
    """Return (spot_price, day_change_pct). Raises on failure."""
    ticker = yf.Ticker("^NSEI")
    info = ticker.fast_info
    price = float(info.last_price)
    prev_close = float(info.previous_close)
    change_pct = round((price - prev_close) / prev_close * 100, 2) if prev_close else 0.0
    return price, change_pct


def _fetch_trend() -> str:
    """Return BULLISH / BEARISH / NEUTRAL based on 5-day OHLCV direction."""
    hist = yf.download("^NSEI", period="5d", interval="1d", progress=False, auto_adjust=True)
    if hist.empty or len(hist) < 2:
        return "NEUTRAL"
    first_close = float(hist["Close"].iloc[0])
    last_close = float(hist["Close"].iloc[-1])
    change = (last_close - first_close) / first_close * 100
    if change > 0.5:
        return "BULLISH"
    if change < -0.5:
        return "BEARISH"
    return "NEUTRAL"


def _fetch_option_chain() -> dict | None:
    """
    Attempt to fetch NSE option chain. Returns raw decoded JSON or None if blocked.
    NSE requires a live browser session cookie, so this will often return None in
    headless/server environments — callers must handle the None path.
    """
    try:
        import urllib.request
        url = "https://www.nseindia.com/api/option-chain-indices?symbol=NIFTY"
        headers = {
            "User-Agent": "Mozilla/5.0",
            "Accept": "application/json",
            "Referer": "https://www.nseindia.com/option-chain",
        }
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=8) as resp:
            if resp.status != 200:
                return None
            raw = json.loads(resp.read().decode())
        if "filtered" not in raw or "data" not in raw.get("filtered", {}):
            return None
        return raw
    except Exception:
        return None


def _get_strike_premium(chain_data: dict, strike: int, option_type: str = "CE") -> float | None:
    for item in chain_data.get("filtered", {}).get("data", []):
        if item.get("strikePrice") == strike:
            return item.get(option_type, {}).get("lastPrice")
    return None


def _compute_pcr(chain_data: list[dict]) -> float | None:
    total_put_oi = sum(
        row.get("PE", {}).get("openInterest", 0) for row in chain_data if "PE" in row
    )
    total_call_oi = sum(
        row.get("CE", {}).get("openInterest", 0) for row in chain_data if "CE" in row
    )
    if total_call_oi == 0:
        return None
    return round(total_put_oi / total_call_oi, 2)


def _compute_max_pain(chain_data: list[dict]) -> int | None:
    """
    Max pain = strike where total OTM option seller loss is minimised.
    For each candidate strike S, sum (max(0, S - K) * put_OI + max(0, K - S) * call_OI)
    across all strikes K.
    """
    strikes = []
    put_oi: dict[int, int] = {}
    call_oi: dict[int, int] = {}

    for row in chain_data:
        strike = row.get("strikePrice")
        if strike is None:
            continue
        k = int(strike)
        strikes.append(k)
        put_oi[k] = row.get("PE", {}).get("openInterest", 0)
        call_oi[k] = row.get("CE", {}).get("openInterest", 0)

    if not strikes:
        return None

    best_strike = None
    best_loss = float("inf")
    for candidate in strikes:
        loss = sum(
            max(0, candidate - k) * put_oi.get(k, 0) + max(0, k - candidate) * call_oi.get(k, 0)
            for k in strikes
        )
        if loss < best_loss:
            best_loss = loss
            best_strike = candidate

    return best_strike


def _nearest_50_above(value: float) -> int:
    return int(math.ceil(value / 50) * 50)


def _determine_action(
    pcr: float | None,
    trend: str,
    spot: float,
) -> tuple[str, str]:
    if pcr is None:
        return (
            "MONITOR",
            "Option chain unavailable — monitoring price action only; no directional OI bias confirmed.",
        )
    if pcr > 1.5:
        return (
            "WAIT",
            f"PCR {pcr} > 1.5: heavy put buying signals potential sharp fall — unsafe for short call spread.",
        )
    if pcr < 0.8:
        return (
            "ENTER",
            f"PCR {pcr} < 0.8: call-heavy OI skew indicates bearish bias; credit spread entry conditions met.",
        )
    return (
        "MONITOR",
        f"PCR {pcr} neutral (0.8–1.5): conditions not decisive; watch for EOD confirmation.",
    )


def generate_signal(strategy_dir: str, capital: float = 120_000) -> dict[str, Any]:
    """
    Fetch live NIFTY data and return a structured signal dict.

    strategy_dir: path to the strategy folder (used to read metadata.json if present)
    capital: allocated capital — reserved for future lot-size / margin checks
    """
    updated_at = _ist_now()
    error: str | None = None

    lot_size = _LOT_SIZE
    meta_path = Path(strategy_dir) / "metadata.json"
    if meta_path.exists():
        try:
            with open(meta_path) as f:
                meta = json.load(f)
            lot_size = int(meta.get("lot_size", _LOT_SIZE))
        except Exception:
            pass

    if not _YF_AVAILABLE:
        return {
            "action": "MONITOR",
            "action_reason": "yfinance not installed — cannot fetch live data.",
            "spot": None,
            "spot_change_pct": None,
            "trend": "NEUTRAL",
            "pcr": None,
            "max_pain": None,
            "suggested_spread": {
                "short_strike": None,
                "long_strike": None,
                "lot_size": lot_size,
                "max_profit_per_lot": None,
                "breakeven": None,
            },
            "open_interest_note": None,
            "entry_window": "15:48 – 16:17 IST",
            "expiry": _next_weekly_expiry(),
            "updated_at": updated_at,
            "data_source": "unavailable",
            "error": "yfinance not available",
        }

    spot: float | None = None
    spot_change_pct: float | None = None
    trend: str = "NEUTRAL"

    try:
        spot, spot_change_pct = _fetch_spot()
    except Exception as exc:
        error = f"yfinance spot fetch failed: {exc}"
        return {
            "action": "MONITOR",
            "action_reason": "Could not fetch NIFTY spot price — data unavailable.",
            "spot": None,
            "spot_change_pct": None,
            "trend": "NEUTRAL",
            "pcr": None,
            "max_pain": None,
            "suggested_spread": {
                "short_strike": None,
                "long_strike": None,
                "lot_size": lot_size,
                "max_profit_per_lot": None,
                "breakeven": None,
            },
            "open_interest_note": None,
            "entry_window": "15:48 – 16:17 IST",
            "expiry": _next_weekly_expiry(),
            "updated_at": updated_at,
            "data_source": "yfinance_only",
            "error": error,
        }

    try:
        trend = _fetch_trend()
    except Exception:
        trend = "NEUTRAL"

    pcr: float | None = None
    max_pain: int | None = None
    oi_note: str | None = None
    data_source = "yfinance_only"

    chain_raw = _fetch_option_chain()
    if chain_raw is not None:
        chain_data = chain_raw.get("filtered", {}).get("data", [])
        pcr = _compute_pcr(chain_data)
        max_pain = _compute_max_pain(chain_data)
        data_source = "yfinance+NSE"
        if pcr is not None:
            oi_note = f"PCR {pcr}; max pain {max_pain}; data from NSE option chain."
    else:
        oi_note = "NSE option chain blocked (session cookie required) — PCR/max pain unavailable."

    short_strike = _nearest_50_above(spot * 1.02)
    long_strike = short_strike + 400

    short_premium: float | None = None
    long_premium: float | None = None
    net_credit: float | None = None
    net_credit_total: float | None = None
    spread_width = long_strike - short_strike
    max_profit: float | None = None
    max_loss: float | None = None
    breakeven: float | None = None

    if chain_raw is not None:
        short_premium = _get_strike_premium(chain_raw, short_strike, "CE")
        long_premium = _get_strike_premium(chain_raw, long_strike, "CE")
        if short_premium is not None and long_premium is not None:
            net_credit = round(short_premium - long_premium, 2)
            net_credit_total = round(net_credit * lot_size, 2)
            max_profit = net_credit_total
            max_loss = round((spread_width - net_credit) * lot_size, 2)
            breakeven = round(short_strike + net_credit, 2)

    action, action_reason = _determine_action(pcr, trend, spot)

    return {
        "action": action,
        "action_reason": action_reason,
        "spot": round(spot, 2),
        "spot_change_pct": spot_change_pct,
        "trend": trend,
        "pcr": pcr,
        "max_pain": max_pain,
        "suggested_spread": {
            "short_strike": short_strike,
            "long_strike": long_strike,
            "lot_size": lot_size,
            "short_premium": short_premium,
            "long_premium": long_premium,
            "net_credit": net_credit,
            "net_credit_total": net_credit_total,
            "max_profit": max_profit,
            "max_loss": max_loss,
            "breakeven": breakeven,
            "spread_width": spread_width,
        },
        "open_interest_note": oi_note,
        "entry_window": "15:48 – 16:17 IST",
        "expiry": _next_weekly_expiry(),
        "updated_at": updated_at,
        "data_source": data_source,
        "error": error,
    }
