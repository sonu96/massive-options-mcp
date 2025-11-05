# Dealer Positioning Matrix Tool (HeatSeeker)

## Overview

The `get_dealer_positioning_matrix` tool replicates HeatSeeker functionality by calculating dealer gamma exposure (GEX) and vega exposure (VEX) across all strikes and expirations. It identifies where dealers will dampen or amplify price moves based on their hedging requirements.

## What is Dealer GEX?

**Dealer Gamma Exposure (GEX)** measures the sensitivity of dealer's option portfolios to price changes in the underlying asset.

### How It Works

1. **Retail buys options** → Dealers sell options
2. **Dealers are typically short** → They need to hedge
3. **Hedging creates feedback loops**:
   - **Positive GEX**: Dealers LONG gamma → Sell rallies, buy dips → **Dampens volatility**
   - **Negative GEX**: Dealers SHORT gamma → Buy rallies, sell dips → **Amplifies moves**

### GEX Formula

```
Dealer GEX = Gamma × Open Interest × 100 × Spot² × 0.01

For Calls: GEX = -Gamma × OI × 100 × S² × 0.01  (dealers short calls)
For Puts:  GEX = +Gamma × OI × 100 × S² × 0.01  (dealers short puts)
```

## Tool Parameters

### Required
- `symbol` (string): Stock ticker (e.g., "IBIT", "SPY")

### Optional
- `expirations` (array): Specific dates to analyze (YYYY-MM-DD)
- `strike_range` (object): `{ min: number, max: number }`
- `include_vex` (boolean): Include Vega Exposure matrix
- `format` (string): "matrix" or "list"

## Usage Examples

### Basic Usage (All Expirations)
```javascript
{
  "symbol": "IBIT"
}
```

### HeatSeeker Replication
```javascript
{
  "symbol": "IBIT",
  "expirations": ["2025-11-07", "2025-11-14", "2025-11-21", "2025-11-28"],
  "strike_range": {
    "min": 49,
    "max": 63
  }
}
```

### With Vega Exposure
```javascript
{
  "symbol": "SPY",
  "include_vex": true
}
```

## Output Structure

```javascript
{
  "symbol": "IBIT",
  "current_price": 60.53,
  "analysis_time": "2025-11-04T02:52:11.849Z",
  "expirations": ["2025-11-07", "2025-11-14", ...],

  // GEX Matrix (strike × expiration)
  "gex_matrix": {
    "2025-11-07": {
      "60": 92984600,   // Massive positive GEX
      "58": -115627100, // Massive negative GEX
      "62": -3704100,
      ...
    },
    "2025-11-14": { ... },
    ...
  },

  // Key levels identified
  "key_levels": {
    "max_positive_gex": {
      "strike": 60,
      "expiration": "2025-11-21",
      "value": 92984600,
      "interpretation": "Strong magnet level at $60 - dealers will suppress volatility..."
    },
    "max_negative_gex": {
      "strike": 58,
      "expiration": "2025-11-21",
      "value": -115627100,
      "interpretation": "Danger zone at $58 - break triggers amplification..."
    },
    "zero_gamma_strike": 61.2,
    "total_gex": 5280000,
    "regime": "Positive Gamma - Dealers long gamma, will dampen volatility"
  },

  // Per-expiration summaries
  "expiration_summary": {
    "2025-11-21": {
      "totalGEX": 5280000,
      "callGEX": 92984600,
      "putGEX": -87704600,
      "regime": "Positive",
      "interpretation": "Dealers long gamma - expect range-bound action"
    }
  },

  // Trading implications
  "trading_implications": {
    "support_levels": [58.0, 56.0],
    "resistance_levels": [60.0, 63.0],
    "magnet_levels": [60.0],
    "expected_range": {
      "low": 58.0,
      "current": 60.53,
      "high": 60.0
    },
    "gamma_squeeze_risk": "HIGH",
    "volatility_outlook": "SUPPRESSED",
    "strategy_recommendations": [
      {
        "type": "Premium Selling",
        "reason": "High positive GEX suggests range-bound action",
        "strategies": ["Iron Condor", "Credit Spreads"]
      }
    ]
  },

  // Aggregated GEX by strike
  "gex_by_strike": [
    { "strike": 60, "gex": 92984600 },
    { "strike": 58, "gex": -115627100 },
    ...
  ]
}
```

## Interpreting the Results

### Positive GEX (Magnet Levels)

