# algo-trade-os

An AI-assisted algorithmic trading operating system focused on Indian equity markets (NSE/BSE).

## Project purpose

Research, build, backtest, and operate trading strategies for Indian markets — combining live market data, fundamental/technical analysis, and LLM-assisted decision support. Long-term goal: full live deployment with direct broker integration.

## Repository layout

```
strategies/
  _template/        — scaffold to copy when starting any new strategy
  equity/           — equity cash/intraday strategies
  fo/               — futures & options strategies
analysis/           — market analysis scripts (FII/DII, screeners, option chain)
backtests/
  results/          — backtest output, metrics, equity curves
data/               — cached market data (gitignored, same-session only)
resources/
  links.md          — curated data source URLs
  varsity/          — Zerodha Varsity PDFs (reference methodology, do not modify)
.claude/skills/
  indian-algo-trading/  — skill symlink → algo_ai_skill (Phase 1)
                         replace symlink with own skill dir to go independent (Phase 2)
```

## Starting a new strategy

1. Copy `strategies/_template/` into the correct subfolder:
   ```
   cp -r strategies/_template/ strategies/equity/my_strategy_name/
   ```
2. Implement `strategy.py` → fill in the `next(tick)` method with signal logic
3. Update `config.py` with symbols, thresholds, risk params
4. Run backtests before any paper/live deployment

## Skill knowledge source

Strategy generation uses the `indian-algo-trading` skill at `.claude/skills/indian-algo-trading/`.
Currently a symlink to `/Users/ak/Projects/algo_ai_skill`. When building your own skill:
- Replace the symlink with a real directory
- Maintain the same structure: `SKILL.md` + `references/*.md`
- Regenerate `AGENTS.md` from the new skill for portability to other AI tools

## Data sources

See `resources/links.md` for the full list. Fetch priority:
1. **WebFetch** on the URLs in links.md for live data (prices, OI, FII/DII flows)
2. **Python** with `yfinance` for historical OHLCV — ticker format: `SYMBOL.NS`
3. **WebSearch** for breaking news or earnings releases
4. **Cached files** in `data/` for same-session repeat queries (never commit)

## Reference methodology

All strategy decisions should reference the relevant Varsity module:
- Technical entries/exits → Module 2 (Technical Analysis)
- Fundamental screening → Module 3 (Fundamental Analysis)
- Futures positions → Module 4
- Options theory & Greeks → Module 5
- Option spreads/strategies → Module 6
- Risk sizing & drawdown rules → Module 9 (Risk Management & Trading Psychology)
- System design → Module 10 (Trading Systems)

## Key conventions

- Always use `.NS` suffix when constructing `yfinance` tickers (e.g. `RELIANCE.NS`).
- FII/DII flow data is critical for daily directional bias — check before any intraday call.
- Option chain max pain and PCR come from NSE official option chain, not third-party sources.
- Never commit large PDF or data files. Never commit broker credentials.
- All strategy code must follow the 15 critical rules in `.claude/skills/indian-algo-trading/SKILL.md`.
