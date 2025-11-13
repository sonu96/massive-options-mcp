# Options Validation System

## Overview

The Options Validation System is a comprehensive pre-trade and position management framework designed to prevent costly trading mistakes. It was developed in response to real trading losses (like the ORCL example with 98% IV and 75% probability of touching strikes).

## Architecture

The system consists of 4 main modules that work together:

```
┌─────────────────────────────────────────────────────────────┐
│                   MCP Tools (User Interface)                 │
├─────────────────────────────────────────────────────────────┤
│  validate_option_trade                                       │
│  calculate_option_probabilities                              │
│  get_market_context                                          │
│  evaluate_position_exit                                      │
└────────────┬─────────────────────────────────────────────────┘
             │
┌────────────┴─────────────────────────────────────────────────┐
│                    Core Modules                               │
├──────────────────────────────────────────────────────────────┤
│  PreTradeValidator     ← Main orchestrator                   │
│  ├─ ProbabilityCalculator  ← Black-Scholes math              │
│  ├─ RealTimeMonitor        ← Market conditions               │
│  └─ OptionsDecisionTree    ← Entry/exit rules                │
└──────────────────────────────────────────────────────────────┘
```

## Module Descriptions

### 1. Probability Calculator (`probability-calculator.js`)

**Purpose:** Calculate probabilities and risk metrics using Black-Scholes model and historical data.

**Key Functions:**
- `calculateProbabilities()` - Returns comprehensive probability analysis
- `calculateRealizedVolatility()` - Historical volatility from price bars
- `calculateATR()` - Average True Range for distance metrics
- `normalCDF()` - Standard normal cumulative distribution function

**Output Metrics:**
```javascript
{
  prob_itm: 0.45,              // Probability of expiring in-the-money
  prob_touch: 0.72,            // Probability of touching strike (⚠️ CRITICAL)
  expected_move: 21.50,        // ±1σ expected move in dollars
  distance_in_atr: 1.8,        // Distance to strike in ATR units
  iv_hv_ratio: 2.8,            // IV/HV ratio (>2 = danger)
  risk_level: 'HIGH'           // Overall risk assessment
}
```

### 2. Real-Time Monitor (`real-time-monitor.js`)

**Purpose:** Provide comprehensive real-time market context.

**Key Functions:**
- `getCompleteMarketPicture()` - One call for all market data
- `shouldEnterTrade()` - Entry safety checks
- `assessRiskEnvironment()` - Overall market risk level

**Monitors:**
- Underlying price, VWAP, intraday range
- VIX level and market volatility
- SPY/market direction
- Technical indicators (RSI, SMA)
- Market hours and status

### 3. Pre-Trade Validator (`pre-trade-validator.js`)

**Purpose:** Comprehensive trade validation before entry.

**Runs 9 Critical Checks:**
1. ✅ Strike buffer analysis (>3% recommended)
2. ✅ Probability of touch (<50% recommended)
3. ✅ ATR distance (>2.0 ATR recommended)
4. ✅ Implied volatility level (<50% preferred)
5. ✅ IV vs Historical volatility (<1.5x ratio)
6. ✅ Market environment (VIX <20)
7. ✅ Market direction (SPY change <1%)
8. ✅ Liquidity (bid/ask spread <10%)
9. ✅ Days to expiration (>7 days recommended)

**Validation Status:**
- `APPROVED` - All checks passed, green light
- `LOW_RISK` - Minor concerns, proceed with monitoring
- `MODERATE_RISK` - Some warnings, reduce position size
- `HIGH_RISK` - Multiple failures, avoid trade
- `REJECTED` - Critical failures, DO NOT ENTER

### 4. Decision Tree (`decision-tree.js`)

**Purpose:** Real-time position management and exit signals.

**Key Functions:**
- `evaluateEntry()` - Entry decision with confidence score
- `evaluateExit()` - Hold/exit decision with urgency
- Price history tracking for breach analysis

**Exit Signals:**
- `EXIT_IMMEDIATE` - Critical breach, exit now
- `MONITOR_CLOSELY` - Warning level, prepare to exit
- `HOLD` - Normal conditions, continue monitoring
- `CONSIDER_EXIT` - Profit target reached

**Monitors For:**
- Price within 2% of strikes (CRITICAL)
- Sustained breaches (>30 minutes)
- First touch vs bounce patterns
- Profit targets (50%+)
- Time decay approaching expiration

## MCP Tools

### 1. `validate_option_trade`

**Use Case:** Run before EVERY options trade.

**Example:**
```javascript
{
  "symbol": "ORCL",
  "strategy_type": "iron_condor",
  "strikes": {
    "short_call": 245,
    "short_put": 230,
    "long_call": 250,
    "long_put": 225
  },
  "expiration": "2024-01-26"
}
```

