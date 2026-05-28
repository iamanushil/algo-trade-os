# Data Sources & Research Links

The AI Trader uses these in order of preference. Add more as needed — system will pick them up automatically.

## Primary data sources (use first)

### Price data, charts, technicals
- **TradingView** — https://www.tradingview.com/symbols/NSE-{SYMBOL}/  — charts, multi-timeframe, indicators
- **NSE official** — https://www.nseindia.com/get-quotes/equity?symbol={SYMBOL} — official quote, F&O lot sizes, deliverable %, bulk/block deals
- **NSE pre-open** — https://www.nseindia.com/market-data/pre-open-market-cm-and-emerge-market — opening tick before 9:15
- **NSE F&O participant data** — https://www.nseindia.com/reports/fii-dii — FII/DII flows (critical for daily bias)
- **NSE option chain** — https://www.nseindia.com/option-chain — OI, max pain, PCR

### Fundamentals & screening
- **Screener.in** — https://www.screener.in/company/{SYMBOL}/  — financials, ratios, ownership, peers
- **Screener.in custom screens** — https://www.screener.in/screens/ — pre-built and custom screens
- **Trendlyne** — https://trendlyne.com/equity/{SYMBOL}/ — analyst ratings, target prices, SWOT
- **Tijori Finance** — https://tijorifinance.com/company/{SYMBOL}/ — segment-level revenue, KPIs

### News & sentiment
- **Moneycontrol** — https://www.moneycontrol.com/india/stockpricequote/{SYMBOL} — news, broker calls
- **Livemint markets** — https://www.livemint.com/market — sector news
- **Bloomberg India** — https://www.bloomberg.com/asia — global context
- **Economic Times Markets** — https://economictimes.indiatimes.com/markets

### Macro & FII/DII
- **NSDL FPI** — https://www.fpi.nsdl.co.in/ — institutional flow data
- **RBI** — https://www.rbi.org.in/ — repo rate, inflation, monetary policy

### Options-specific
- **Sensibull** — https://web.sensibull.com/ — option strategies, IV/Greeks
- **Opstra** — https://opstra.definedge.com/ — option analytics

## Methodology references (already in resources/)
- Module 1: Introduction to Stock Markets
- Module 2: Technical Analysis (use for chart pattern decisions)
- Module 3: Fundamental Analysis (use for long-term picks)
- Module 4: Futures Trading
- Module 5: Options Theory
- Module 6: Option Strategies (use when constructing spreads)
- Module 7: Markets & Taxation
- Module 8: Currency & Commodity Futures
- Module 9: Risk Management & Trading Psychology (consult on every losing streak)
- Module 10: Trading Systems
- Module 11: Personal Finance
- Module 14: Personal Finance Insurance

## How the AI fetches (priority order)
1. **WebFetch** on the URLs above for live data
2. **Python in sandbox** with `yfinance` for historical OHLCV (`SYMBOL.NS` ticker format) and indicator math
3. **WebSearch** for breaking news, earnings releases
4. **Cached files** in `/data/` for same-day repeat queries (don't refetch)

## Add your own
Drop URLs here as you discover useful sources — the system will start using them automatically.

### AK's curated additions
_(empty — add below)_
