# Deep Options Analysis Tool

## Overview

The `deep_options_analysis` tool is a comprehensive, all-in-one options analysis system that combines multiple analysis techniques into a single powerful workflow. It automatically detects unusual activity, identifies institutional positioning, generates multi-leg strategies, calculates position sizing, and provides P&L scenarios.

## Features

### 1. **Market Structure Analysis**
- Comprehensive snapshot of option chain
- Put/call ratio analysis
- Gamma exposure (GEX) calculations
- Max pain identification
- Open interest distribution analysis

### 2. **Unusual Activity Detection**
- Volume spike identification
- Volume/OI ratio analysis
- Institutional flow detection
- Automatic strike selection based on activity

### 3. **Volatility Analysis**
- Volatility smile/skew patterns
- Term structure analysis
- IV rank calculations
- Multi-expiration comparisons

### 4. **Strategy Generation**
Supports 4 strategy types:
- **Bull Call Spreads** - Bullish vertical spreads
- **Bear Put Spreads** - Bearish vertical spreads
- **Iron Condors** - Range-bound neutral strategies
- **Calendar Spreads** - Time-based plays across expirations

### 5. **Position Sizing & Risk Management**
- Kelly Criterion calculations
- Configurable risk parameters
- Account size-based position limits
- Concentration limits
- Portfolio diversification analysis

### 6. **P&L Scenario Modeling**
- Breakeven calculations
- Multi-price scenario analysis
- Expected value calculations
- Time decay analysis
- Portfolio-level P&L projections

## Usage

### Basic Example

```javascript
{
  "symbol": "SPY",
  "account_size": 10000
}
```

This minimal call will:
- Auto-detect the first 4 expirations
- Auto-detect strikes based on unusual activity
- Generate all 4 strategy types
- Use default risk parameters (2% risk, 2:1 min reward:risk)

### Advanced Example

```javascript
{
  "symbol": "IBIT",
  "target_expirations": ["2026-01-16", "2026-03-20"],
  "strikes_to_analyze": [58, 65, 70, 75, 80],
  "account_size": 4000,
  "mode": "both",
  "strategies": ["bull_call_spread", "bear_put_spread"],
  "risk_config": {
    "max_risk_pct": 0.02,
    "min_reward_ratio": 2.0,
    "min_prob_profit": 0.5,
    "max_concentration": 0.40
  },
  "current_price": 60.50
}
```

## Parameters

### Required Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `symbol` | string | Stock ticker symbol (e.g., "SPY", "IBIT") |
| `account_size` | number | Trading account size in dollars |

### Optional Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `target_expirations` | array | First 4 available | Specific expiration dates (YYYY-MM-DD format) |
| `strikes_to_analyze` | array | Auto-detect | Specific strike prices to focus on |
| `mode` | string | "both" | "manual", "auto", or "both" for strike selection |
| `strategies` | array | All 4 types | Array of strategy types to generate |
| `risk_config` | object | Safe defaults | Risk management configuration |
| `current_price` | number | Fetched from API | Override underlying price |

### Risk Configuration

| Parameter | Type | Range | Default | Description |
|-----------|------|-------|---------|-------------|
| `max_risk_pct` | number | 0.005-0.10 | 0.02 | Max % of account to risk per trade (2%) |
| `min_reward_ratio` | number | 1.0-10.0 | 2.0 | Minimum reward:risk ratio (2:1) |
| `min_prob_profit` | number | 0.3-0.95 | 0.5 | Minimum probability of profit (50%) |
| `max_concentration` | number | 0.05-0.50 | 0.40 | Max % in single position (40%) |

## Modes

### Manual Mode
```javascript
"mode": "manual",
"strikes_to_analyze": [65, 70, 75, 80]
```
Uses ONLY the strikes you specify.

### Auto Mode
```javascript
"mode": "auto"
```
Automatically detects strikes based on:
- Unusual volume activity (>2x average)
- High open interest concentrations
- Institutional magnet levels (max pain, gamma walls)
- ATM and near-the-money strikes

### Both Mode (Default)
```javascript
"mode": "both"
```
Combines manual strikes + auto-detected strikes for comprehensive analysis.

## Output Structure

