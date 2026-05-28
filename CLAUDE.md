# algo-trade-os

An AI-assisted algorithmic trading operating system focused on Indian equity markets (NSE/BSE).

## Project purpose

Provides a structured environment for researching, building, and operating trading strategies — combining live market data, fundamental/technical analysis, and LLM-assisted decision support.

## Repository layout

```
resources/
  links.md          — curated data source URLs used by the AI Trader
  varsity/          — Zerodha Varsity PDFs (reference methodology, do not modify)
```

## Data sources

See `resources/links.md` for the full list. Fetch priority:
1. **WebFetch** on the URLs in links.md for live data (prices, OI, FII/DII flows)
2. **Python** with `yfinance` for historical OHLCV — ticker format: `SYMBOL.NS`
3. **WebSearch** for breaking news or earnings releases
4. **Cached files** in `/data/` for same-session repeat queries

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
- Do not commit large PDF or data files.
