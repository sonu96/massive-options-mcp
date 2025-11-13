# Real-Time Options Data Guide

## Overview

The validation system has full access to real-time options pricing and market data through the Massive API. This document explains what real-time data is available and how to use it.

---

## 🔴 Real-Time Option Prices

### Method: `getOptionSnapshot()`

**Purpose:** Get real-time option quote with full Greeks and IV

**Example:**
```javascript
const snapshot = await client.getOptionSnapshot('AAPL', 180, '2024-02-16', 'call');
```

**Returns:**
```javascript
{
  // Real-time pricing
  last_price: 5.40,
  bid: 5.35,
  ask: 5.45,
  mid: 5.40,

  // Real-time Greeks (calculated by exchange)
  greeks: {
    delta: 0.65,
    gamma: 0.05,
    theta: -0.10,
    vega: 0.20
  },

  // Real-time Implied Volatility
  implied_volatility: 0.35,  // 35% IV

  // Today's activity
  volume: 1250,
  open_interest: 15000,

  // Contract details
  strike_price: 180,
  expiration_date: '2024-02-16',
  contract_type: 'call',

  // Underlying
  underlying_price: 175.50,
  days_to_expiration: 21,
  moneyness: 'OTM'
}
```

**Update Frequency:** Real-time during market hours (updated every few seconds)

**Massive API Endpoint:** `GET /v3/snapshot/options/{symbol}`

---

## 📊 Intraday Price Bars

### Method: `getIntradayBars()`

**Purpose:** Get minute-by-minute price bars for VWAP and range analysis

**Example:**
```javascript
// Get 5-minute bars for today
const bars = await client.getIntradayBars('AAPL', 5, 'minute');

// Get 1-minute bars for precision
const bars1m = await client.getIntradayBars('AAPL', 1, 'minute');
```

**Returns:**
```javascript
[
  {
    o: 175.20,    // Open
    h: 175.80,    // High
    l: 175.10,    // Low
    c: 175.50,    // Close
    v: 125000,    // Volume
    vw: 175.45,   // VWAP (Volume-Weighted Average Price)
    t: 1708012800000,  // Timestamp
    n: 450        // Number of trades
  },
  // ... more bars
]
```

**Available Intervals:**
- 1 minute
- 5 minutes
- 15 minutes
- 30 minutes
- 1 hour

**Use Cases:**
- Calculate intraday VWAP
- Measure intraday range (high - low)
- Detect price trends
- Identify support/resistance levels
- Monitor distance from VWAP

**Massive API Endpoint:** `GET /v2/aggs/ticker/{symbol}/range/{multiplier}/{timespan}/{from}/{to}`

---

## 📈 Historical Bars (for Volatility)

### Method: `getHistoricalBars()`

**Purpose:** Get daily bars for calculating historical volatility and ATR

**Example:**
```javascript
// Get 30 days of daily bars
const bars = await client.getHistoricalBars(
  'AAPL',
  1,           // 1 day bars
  'day',
  '2024-01-01',
  '2024-02-01'
);
```

**Returns:** Same format as intraday bars, but daily aggregates

**Use Cases:**
- Calculate 10-day, 30-day historical volatility
- Calculate ATR (Average True Range)
- Compare implied vs realized volatility
- Identify typical daily move size

---

## 📉 Technical Indicators

### RSI (Relative Strength Index)

**Method:** `getRSI(symbol, period)`

```javascript
const rsi = await client.getRSI('AAPL', 14);
// Returns: { values: [{ timestamp, value: 58.5 }] }
```

**Interpretation:**
- RSI > 70: Overbought
- RSI < 30: Oversold
- RSI 40-60: Neutral

### SMA (Simple Moving Average)

**Method:** `getSMA(symbol, period)`

```javascript
const sma20 = await client.getSMA('AAPL', 20);
const sma50 = await client.getSMA('AAPL', 50);
const sma200 = await client.getSMA('AAPL', 200);
```

**Use Cases:**
- Price vs SMA = support/resistance
- Price > SMA = bullish trend
- Price < SMA = bearish trend

### EMA (Exponential Moving Average)

**Method:** `getEMA(symbol, period)`