```javascript
{
  "symbol": "SPY",
  "analysis_time": "2025-11-04T02:30:00.000Z",
  "account_size": 10000,
  "risk_configuration": { ... },

  "snapshot": {
    "underlying_price": 575.23,
    "total_contracts": 1245,
    "expirations_available": ["2025-11-08", "2025-11-15", ...],
    "put_call_ratio": 0.87
  },

  "unusual_activity": [
    {
      "expiration": "2025-11-15",
      "strike": 580,
      "type": "call",
      "volume": 5432,
      "open_interest": 12456,
      "volume_oi_ratio": 0.44,
      "unusual_score": 9.8
    }
  ],

  "institutional_magnets": [
    {
      "expiration": "2025-11-15",
      "strike": 575,
      "type": "support",
      "open_interest": 45620,
      "strength": 15.3
    }
  ],

  "volatility_analysis": {
    "2025-11-15": {
      "smile": { ... },
      "put_call_ratios": { ... },
      "gamma_exposure": { ... },
      "max_pain": { ... }
    }
  },

  "recommended_strategies": [
    {
      "strategy_name": "570/580 Bull Call Spread",
      "type": "bull_call_spread",
      "expiration": "2025-11-15",
      "score": 85.4,
      "risk_reward": 3.2,
      "probability_profit": 0.65,

      "position_sizing": {
        "recommended_contracts": 5,
        "total_cost": 1250.00,
        "total_risk": 1250.00,
        "potential_profit": 4000.00,
        "risk_pct": 12.5
      },

      "pnl_analysis": {
        "breakeven_analysis": { ... },
        "expected_value": { ... },
        "price_scenarios": [ ... ],
        "summary": {
          "recommendation": "STRONG BUY - Positive EV with good risk/reward"
        }
      },

      "legs": [
        {
          "action": "buy",
          "type": "call",
          "strike": 570,
          "price": 8.50
        },
        {
          "action": "sell",
          "type": "call",
          "strike": 580,
          "price": 3.50
        }
      ]
    }
  ],

  "allocation_report": {
    "total_capital_allocated": 3750.00,
    "total_risk": 3750.00,
    "total_potential_profit": 12000.00,
    "allocation_pct": 37.5,
    "risk_pct": 37.5,
    "portfolio_reward_ratio": 3.2,
    "expected_value": 2400.00,
    "diversification": { ... }
  },

  "portfolio_pnl": {
    "scenarios": [ ... ],
    "summary": {
      "max_profit": 12000.00,
      "max_loss": -3750.00,
      "total_capital": 3750.00
    }
  },

  "executive_summary": {
    "total_strategies_analyzed": 45,
    "strategies_recommended": 8,
    "total_capital_required": 3750.00,
    "total_risk": 3750.00,
    "potential_profit": 12000.00,
    "portfolio_reward_ratio": 3.2,
    "unusual_activity_detected": 12,
    "key_support_levels": [570, 565, 560],
    "key_resistance_levels": [580, 585, 590]
  }
}
```

## Use Cases

### 1. Daily Market Scan
```javascript
{
  "symbol": "SPY",
  "account_size": 25000,
  "mode": "auto",
  "risk_config": {
    "max_risk_pct": 0.01,  // Conservative 1% risk
    "min_reward_ratio": 3.0  // High reward requirement
  }
}
```

### 2. Targeted Analysis
```javascript
{
  "symbol": "NVDA",
  "target_expirations": ["2025-12-20"],
  "strikes_to_analyze": [140, 145, 150, 155],
  "account_size": 10000,
  "mode": "manual",
  "strategies": ["bull_call_spread"]
}
```

### 3. Multi-Expiration Calendar Play
```javascript
{
  "symbol": "TSLA",
  "target_expirations": ["2025-11-15", "2025-12-20", "2026-01-17"],
  "account_size": 15000,
  "strategies": ["calendar_spread"],
  "risk_config": {
    "max_concentration": 0.25  // More diversified
  }
}
```

### 4. Unusual Activity Hunter
```javascript
{
  "symbol": "AAPL",
  "account_size": 20000,
  "mode": "auto",  // Let it find unusual activity
  "strategies": ["bull_call_spread", "bear_put_spread", "iron_condor"]
}
```

## Integration with Existing Tools

The `deep_options_analysis` tool **complements** (not replaces) the existing 15 granular tools:

- Use `deep_options_analysis` for: Comprehensive analysis and strategy generation
- Use granular tools for: Specific data queries, custom analysis, debugging

