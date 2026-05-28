# Curvature Credit Spread Overnight — Configuration
SYMBOL = "NIFTY"
UNDERLYING = "NIFTY INDEX"
EXCHANGE = "NSE"
OPTION_TYPE = "CE"
LOT_SIZE = 65
CAPITAL = 120000  # per position

# Spread parameters
SPREAD_WIDTH_TYPICAL = 400  # points between short and long strike
SPREAD_WIDTH_MIN = 350
SPREAD_WIDTH_MAX = 500

# Timing windows (IST)
ENTRY_WINDOW_START = "15:48"
ENTRY_WINDOW_END = "16:17"
ADJUSTMENT_WINDOW_START = "17:00"
ADJUSTMENT_WINDOW_END = "20:30"

# Risk parameters (from Module 9 Varsity)
MAX_DAILY_LOSS_PCT = 0.15       # 15% of capital
MAX_DRAWDOWN_PCT = 0.25         # 25% → halt trading
POSITION_RISK_PCT = 0.08        # max 8% risk per position
MAX_ADJUSTMENTS_PER_SESSION = 4

# Broker
BROKER = "DHAN"
PRODUCT_TYPE = "INTRADAY"       # options expire same/next week