```javascript
const ema20 = await client.getEMA('AAPL', 20);
```

**Reacts faster to price changes than SMA**

### MACD

**Method:** `getMACD(symbol)`

```javascript
const macd = await client.getMACD('AAPL');
// Returns: { values: [{ timestamp, value, signal, histogram }] }
```

---

## 🌍 Market Context Data

### VIX (Volatility Index)

**Method:** `getQuote('VIX')`

```javascript
const vix = await client.getQuote('VIX');
// Returns: { price: 14.2, change_percent: -2.5 }
```

**Interpretation:**
- VIX < 15: Low volatility (complacent)
- VIX 15-20: Normal volatility
- VIX 20-30: Elevated volatility
- VIX > 30: High fear/panic

### SPY (Market Direction)

**Method:** `getQuote('SPY')`

```javascript
const spy = await client.getQuote('SPY');
// Returns: { price: 485.20, change_percent: 0.35, volume: 50M }
```

### QQQ (Tech Sector)

**Method:** `getQuote('QQQ')`

```javascript
const qqq = await client.getQuote('QQQ');
```

---

## 🔄 Update Frequency

| Data Type | Update Frequency | Latency |
|-----------|-----------------|---------|
| Option quotes | Real-time | < 1 second |
| Greeks | Real-time | < 1 second |
| Implied Volatility | Real-time | < 1 second |
| Intraday bars (1-min) | Every minute | ~10 seconds |
| Intraday bars (5-min) | Every 5 minutes | ~30 seconds |
| VIX/SPY quotes | Real-time | < 1 second |
| Technical indicators | End of day | Updated after close |

---

## 💡 Usage Examples

### Example 1: Pre-Trade Validation

```javascript
// Get real-time option data
const option = await client.getOptionSnapshot('ORCL', 235, '2024-01-26', 'call');

// Check current conditions
console.log('Current IV:', (option.implied_volatility * 100).toFixed(1) + '%');
console.log('Delta:', option.greeks.delta);
console.log('Bid/Ask:', option.bid, '/', option.ask);

// Get underlying bars for ATR
const bars = await client.getHistoricalBars('ORCL', 1, 'day', '2024-01-01', '2024-01-26');
const atr = calculateATR(bars, 14);

// Calculate distance
const distance = Math.abs(option.underlying_price - option.strike_price);
const distanceInATR = distance / atr;

console.log('Distance to strike:', distanceInATR.toFixed(2), 'ATR');

// Decision
if (option.implied_volatility > 0.80) {
  console.log('⛔ REJECT: IV too high');
} else if (distanceInATR < 1.5) {
  console.log('⛔ REJECT: Strike too close');
} else {
  console.log('✅ APPROVED');
}
```

### Example 2: Intraday Monitoring

```javascript
// Get current price and intraday bars
const bars = await client.getIntradayBars('TSLA', 5, 'minute');
const vwap = calculateVWAP(bars);

const currentPrice = bars[bars.length - 1].c;
const distanceFromVWAP = ((currentPrice - vwap) / vwap * 100);

console.log('Current:', currentPrice);
console.log('VWAP:', vwap);
console.log('Distance:', distanceFromVWAP.toFixed(2) + '%');

if (Math.abs(distanceFromVWAP) > 2) {
  console.log('⚠️ Price far from VWAP - potential mean reversion');
}
```

### Example 3: Market Context Check

```javascript
// Check overall market conditions
const [spy, vix, qqq] = await Promise.all([
  client.getQuote('SPY'),
  client.getQuote('VIX'),
  client.getQuote('QQQ')
]);

console.log('SPY:', spy.change_percent.toFixed(2) + '%');
console.log('VIX:', vix.price.toFixed(2));
console.log('QQQ:', qqq.change_percent.toFixed(2) + '%');

// Risk assessment
if (vix.price > 25) {
  console.log('⚠️ High volatility environment');
}

if (Math.abs(spy.change_percent) > 1.5) {
  console.log('⚠️ Strong market movement');
}

// Tech vs broad market
const techVsBroad = qqq.change_percent - spy.change_percent;
if (techVsBroad > 0.5) {
  console.log('💡 Tech outperforming');
} else if (techVsBroad < -0.5) {
  console.log('💡 Tech underperforming');
}
```

