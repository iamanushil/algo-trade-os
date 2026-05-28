# algo-trade-os

An AI-assisted algorithmic trading operating system for Indian equity markets (NSE/BSE).

## What this is

algo-trade-os is a structured workspace for researching, building, and operating trading strategies. It combines live market data feeds, technical/fundamental analysis methodology, and LLM-assisted decision support into a single operating environment.

## Features

- **Live data integration** — price, F&O, OI, FII/DII flows via NSE, TradingView, Screener.in, and more
- **Options analytics** — option chain, PCR, max pain, IV/Greeks via Sensibull and Opstra
- **Fundamental screening** — financials, ratios, peer comparison via Screener.in and Tijori Finance
- **Macro context** — RBI policy, FPI flows via NSDL
- **Methodology-driven** — all strategy decisions reference Zerodha Varsity modules (included in `resources/`)

## Repository structure

```
algo-trade-os/
├── CLAUDE.md               # AI assistant instructions and project conventions
├── README.md               # This file
└── resources/
    ├── links.md            # Curated data source URLs used by the AI Trader
    └── varsity/            # Zerodha Varsity reference PDFs
        ├── Module 1  — Introduction to Stock Markets
        ├── Module 2  — Technical Analysis
        ├── Module 3  — Fundamental Analysis
        ├── Module 4  — Futures Trading
        ├── Module 5  — Options Theory for Professional Trading
        ├── Module 6  — Option Strategies
        ├── Module 7  — Markets & Taxation
        ├── Module 8  — Currency and Commodity Futures
        ├── Module 9  — Risk Management & Trading Psychology
        ├── Module 10 — Trading Systems
        ├── Module 11 — Personal Finance
        └── Module 14 — Personal Finance Insurance
```

## Data source priority

| Priority | Source | Use case |
|----------|--------|----------|
| 1 | WebFetch on links in `resources/links.md` | Live prices, OI, FII/DII |
| 2 | `yfinance` (`SYMBOL.NS` format) | Historical OHLCV, indicator math |
| 3 | WebSearch | Breaking news, earnings |
| 4 | Cached files in `/data/` | Same-session repeat queries |

## Methodology reference

| Decision type | Varsity module |
|---------------|---------------|
| Chart patterns & entries | Module 2 — Technical Analysis |
| Stock screening & valuation | Module 3 — Fundamental Analysis |
| Futures positions | Module 4 — Futures Trading |
| Options Greeks & pricing | Module 5 — Options Theory |
| Spreads & strategies | Module 6 — Option Strategies |
| Risk sizing & drawdown | Module 9 — Risk Management |
| System design | Module 10 — Trading Systems |

## Conventions

- Ticker format for `yfinance`: `SYMBOL.NS` (e.g. `RELIANCE.NS`, `NIFTY50.NS`)
- Always check FII/DII flow data before any intraday directional call
- Max pain and PCR must come from the NSE official option chain, not third-party sources
- Do not commit large binary files (PDFs, data dumps)

## Resources

- [NSE India](https://www.nseindia.com)
- [Zerodha Varsity](https://zerodha.com/varsity/)
- [Screener.in](https://www.screener.in)
- [Sensibull](https://web.sensibull.com)
- Full source list → [`resources/links.md`](resources/links.md)
