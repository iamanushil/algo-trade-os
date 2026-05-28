"""
Risk Management for Curvature Credit Spread Overnight
Reference: Varsity Module 9 (Risk Management & Trading Psychology)
"""

from dataclasses import dataclass


@dataclass
class RiskState:
    capital: float
    daily_pnl: float = 0.0
    session_count: int = 0
    consecutive_losses: int = 0
    peak_capital: float = 0.0

    def __post_init__(self):
        self.peak_capital = self.capital

    @property
    def drawdown_pct(self) -> float:
        return (self.peak_capital - self.capital) / self.peak_capital if self.peak_capital else 0.0

    @property
    def daily_pnl_pct(self) -> float:
        return self.daily_pnl / self.capital if self.capital else 0.0


class RiskManager:
    def __init__(self, config):
        self.config = config
        self.state = RiskState(capital=config.CAPITAL)

    def can_enter(self) -> tuple[bool, str]:
        """Check whether a new position can be opened."""
        if self.state.daily_pnl_pct <= -self.config.MAX_DAILY_LOSS_PCT:
            return False, f"Daily loss limit hit ({self.state.daily_pnl_pct:.1%})"
        if self.state.drawdown_pct >= self.config.MAX_DRAWDOWN_PCT:
            return False, f"Max drawdown reached ({self.state.drawdown_pct:.1%}) — halt trading"
        if self.state.consecutive_losses >= 5:
            return False, f"{self.state.consecutive_losses} consecutive losses — cool-off period"
        return True, "OK"

    def position_size(self, premium_per_lot: float) -> int:
        """
        Return number of lots to trade based on capital and risk per trade.
        Uses fixed-fractional sizing (Varsity Module 9).
        """
        risk_capital = self.config.CAPITAL * self.config.POSITION_RISK_PCT
        lots = max(1, int(risk_capital / (premium_per_lot * self.config.LOT_SIZE)))
        return min(lots, 2)  # cap at 2 lots (130 shares) per strategy rules

    def record_session(self, pnl: float):
        """Update state after a session closes."""
        self.state.daily_pnl += pnl
        self.state.capital += pnl
        self.state.session_count += 1
        if pnl < 0:
            self.state.consecutive_losses += 1
        else:
            self.state.consecutive_losses = 0
        if self.state.capital > self.state.peak_capital:
            self.state.peak_capital = self.state.capital