---

## 🎯 Data Coverage Summary

### ✅ What You Have (Real-Time)

| Data | Available | Update Rate |
|------|-----------|-------------|
| Option bid/ask | ✅ | Real-time |
| Option Greeks | ✅ | Real-time |
| Implied Volatility | ✅ | Real-time |
| Underlying price | ✅ | Real-time |
| Intraday bars | ✅ | Every 1-5 min |
| Historical bars | ✅ | Daily |
| Technical indicators | ✅ | Daily |
| VIX/SPY/QQQ | ✅ | Real-time |
| Volume/OI | ✅ | Real-time |
| VWAP | ✅ | Calculated from bars |
| ATR | ✅ | Calculated from bars |
| Historical Volatility | ✅ | Calculated from bars |

### ❌ What You Don't Have

| Data | Status |
|------|--------|
| Level 2 order book | ❌ Not available |
| Dark pool prints | ❌ Not available |
| Unusual activity alerts | ❌ Not available |
| News events | ❌ Not available |
| Earnings calendar | ❌ Not available |

---

## 🚀 Performance Tips

### 1. Batch Requests in Parallel

```javascript
// ✅ Good: Parallel requests
const [option, bars, vix, spy] = await Promise.all([
  client.getOptionSnapshot('AAPL', 180, '2024-02-16', 'call'),
  client.getIntradayBars('AAPL', 5, 'minute'),
  client.getQuote('VIX'),
  client.getQuote('SPY')
]);

// ❌ Bad: Sequential requests
const option = await client.getOptionSnapshot(...);
const bars = await client.getIntradayBars(...);
const vix = await client.getQuote('VIX');
```

### 2. Cache Technical Indicators

Technical indicators update only once per day, so cache them:

```javascript
// Cache for the trading day
const cache = {
  date: new Date().toISOString().split('T')[0],
  rsi: null,
  sma20: null
};

async function getRSICached(symbol) {
  if (cache.rsi && cache.date === new Date().toISOString().split('T')[0]) {
    return cache.rsi;
  }

  cache.rsi = await client.getRSI(symbol);
  return cache.rsi;
}
```

### 3. Reuse Historical Bars

Historical bars don't change, so fetch once:

```javascript
// Fetch once per position
const bars30d = await client.getHistoricalBars(symbol, 1, 'day', from, to);

// Reuse for multiple calculations
const hv = calculateRealizedVolatility(bars30d);
const atr = calculateATR(bars30d);
const avgRange = calculateAverageRange(bars30d);
```

---

## 🔧 Troubleshooting

### Issue: "Option contract not found"

**Cause:** Strike/expiration doesn't exist or no recent trades

**Solution:**
1. Verify option chain has the contract
2. Check if expiration has passed
3. Try a different strike closer to ATM

### Issue: Intraday bars array is empty

**Cause:** Market closed or data not available yet

**Solution:**
1. Check if market is open
2. Use previous day's data as fallback
3. Add error handling for empty arrays

### Issue: IV is null or 0

**Cause:** No recent trades to calculate IV

**Solution:**
1. Use mid-point of bid/ask to calculate IV
2. Fallback to historical volatility
3. Warn user about stale data

---

## 📚 Related Documentation

- [VALIDATION_SYSTEM.md](./VALIDATION_SYSTEM.md) - How validation uses this data
- [Massive API Docs](https://massive.com/docs) - Full API reference
- [ADVANCED_FEATURES.md](./ADVANCED_FEATURES.md) - Advanced usage patterns

---

## Summary

You have **complete real-time access** to everything needed for professional-grade options trading:

✅ **Real-time option prices** with bid/ask/Greeks/IV
✅ **Intraday bars** for VWAP and range analysis
✅ **Historical data** for volatility calculations
✅ **Technical indicators** for trend analysis
✅ **Market context** (VIX, SPY, QQQ)

The only things missing are Level 2 data and news, which aren't critical for the validation system. **Everything you need to prevent another ORCL loss is available in real-time.**