**Real ORCL Example (Would Have Prevented Loss):**
```javascript
// Input:
{
  symbol: "ORCL",
  strikes: { short_call: 235 },
  expiration: "2024-01-26"
}

// Output that would have STOPPED the trade:
{
  overall_status: "REJECTED",
  summary: {
    critical_failures: 3
  },
  checks: [
    {
      name: "Probability of Touch",
      status: "FAIL",
      details: {
        prob_touch_pct: "75.2%",  // ⛔ >75% danger!
        message: "EXTREME RISK - 75% chance of touching strike"
      }
    },
    {
      name: "Implied Volatility Level",
      status: "FAIL",
      details: {
        iv_pct: "98.0%",          // ⛔ EXTREME!
        message: "EXTREME VOLATILITY - DO NOT SELL OPTIONS"
      }
    },
    {
      name: "ATR Distance",
      status: "FAIL",
      details: {
        atr_distance: "1.2",      // ⛔ Within daily range!
        message: "WITHIN DAILY RANGE - Strike only 1.2 ATR away"
      }
    }
  ],
  recommendation: {
    action: "DO NOT ENTER TRADE",
    reason: "Critical validation failures - trade has extreme risk"
  }
}
```

### 2. `calculate_option_probabilities`

**Use Case:** Understand true risk of a strike price.

**Example:**
```javascript
{
  "symbol": "AAPL",
  "strike": 180,
  "expiration": "2024-02-16",
  "option_type": "call"
}
```

**Output:**
```javascript
{
  current_price: 175.50,
  strike: 180,
  days_to_expiration: 21,

  prob_itm: 0.42,                    // 42% chance of expiring ITM
  prob_touch: 0.58,                  // 58% chance of touching $180

  expected_move: 8.50,               // ±$8.50 expected move
  range_1sd: [167.00, 184.00],       // 1σ range

  distance_in_atr: 2.3,              // 2.3 ATR away (good!)
  distance_in_percent: 2.56,         // 2.56% away

  implied_volatility: 0.35,          // 35% IV
  historical_volatility: 0.28,       // 28% HV
  iv_hv_ratio: 1.25,                 // IV slightly elevated

  risk_level: "MODERATE",
  warnings: []
}
```

### 3. `get_market_context`

**Use Case:** Check market conditions before trading.

**Example:**
```javascript
{
  "symbol": "SPY"
}
```

**Output:**
```javascript
{
  underlying: {
    price: 485.20,
    change_percent: 0.35,
    intraday: {
      high: 486.50,
      low: 484.20,
      vwap: 485.10,
      distance_from_vwap: {
        percent: 0.02,
        interpretation: "Near VWAP"
      }
    },
    technicals: {
      rsi: 58.5,
      sma_20: 482.00,
      sma_50: 478.50
    }
  },
  market: {
    vix: 14.2,
    vix_level: "LOW",
    spy_change_percent: 0.35,
    market_strength: "MODERATE_BULLISH",
    risk_environment: "NORMAL"
  }
}
```

### 4. `evaluate_position_exit`

**Use Case:** Real-time monitoring of open positions.

**Example:**
```javascript
{
  "symbol": "TSLA",
  "position": {
    "short_call": 250,
    "short_put": 220,
    "expiration": "2024-02-16",
    "entry_credit": 5.50
  }
}
```

**Output Scenarios:**

**Scenario 1: Price Breach**
```javascript
{
  decision: "EXIT_IMMEDIATE",
  urgency: "CRITICAL",
  reason: "Stock at $248.50, within 2% of short call $250 - BREACH IMMINENT",
  current_price: 248.50,
  price_trend: "UPTREND"
}
```

**Scenario 2: First Touch**
```javascript
{
  decision: "MONITOR_CLOSELY",
  urgency: "MEDIUM",
  reason: "First touch of short call - watch for bounce or sustained move",
  action: "Set 15-minute timer, exit if no reversal"
}
```

**Scenario 3: Profitable**
```javascript
{
  decision: "HOLD",
  urgency: "LOW",
  reason: "All systems nominal - position within acceptable parameters",
  price_trend: "SIDEWAYS"
}
```

## Usage Workflows

### Workflow 1: Pre-Trade Validation

```
1. User identifies trade opportunity
   ↓
2. Call validate_option_trade with strategy details
   ↓
3. Review validation report:
   - APPROVED → Execute trade
   - MODERATE_RISK → Reduce position size 50%
   - HIGH_RISK or REJECTED → Skip trade
   ↓
4. If approved, set up position tracking
```

