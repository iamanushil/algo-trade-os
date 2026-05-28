"""
Curvature Credit Spread Overnight — Main Entry Point

Usage:
    python main.py --mode paper     # paper trading (no real orders)
    python main.py --mode live      # live trading via Dhan API
    python main.py --mode backtest  # run backtest on historical data
"""

import argparse
import logging
from datetime import datetime

import config
from risk_manager import RiskManager
from strategy import CurvatureCreditSpreadStrategy

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)


def run_paper(strategy, risk_mgr):
    log.info("Paper trading mode — no real orders will be placed")
    log.info("Connect to Dhan WebSocket for live tick data, then call strategy.next(tick)")
    # TODO: integrate Dhan WebSocket feed


def run_live(strategy, risk_mgr):
    log.warning("Live trading mode — REAL ORDERS WILL BE PLACED")
    can_trade, reason = risk_mgr.can_enter()
    if not can_trade:
        log.error(f"Risk check failed: {reason}")
        return
    log.info("Risk check passed. Ready to trade.")
    # TODO: integrate Dhan Order API


def run_backtest():
    from data.analysis import main as run_analysis
    log.info("Running backtest / P&L analysis on historical data...")
    run_analysis()


def main():
    parser = argparse.ArgumentParser(description="Curvature Credit Spread Overnight")
    parser.add_argument("--mode", choices=["paper", "live", "backtest"], default="backtest")
    args = parser.parse_args()

    risk_mgr = RiskManager(config)
    strategy = CurvatureCreditSpreadStrategy(config)

    log.info(f"Starting strategy — mode: {args.mode} — {datetime.now().isoformat()}")

    if args.mode == "backtest":
        run_backtest()
    elif args.mode == "paper":
        run_paper(strategy, risk_mgr)
    elif args.mode == "live":
        run_live(strategy, risk_mgr)


if __name__ == "__main__":
    main()
