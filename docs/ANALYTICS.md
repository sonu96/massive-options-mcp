# Advanced Options Analytics

This document describes the advanced analytics calculations available in the Massive Options MCP server.

## Overview

The `get_option_analytics` tool provides comprehensive options analysis beyond basic Greeks, including:

- **Value Analysis**: Intrinsic value, time value, break-even calculations
- **Probability Calculations**: Black-Scholes probability of finishing ITM/OTM
- **Expected Move**: One and two sigma price ranges based on implied volatility
- **Risk Metrics**: Leverage, daily theta decay, volume/OI ratios
- **Risk/Reward Analysis**: Profit/loss scenarios with target prices

## Using the Analytics Tool

### Basic Usage

```javascript
// Get analytics for a specific option
const analytics = await mcp.get_option_analytics({
  symbol: "AAPL",
  optionType: "call",
  strike: 175,
  expiration: "2025-01-17"
});
```

### With Target Price Analysis

```javascript
// Include risk/reward analysis for a target price
const analytics = await mcp.get_option_analytics({
  symbol: "AAPL",
  optionType: "call", 
  strike: 175,
  expiration: "2025-01-17",
  targetPrice: 185  // Optional target for P/L analysis
});
```

## Analytics Output Structure

### Core Analytics

```javascript
{
  // Contract identification
  ticker: "AAPL250117C00175000",
  underlying: "AAPL",
  underlying_price: 180.50,
  
  // Contract details
  contract: {
    type: "call",
    strike: 175,
    expiration: "2025-01-17",
    exercise_style: "american"
  },
  
  // Market data
  market: {
    last_price: 8.25,
    volume: 1234,
    open_interest: 5678,
    change: 0.50,
    change_percent: 6.45
  },
  
  // Calculated analytics
  analytics: {
    // Value breakdown
    price: 8.25,
    intrinsicValue: 5.50,        // Stock price - Strike (for ITM call)
    timeValue: 2.75,             // Option price - Intrinsic value
    breakeven: 183.25,           // Strike + Premium paid
    
    // Moneyness
    moneyness: "ITM (In The Money)",
    moneynessDetail: "ITM",      // Deep ITM, ITM, ATM, OTM, Deep OTM
    moneynessPercent: 3.14,      // % distance from strike
    
    // Probability analysis
    probabilityITM: 0.6234,      // 62.34% chance of finishing ITM
    probabilityOTM: 0.3766,      // 37.66% chance of finishing OTM
    
    // Expected move (based on IV)
    expectedMove: {
      amount: 12.50,             // Dollar move
      percent: 6.93,             // Percentage move
      oneSigmaRange: [168, 193], // 68% probability range
      twoSigmaRange: [155.5, 205.5]  // 95% probability range
    },
    
    // Risk metrics
    leverage: 8.75,              // Delta * Stock Price / Option Price
    dailyTheta: -0.0247,         // Daily time decay
    dte: 45,                     // Days to expiration
    
    // Volume analysis
    volumeOIRatio: 0.22,         // Volume / Open Interest
    volumeInterpretation: "Low activity - mostly holding",
    unusualActivity: false       // True if ratio > 2
  },
  
  // Original Greeks from API
  original_greeks: {
    delta: 0.65,
    gamma: 0.015,
    theta: -9.02,
    vega: 0.25,
    rho: 0.12
  }
}
```

### Risk/Reward Analysis (when target price provided)

```javascript
risk_reward: {
  maxRisk: 8.25,               // Premium paid
  maxReward: Infinity,         // Unlimited for calls
  profitAtTarget: 1.75,        // Profit if stock hits target
  riskRewardRatio: "Unlimited", // Or numeric ratio for puts
  breakEvenMove: 8.25,         // Dollar move to break even
  breakEvenPercent: 4.57       // Percentage move to break even
}
```

## Calculation Details

### Probability of ITM (Black-Scholes)

Uses the Black-Scholes model to calculate the probability of an option finishing in-the-money at expiration:

- **Inputs**: Stock price, strike, volatility, time to expiration, risk-free rate
- **Method**: Calculates d2 from Black-Scholes and applies cumulative normal distribution
- **Output**: Probability between 0 and 1

### Expected Move

Calculates the expected price range based on implied volatility:

- **Formula**: Stock Price × IV × √(DTE/365)
- **One Sigma**: 68% probability the stock stays within this range
- **Two Sigma**: 95% probability the stock stays within this range

### Leverage (Lambda)

Measures how much the option price moves relative to stock price moves:

- **Formula**: |Delta × Stock Price / Option Price|
- **Interpretation**: A leverage of 10 means a 1% stock move causes a 10% option move

### Volume/OI Ratio

Analyzes trading activity:

- **Ratio > 2**: Unusual activity, possible new positions
- **Ratio 0.5-2**: Moderate activity
- **Ratio < 0.5**: Low activity, mostly holding

## Example Use Cases

### 1. Evaluating Option Premium

```javascript
// Is this call option overpriced?
const analytics = await getAnalytics("TSLA", "call", 250, "2025-01-17");

// Check if time value is excessive
if (analytics.analytics.timeValue > analytics.analytics.intrinsicValue) {
  console.log("High time premium - option may be expensive");
}

// Check probability vs market pricing
if (analytics.analytics.probabilityITM < 0.3 && analytics.market.last_price > 5) {
  console.log("Low probability but high premium - potentially overpriced");
}
```

### 2. Risk Assessment

```javascript
// Assess risk for a put spread
const longPut = await getAnalytics("SPY", "put", 480, "2025-01-17", 470);
const shortPut = await getAnalytics("SPY", "put", 470, "2025-01-17", 470);

const maxRisk = longPut.market.last_price - shortPut.market.last_price;
const maxReward = 10; // Spread width
const breakeven = 480 - maxRisk;

console.log(`Put Spread Analysis:
  Max Risk: $${maxRisk}
  Max Reward: $${maxReward}
  Break-even: $${breakeven}
  Risk/Reward: ${(maxReward/maxRisk).toFixed(2)}
`);
```

### 3. Detecting Unusual Activity

```javascript
// Screen for unusual options activity
const chain = await getOptionChain("AAPL");

for (const option of chain.results) {
  const analytics = await getAnalytics(
    "AAPL", 
    option.contract_type,
    option.strike_price,
    option.expiration_date
  );
  
  if (analytics.analytics.unusualActivity) {
    console.log(`Unusual activity detected:
      ${option.contract_type} ${option.strike_price} ${option.expiration_date}
      Volume/OI: ${analytics.analytics.volumeOIRatio}
      Volume: ${analytics.market.volume}
    `);
  }
}
```

## Performance Considerations

- Analytics calculations are performed locally after fetching market data
- Each analytics call makes one API request to get current quote data
- For screening multiple options, consider using `get_option_chain_snapshot` first
- Calculations are optimized for accuracy over speed

## Limitations

- Probability calculations assume log-normal distribution (Black-Scholes)
- Expected move calculations assume constant volatility
- Greeks are provided by the API, not calculated internally
- Historical volatility analysis not yet implemented
- Advanced Greeks (Vanna, Vomma, etc.) not yet available