### When to Use Deep Analysis
- Finding trade ideas
- Portfolio construction
- Daily market scans
- Strategy backtesting prep

### When to Use Granular Tools
- Specific option quote lookup
- Custom calculations
- Live monitoring of single contracts
- Debugging data issues

## Performance Considerations

### Execution Time
- Basic analysis (1-2 expirations): 5-10 seconds
- Full analysis (4+ expirations): 15-30 seconds
- Auto-detection mode: Slightly slower due to data scanning

### API Calls
The tool makes multiple API calls:
- 1x option chain snapshot
- 2x per expiration (market structure + volatility)
- Historical data calls for volume analysis (cached when possible)

### Rate Limiting
If you hit API rate limits:
1. Reduce `target_expirations` count
2. Use `mode: "manual"` with specific strikes
3. Increase delays between analyses

## Best Practices

### 1. Start Conservative
```javascript
{
  "risk_config": {
    "max_risk_pct": 0.01,      // 1% per trade
    "min_reward_ratio": 3.0,    // 3:1 minimum
    "max_concentration": 0.20   // Max 20% per position
  }
}
```

### 2. Diversify Expirations
```javascript
{
  "target_expirations": [
    "2025-11-15",  // Weekly
    "2025-12-20",  // Monthly
    "2026-01-17"   // LEAPS
  ]
}
```

### 3. Validate Recommendations
Always review:
- Unusual activity scores
- Volume and open interest
- Bid-ask spreads (not included in analysis)
- Current market conditions

### 4. Monitor Positions
After entering trades:
- Use `get_option_quote` for live monitoring
- Check `get_greeks` for Greeks changes
- Review `get_market_structure` for support/resistance shifts

## Troubleshooting

### No Strategies Generated
**Cause**: Criteria too strict or insufficient data
**Solution**:
- Lower `min_reward_ratio` to 1.5
- Lower `min_prob_profit` to 0.4
- Try `mode: "auto"` to find more strikes
- Check if expirations have liquid options

### High Capital Requirements
**Cause**: Too many strategies, wide spreads
**Solution**:
- Reduce number of `strategies` requested
- Use stricter `min_reward_ratio`
- Lower `max_concentration`
- Specify fewer `strikes_to_analyze`

### API Errors
**Cause**: Rate limiting, invalid expirations
**Solution**:
- Verify expirations exist using `get_option_chain`
- Reduce `target_expirations` count
- Check API key permissions

## Examples

See test files:
- `test-deep-analysis.js` - Manual mode with specific strikes
- `test-deep-analysis-auto.js` - Auto mode with SPY

Run tests:
```bash
node test-deep-analysis.js
node test-deep-analysis-auto.js
```

## Architecture

### Modules

1. **strategy-builder.js** - Strategy generation logic
   - `generateBullCallSpreads()`
   - `generateBearPutSpreads()`
   - `generateIronCondors()`
   - `generateCalendarSpreads()`
   - `rankStrategies()`

2. **position-sizing.js** - Risk management
   - `calculatePositionSize()`
   - `validateRiskParameters()`
   - `generateAllocationReport()`
   - `calculateKellyCriterion()`

3. **pnl-calculator.js** - P&L modeling
   - `calculateSpreadPnL()`
   - `generatePnLScenarios()`
   - `calculateBreakevens()`
   - `calculateExpectedValue()`

### Data Flow

```
Input Parameters
      ↓
Fetch Market Snapshot
      ↓
Analyze Market Structure (per expiration)
      ↓
Detect Unusual Activity
      ↓
Determine Target Strikes (manual/auto/both)
      ↓
Generate Strategy Candidates
      ↓
Rank & Filter Strategies
      ↓
Calculate Position Sizing
      ↓
Generate P&L Scenarios
      ↓
Create Allocation Report
      ↓
Return Comprehensive Analysis
```

## Version History

- **v1.0.0** (2025-11-04)
  - Initial release
  - 4 strategy types
  - Auto-detection mode
  - Full risk management
  - Portfolio-level P&L

## Future Enhancements

Potential additions:
- Additional strategy types (butterflies, ratio spreads)
- Historical backtesting integration
- Real-time Greeks monitoring
- Alerts for unusual activity
- Strategy exit recommendations
- Greeks-based position adjustments