### Workflow 2: Probability Analysis

```
1. Considering selling premium at specific strikes
   ↓
2. Call calculate_option_probabilities for each strike
   ↓
3. Review probability metrics:
   - prob_touch < 40% → Good
   - prob_touch 40-60% → Acceptable
   - prob_touch > 60% → Too risky
   ↓
4. Select strikes with appropriate risk/reward
```

### Workflow 3: Position Monitoring

```
1. Open position exists
   ↓
2. Call evaluate_position_exit periodically (every 15-60 min)
   ↓
3. Act on signals:
   - EXIT_IMMEDIATE → Close position now
   - MONITOR_CLOSELY → Check every 5-10 minutes
   - CONSIDER_EXIT → Take profits
   - HOLD → Continue normal monitoring
```

## Key Lessons from ORCL Example

**What Went Wrong:**
- Sold $235 call with ORCL at ~$235-236 (virtually no buffer)
- IV at 98% (extreme volatility)
- Probability of touching strike: >75%
- Distance from strike: <1.5 ATR (within daily range)
- ORCL typically moves 3-4% daily, strikes were only 1.7% away

**What Validation Would Have Caught:**
1. ✅ Strike Buffer: FAIL (0.4% buffer vs 3% recommended)
2. ✅ Probability of Touch: FAIL (75% vs <50% recommended)
3. ✅ ATR Distance: FAIL (1.2 ATR vs 2.0 recommended)
4. ✅ IV Level: FAIL (98% vs <50% preferred)
5. ✅ IV/HV Ratio: FAIL (2.8x vs <1.5x recommended)

**Result:** System would have returned `REJECTED` status with clear warnings.

## Configuration & Thresholds

### Adjustable Risk Thresholds

All thresholds can be customized in `pre-trade-validator.js`:

```javascript
// Strike buffer (% away from current price)
const MIN_BUFFER = 3.0;          // Recommended minimum
const WARNING_BUFFER = 2.0;       // Warning threshold

// Probability of touch
const MAX_PROB_TOUCH = 0.50;     // 50% maximum
const WARNING_PROB = 0.65;        // 65% warning

// ATR distance
const MIN_ATR_DISTANCE = 2.0;     // 2x ATR minimum
const WARNING_ATR = 1.5;          // 1.5 ATR warning

// Implied volatility
const MAX_IV = 0.50;              // 50% maximum
const EXTREME_IV = 0.75;          // 75% extreme

// VIX levels
const NORMAL_VIX = 20;            // Below = normal
const HIGH_VIX = 25;              // Above = high risk
```

## Best Practices

### 1. Always Validate Before Entry
Never enter a trade without running `validate_option_trade`. Make it a habit.

### 2. Understand Probabilities
Use `calculate_option_probabilities` to understand the true risk of your strikes.

### 3. Check Market Context
Use `get_market_context` to ensure market conditions support your strategy.

### 4. Monitor Positions
Set up regular monitoring with `evaluate_position_exit` (recommended every 30-60 minutes during market hours).

### 5. Respect the Signals
- `REJECTED` means DO NOT trade
- `EXIT_IMMEDIATE` means close the position NOW
- Don't override the system unless you have very good reason

### 6. Learn from Failures
When validation rejects a trade, understand WHY. Each failure is a lesson.

## Performance Metrics

The validation system focuses on:

1. **False Positive Rate:** Minimize rejecting good trades
2. **False Negative Rate:** NEVER approve bad trades (prioritize this)
3. **Speed:** All validations complete in <2 seconds
4. **Accuracy:** Probability calculations within 5% of theoretical

## Future Enhancements

Planned improvements:

1. ✅ Machine learning for IV rank/percentile
2. ✅ Historical performance tracking
3. ✅ Integration with broker APIs for live fills
4. ✅ Automated position monitoring/alerts
5. ✅ Backtesting framework
6. ✅ Portfolio-level risk aggregation

## Support & Troubleshooting

### Common Issues

**Issue:** Validation takes too long
- **Cause:** Slow API responses
- **Solution:** Check API key, network connection

**Issue:** "Invalid option data" error
- **Cause:** Strike/expiration not available
- **Solution:** Verify option chain has the requested contract

**Issue:** Probabilities seem off
- **Cause:** Insufficient historical data
- **Solution:** Ensure sufficient bars for HV calculation (minimum 30 days)

## Conclusion

The Options Validation System provides a safety net for options trading. By enforcing objective, data-driven criteria before every trade, it helps avoid emotionally-driven decisions and costly mistakes.

**Remember:** The system is a tool, not a replacement for your judgment. But when it says "REJECTED" with multiple critical failures, listen to it.
