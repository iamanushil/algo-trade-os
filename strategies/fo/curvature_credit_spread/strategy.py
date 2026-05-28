"""
Curvature Credit Spread Overnight — Signal Logic

Strategy: Sell a near-the-money CE, buy an OTM CE (bear call spread).
Entry: 3:48–4:17 PM IST, targeting next weekly expiry.
Exit: On expiry day or next session open.
Adjustment: If short strike is breached intraday, roll up the spread.

Reference: Varsity Module 6 (Option Strategies), Module 5 (Options Theory & Greeks)
"""

from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional


@dataclass
class SpreadPosition:
    short_strike: int
    long_strike: int
    short_entry: float
    long_entry: float
    qty: int
    expiry: str
    entry_time: datetime
    short_exit: Optional[float] = None
    long_exit: Optional[float] = None
    exit_time: Optional[datetime] = None
    is_adjustment: bool = False

    @property
    def net_credit(self) -> float:
        return (self.short_entry - self.long_entry) * self.qty

    @property
    def pnl(self) -> float:
        if self.short_exit is None or self.long_exit is None:
            return 0.0
        return ((self.short_entry - self.short_exit) - (self.long_exit - self.long_entry)) * self.qty


@dataclass
class SessionSignal:
    date: str
    action: str        # "ENTER", "SKIP", "ADJUST"
    reason: str
    short_strike: Optional[int] = None
    long_strike: Optional[int] = None
    confidence: float = 0.0
    notes: str = ""


class CurvatureCreditSpreadStrategy:
    """
    Reverse-engineered rule set from Dhan Algos 'Curvature Credit Spread Overnight'.
    Rules are approximations — actual algo rules are proprietary.
    """

    def __init__(self, config):
        self.config = config
        self.open_positions: list[SpreadPosition] = []
        self.session_adjustments: int = 0

    def select_strikes(self, spot: float, iv: float, expiry_dte: int) -> tuple[int, int]:
        """
        Select short and long strikes for a new spread.
        Short: ATM or slightly OTM. Long: short + SPREAD_WIDTH.
        """
        atm = round(spot / 50) * 50  # Nifty rounds to nearest 50
        short_strike = atm + 50       # slightly OTM call
        long_strike = short_strike + self.config.SPREAD_WIDTH_TYPICAL
        return short_strike, long_strike

    def should_enter(self, spot: float, vix: float, fii_net: float, expiry_dte: int) -> SessionSignal:
        """
        Determine if a new spread should be entered.
        Placeholder logic — replace with actual curvature signal.
        """
        # Skip if market is excessively volatile
        if vix > 20:
            return SessionSignal(date="", action="SKIP", reason=f"VIX {vix:.1f} > 20 threshold", confidence=0.3)

        # Skip if FII are heavily buying (bullish flow)
        if fii_net > 2000:  # crores
            return SessionSignal(date="", action="SKIP", reason=f"FII net buying ₹{fii_net:.0f}Cr — unfavorable", confidence=0.4)

        short_strike, long_strike = self.select_strikes(spot, vix, expiry_dte)
        return SessionSignal(
            date="",
            action="ENTER",
            reason="Market conditions favorable for bear call spread",
            short_strike=short_strike,
            long_strike=long_strike,
            confidence=0.7,
        )

    def should_adjust(self, spot: float, position: SpreadPosition) -> SessionSignal:
        """
        Check if an existing position needs adjustment (roll-up).
        Triggers when short strike is breached.
        """
        if self.session_adjustments >= self.config.MAX_ADJUSTMENTS_PER_SESSION:
            return SessionSignal(date="", action="SKIP", reason="Max adjustments reached", confidence=1.0)

        if spot >= position.short_strike:
            new_short = round(spot / 50) * 50 + 50
            new_long = new_short + self.config.SPREAD_WIDTH_TYPICAL
            return SessionSignal(
                date="",
                action="ADJUST",
                reason=f"Spot {spot} breached short strike {position.short_strike}",
                short_strike=new_short,
                long_strike=new_long,
                confidence=0.9,
            )
        return SessionSignal(date="", action="SKIP", reason="No adjustment needed", confidence=0.95)

    def next(self, tick: dict) -> Optional[SessionSignal]:
        """
        Main signal method called on each price tick or EOD bar.
        tick keys: datetime, spot, vix, fii_net, expiry_date, expiry_dte
        """
        now = datetime.fromisoformat(tick["datetime"])
        hour, minute = now.hour, now.minute

        # Entry window: 3:48–4:17 PM
        entry_start = (15, 48)
        entry_end = (16, 17)
        in_entry_window = entry_start <= (hour, minute) <= entry_end

        if in_entry_window and not self.open_positions:
            return self.should_enter(tick["spot"], tick["vix"], tick["fii_net"], tick["expiry_dte"])

        # Adjustment window: 5–8:30 PM
        adj_start = (17, 0)
        adj_end = (20, 30)
        in_adj_window = adj_start <= (hour, minute) <= adj_end

        if in_adj_window and self.open_positions:
            for pos in self.open_positions:
                signal = self.should_adjust(tick["spot"], pos)
                if signal.action == "ADJUST":
                    self.session_adjustments += 1
                    return signal

        return None