**Characteristics:**
- 🟢 Green in heat map
- Dealers LONG gamma
- Price gravitates toward these strikes
- Volatility dampening

**Trading Implications:**
- ✅ **Sell premium** around these levels
- ✅ Iron condors, credit spreads
- ✅ Covered calls at resistance
- ✅ Cash-secured puts at support
- ❌ **Avoid** buying directional options

**Example:**
```
Strike 60: +$92.9M GEX
→ Price magnetically pulled to $60
→ Perfect for selling iron condor 58/60/60/62
```

### Negative GEX (Danger Zones)

**Characteristics:**
- 🔴 Red in heat map
- Dealers SHORT gamma
- Price acceleration if breached
- Volatility amplification

**Trading Implications:**
- ✅ **Directional plays** if break occurs
- ✅ Debit spreads, long options
- ✅ Straddles/strangles before breakout
- ❌ **Avoid** selling premium near these levels
- ❌ Don't fight the momentum

**Example:**
```
Strike 58: -$115.6M GEX
→ Break below $58 triggers dealer buying
→ Accelerates downside move
→ Buy put debit spreads on break
```

### Zero Gamma Strike (Flip Point)

**What It Means:**
- Transition point between regimes
- Above = positive GEX (dampening)
- Below = negative GEX (amplification)

**Trading Implications:**
- 🎯 Key technical level
- Watch for breakouts/breakdowns
- Strategy shifts based on side

## Use Cases

### 1. Intraday Scalping

```javascript
// Find magnet levels for mean-reversion trades
const result = await get_dealer_positioning_matrix({
  symbol: "SPY",
  expirations: ["2025-11-08"] // Near-term only
});

// Trade plan:
// - Sell rallies into resistance (high +GEX)
// - Buy dips into support (high -GEX)
// - Avoid chasing through zero gamma strike
```

### 2. Strategy Selection

```javascript
// Determine if market will be range-bound or trending
const result = await get_dealer_positioning_matrix({
  symbol: "QQQ"
});

if (result.key_levels.total_gex > 10000000) {
  // High positive GEX → Range-bound
  // Strategy: Sell iron condors, calendars
} else if (result.key_levels.total_gex < -10000000) {
  // High negative GEX → Trending
  // Strategy: Debit spreads, directional
}
```

### 3. Risk Management

```javascript
// Avoid selling premium near danger zones
const result = await get_dealer_positioning_matrix({
  symbol: "NVDA"
});

// Check if your strike is near negative GEX
const yourStrike = 140;
const nearestNegGEX = result.key_levels.max_negative_gex.strike;

if (Math.abs(yourStrike - nearestNegGEX) < 5) {
  console.warn("⚠️ Strike too close to negative GEX zone!");
  // Adjust or skip trade
}
```

### 4. Integration with Deep Analysis

```javascript
// Combined workflow:

// 1. Get dealer positioning
const positioning = await get_dealer_positioning_matrix({
  symbol: "IBIT"
});

// 2. Use magnet levels for strategy generation
const strategies = await deep_options_analysis({
  symbol: "IBIT",
  strikes_to_analyze: positioning.trading_implications.magnet_levels,
  strategies: ["iron_condor"], // Sell premium at high GEX
  account_size: 10000
});

// Result: Strategies optimized for dealer positioning
```

## Key Levels Explained

### Magnet Levels
High positive GEX near current price
- Price "sticks" to these strikes
- Dealers suppress volatility
- Range-bound behavior

