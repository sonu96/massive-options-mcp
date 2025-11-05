# Advanced Features Documentation

This document provides detailed information about the advanced analytics features in the Massive Options MCP server.

## Table of Contents

1. [Option Analytics](#option-analytics)
2. [Volatility Analysis](#volatility-analysis)
3. [Market Structure Analysis](#market-structure-analysis)
4. [Integration Examples](#integration-examples)

## Option Analytics

The `get_option_analytics` tool provides comprehensive calculations beyond basic Greeks.

### Features

- **Value Analysis**
  - Intrinsic value calculation
  - Time value (extrinsic value)
  - Break-even price analysis

- **Probability Calculations**
  - Black-Scholes probability of finishing ITM/OTM
  - Based on current IV and time to expiration
  - Risk-free rate assumed at 5% (adjustable)

- **Expected Move**
  - One and two sigma expected ranges
  - Based on implied volatility
  - Useful for setting price targets

- **Risk Metrics**
  - Leverage (Lambda) calculation
  - Daily theta decay
  - Volume/OI ratio for activity analysis

### Example Usage

```javascript
// Basic analytics
const analytics = await getOptionAnalytics({
  symbol: "AAPL",
  optionType: "call",
  strike: 175,
  expiration: "2025-01-17"
});

// With risk/reward analysis
const analyticsWithTarget = await getOptionAnalytics({
  symbol: "AAPL",
  optionType: "call",
  strike: 175,
  expiration: "2025-01-17",
  targetPrice: 185  // Analyze P/L at $185
});
```

## Volatility Analysis

The `get_volatility_analysis` tool examines implied volatility patterns across strikes and expirations.

### Volatility Smile Analysis

Detects and interprets volatility patterns:

- **Smile**: Both OTM puts and calls have higher IV → tail risk concerns
- **Smirk**: OTM puts have higher IV → downside protection demand
- **Reverse Smirk**: OTM calls have higher IV → upside speculation
- **Flat**: Uniform IV across strikes → low skew environment

### Term Structure Analysis

Analyzes IV across different expiration dates:

- **Contango**: Rising IV with time → future uncertainty expected
- **Backwardation**: Falling IV with time → near-term event risk
- **Flat**: Stable IV across time → normal conditions

### Metrics Provided

- ATM implied volatility for each expiration
- Skew measurements (25-delta and 10-delta)
- Smile steepness quantification
- Volatility term structure shape

### Example Output

```json
{
  "smile_analysis": {
    "2025-01-17": {
      "atmIV": 0.3245,
      "atmStrike": 175,
      "skew": {
        "delta25": 0.0234,
        "delta10": 0.0456
      },
      "smileSteepness": 0.0789,
      "pattern": "smirk",
      "interpretation": "OTM puts have higher IV - indicating downside protection demand"
    }
  },
  "term_structure": {
    "shape": "contango",
    "interpretation": "Market expects higher volatility in the future",
    "shortTermIV": 0.2834,
    "mediumTermIV": 0.3245,
    "longTermIV": 0.3567
  }
}
```

## Market Structure Analysis

The `get_market_structure` tool provides insights into market positioning and dealer dynamics.

### Put/Call Ratios

Three different P/C ratios are calculated:

1. **Volume P/C Ratio**
   - Daily trading activity
   - > 1.2 = Very bearish
   - < 0.5 = Very bullish

2. **Open Interest P/C Ratio**
   - Accumulated positions
   - Shows longer-term sentiment

3. **Premium P/C Ratio**
   - Dollar-weighted flow
   - Shows where money is actually going

### Gamma Exposure (GEX)

Analyzes dealer gamma positioning:

- **Negative Gamma Regime**: Dealers short gamma
  - Expect higher volatility
  - Trending, explosive moves
  - Positive feedback loops

- **Positive Gamma Regime**: Dealers long gamma
  - Expect mean reversion
  - Volatility suppression
  - Range-bound action

### Max Pain

Calculates the price where most options expire worthless:

- Identifies price "magnets"
- Shows imbalance in positioning
- Useful for expiration week analysis

### Open Interest Distribution

Maps out support and resistance levels:

- **Call Walls**: Large OI concentrations above spot (resistance)
- **Put Walls**: Large OI concentrations below spot (support)
- Expected trading range based on OI

### Example Output

```json
{
  "put_call_ratios": {
    "volume": {
      "ratio": 0.87,
      "interpretation": "Moderately bearish sentiment"
    }
  },
  "gamma_exposure": {
    "totalGEX": -125000000,
    "regime": "Negative Gamma",
    "maxGammaStrike": 175,
    "interpretation": "Dealers are short gamma - expect higher volatility"
  },
  "max_pain": {
    "maxPainStrike": 172.5,
    "percentFromSpot": -1.43,
    "interpretation": "Max pain slightly below spot - some downward pressure"
  },
  "oi_distribution": {
    "nearestResistance": 180,
    "nearestSupport": 170,
    "expectedRange": {
      "low": 170,
      "high": 180
    }
  }
}
```

## Integration Examples

### Complete Market Analysis Workflow

```python
# 1. Get basic option data
quote = get_option_quote("SPY", "call", 450, "2025-01-17")

# 2. Analyze the specific option
analytics = get_option_analytics("SPY", "call", 450, "2025-01-17", target=460)

# 3. Check volatility environment
vol_analysis = get_volatility_analysis("SPY")

# 4. Understand market structure
market = get_market_structure("SPY")

# Make informed decision based on:
# - Option is 45% probable to finish ITM (analytics)
# - Volatility smile shows put skew - defensive positioning (vol_analysis)
# - Dealers are long gamma - expect range-bound action (market)
# - Strong call wall at 455 may cap upside (market)
```

### Volatility Trading Example

```python
# Find volatility arbitrage opportunities
vol = get_volatility_analysis("TSLA")

# Check for steep skew
if vol.smile_analysis["2025-01-17"].skew.delta25 > 0.05:
    print("Significant put skew detected")
    
    # Could consider:
    # - Selling OTM puts (expensive)
    # - Buying ATM calls (relatively cheap)
    # - Put spread to monetize skew
```

### Expiration Week Strategy

```python
# Use max pain and gamma exposure for expiration week
market = get_market_structure("QQQ")

if abs(market.max_pain.percentFromSpot) > 2:
    print(f"Max pain at {market.max_pain.maxPainStrike}")
    print("Consider mean reversion strategies")

if market.gamma_exposure.regime == "Negative Gamma":
    print("High volatility expected - consider straddles")
```

## Best Practices

1. **Combine Multiple Tools**
   - Don't rely on single metrics
   - Cross-reference different analyses
   - Look for confirming signals

2. **Consider Market Context**
   - Earnings dates affect volatility
   - Index options behave differently
   - Time decay accelerates near expiration

3. **Risk Management**
   - Use probability calculations for position sizing
   - Monitor gamma exposure for volatility regime
   - Check OI walls for support/resistance

4. **Performance Tips**
   - Use `get_option_chain_snapshot` first for overview
   - Cache results when analyzing multiple strikes
   - Batch similar requests together