### Support Levels
High negative GEX below current price
- Hard floor (dealers don't want to hedge below this)
- Breaking creates acceleration
- Strong technical level

### Resistance Levels
High positive GEX above current price
- Hard ceiling
- Dealers sell into rallies
- Difficult to breach

### Expected Range
Distance between support and resistance
- Where price likely to trade
- Boundaries for iron condors
- Reference for stop placement

## Strategy Recommendations

The tool automatically suggests strategies based on GEX profile:

### Premium Selling Conditions
- Total GEX > $5M (positive)
- High magnet levels exist
- Volatility outlook: SUPPRESSED

**Suggested Strategies:**
- Iron Condors
- Credit Spreads
- Covered Calls
- Naked Puts (if experienced)

### Directional Conditions
- Total GEX < -$5M (negative)
- Price near danger zones
- Volatility outlook: ELEVATED

**Suggested Strategies:**
- Debit Spreads
- Long Calls/Puts
- Butterflies
- Ratio Spreads

### Mixed Conditions
- Total GEX near zero
- Check individual strikes
- Strategy depends on expected direction

## Comparing to HeatSeeker

| Feature | HeatSeeker | This Tool |
|---------|-----------|-----------|
| GEX Matrix | ✅ | ✅ |
| VEX Matrix | ✅ | ✅ (optional) |
| Key Levels | ✅ | ✅ |
| Visual Heat Map | ✅ | ❌ (JSON output) |
| Real-time Updates | ✅ | ⚠️ (on-demand) |
| Historical GEX | ✅ | ❌ (planned) |
| Auto Alerts | ✅ | ❌ (planned) |
| Trading Implications | ⚠️ | ✅ (detailed) |
| Strategy Recommendations | ❌ | ✅ |
| MCP Integration | ❌ | ✅ |

## Performance

### Execution Time
- **Basic (all strikes)**: 3-5 seconds
- **Filtered range**: 2-3 seconds
- **With VEX**: +30% time

### API Calls
- 1x option chain snapshot (covers all expirations)
- Greeks data included in snapshot
- Efficient single-call architecture

## Best Practices

### 1. Focus on Near-Term Expirations
```javascript
// Near-term has most impact
{
  "expirations": ["2025-11-08", "2025-11-15"], // 1-2 weeks out
  "strike_range": { min: current - 10, max: current + 10 }
}
```

### 2. Update Throughout the Day
```javascript
// GEX changes as options trade
// Refresh every 30-60 minutes for active trading
setInterval(async () => {
  const positioning = await get_dealer_positioning_matrix({ symbol: "SPY" });
  checkForChanges(positioning);
}, 1800000); // 30 minutes
```

### 3. Combine with Technical Analysis
```javascript
// Don't trade GEX alone
// Confirm with:
// - Support/resistance
// - Volume profile
// - Market internals
// - Trend direction
```

### 4. Watch for GEX Flips
```javascript
// Monitor zero gamma strike
const previous_zero = 580;
const current_zero = result.key_levels.zero_gamma_strike; // 575

if (current_zero < previous_zero - 2) {
  console.warn("⚠️ Zero gamma dropped significantly!");
  // Gamma regime may be shifting
}
```

## Troubleshooting

### No High GEX Levels
**Cause**: Low liquidity, far-dated expirations
**Solution**:
- Focus on near-term (< 30 DTE)
- Use liquid underlyings (SPY, QQQ)
- Lower detection thresholds

### All Negative GEX
**Cause**: Market in high volatility regime
**Solution**:
- Expect trending behavior
- Avoid premium selling
- Use directional strategies

### Results Don't Match HeatSeeker
**Cause**: Different calculation methods
**Solution**:
- Both use same GEX formula
- Differences likely in:
  - OI data timing
  - Gamma calculation method
  - Scaling factors
- Trust the trends, not exact values

## Advanced Features

### Vega Exposure (VEX)

```javascript
{
  "symbol": "SPY",
  "include_vex": true
}
```

**VEX Shows:**
- Dealer exposure to IV changes
- Where IV expansion/compression likely
- Complementary to GEX analysis

**Trading Use:**
- High VEX = IV likely compressed
- Negative VEX = IV expansion risk
- Use for volatility trades

## Future Enhancements

**Planned Features:**
1. Historical GEX tracking
2. GEX change alerts
3. Multi-symbol comparison
4. Gamma flip notifications
5. Visual heat map generation
6. Real-time streaming updates
7. Integration with charting

## Examples

See test script:
```bash
node test-dealer-positioning.js
```

Output includes:
- Key levels summary
- Expiration breakdowns
- Trading implications
- GEX matrix display
- Full JSON export

## Summary

**Use this tool to:**
- ✅ Identify magnet levels (price pinning)
- ✅ Find danger zones (breakout triggers)
- ✅ Determine volatility outlook
- ✅ Select appropriate strategies
- ✅ Set support/resistance levels
- ✅ Optimize entry/exit points
- ✅ Manage risk based on dealer positioning

**Perfect for:**
- Day traders (intraday levels)
- Options sellers (range identification)
- Directional traders (breakout levels)
- Risk managers (danger zone awareness)
- Strategy developers (systematic rules)

---

**Tool**: `get_dealer_positioning_matrix`
**Status**: ✅ Production Ready
**Version**: 1.0.0
**Documentation**: Complete
