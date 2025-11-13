# Timestamp Guide

## Overview

All real-time data now includes comprehensive timestamp information to help you understand exactly when data was fetched and how fresh it is. This is critical for making time-sensitive trading decisions.

---

## 🕐 Timestamp Fields

### 1. Option Quotes (`getQuote()` / `getOptionSnapshot()`)

```javascript
{
  // When YOU requested the data
  timestamp: "2024-01-22T14:30:15.123Z",

  // When the data was actually updated by the exchange
  data_timestamp: "2024-01-22T14:30:12.456Z",

  // Quote-specific timestamps
  quote: {
    last_updated: "2024-01-22T14:30:12.456Z"
  },

  // Bid/ask timestamp (if available)
  last_quote: {
    quote_timestamp: "2024-01-22T14:30:14.789Z",
    bid_price: 5.35,
    ask_price: 5.45
  }
}
```

**What they mean:**
- `timestamp` - When you called the API (your request time)
- `data_timestamp` - When the exchange last updated this data
- `quote_timestamp` - When the specific bid/ask was quoted

**Data Age Calculation:**
```javascript
const age = (new Date() - new Date(data_timestamp)) / 1000;
console.log(`Data is ${age} seconds old`);
```

---

### 2. Intraday Bars (`getIntradayBars()`)

```javascript
[
  {
    o: 175.20,
    h: 175.80,
    l: 175.10,
    c: 175.50,
    v: 125000,

    // When this bar closed
    t: 1708012800000,  // Unix milliseconds
    bar_timestamp: "2024-01-22T14:30:00.000Z",

    // When you fetched this data
    fetch_timestamp: "2024-01-22T14:35:15.123Z"
  },
  // ... more bars
]
```

**What they mean:**
- `bar_timestamp` - When this specific bar ended
- `fetch_timestamp` - When you retrieved this bar data

**Current bar detection:**
```javascript
const latestBar = bars[bars.length - 1];
const barAge = (Date.now() - latestBar.t) / 1000;

if (barAge < 60) {
  console.log('Current bar (still forming)');
} else {
  console.log('Completed bar');
}
```

---

### 3. Historical Bars (`getHistoricalBars()`)

Same format as intraday bars:

```javascript
[
  {
    bar_timestamp: "2024-01-22T00:00:00.000Z",  // Bar date
    fetch_timestamp: "2024-01-22T14:35:15.123Z",  // When fetched
    c: 175.50,  // Close price
    // ... other bar data
  }
]
```

---

### 4. Probability Calculations (`calculateProbabilities()`)

```javascript
{
  // When calculation was performed
  calculation_timestamp: "2024-01-22T14:35:20.456Z",

  // When the underlying data was from
  data_timestamp: "2024-01-22T14:35:12.123Z",

  // How old the data is
  data_age_seconds: 8.333,

  // Freshness indicator
  data_freshness: "FRESH",  // FRESH, RECENT, STALE, or OLD

  // Probability metrics
  prob_touch: 0.58,
  // ... other calculations
}
```

**Freshness Levels:**
- `FRESH` - Data < 60 seconds old (very reliable)
- `RECENT` - Data 60-300 seconds old (5 minutes, acceptable)
- `STALE` - Data 300-900 seconds old (15 minutes, caution)
- `OLD` - Data > 900 seconds old (15+ minutes, unreliable)

---

### 5. Market Context (`getCompleteMarketPicture()`)

```javascript
{
  // When market snapshot was taken
  timestamp: "2024-01-22T14:35:25.789Z",

  symbol: "AAPL",

  underlying: {
    price: 175.50,
    // Intraday bars include fetch_timestamp
    intraday: {
      bars_count: 78,  // How many bars (78 * 5min = 6.5 hours)
      vwap: 175.10,
      // ...
    }
  },

  market: {
    vix: 14.2,
    spy_change_percent: 0.35,
    // ...
  }
}
```

---

### 6. Validation Results (`validateTrade()`)

```javascript
{
  // When validation was performed
  timestamp: "2024-01-22T14:35:30.123Z",

  symbol: "ORCL",
  strategy: "iron_condor",
  expiration: "2024-01-26",

  // Overall result
  overall_status: "REJECTED",

  // Each probability check includes timestamps
  probabilities: {
    short_call: {
      calculation_timestamp: "2024-01-22T14:35:28.456Z",
      data_timestamp: "2024-01-22T14:35:20.789Z",
      data_freshness: "FRESH",
      // ...
    }
  }
}
```

---

### 7. Exit Evaluation (`evaluateExit()`)

```javascript
{
  decision: "EXIT_IMMEDIATE",

  // When decision was made
  timestamp: "2024-01-22T15:45:10.123Z",

  // Current price at decision time
  current_price: 248.50,

  // Price trend based on recent history
  price_trend: "UPTREND",

  // Probability data with timestamps
  probabilities: {
    call: {
      calculation_timestamp: "2024-01-22T15:45:08.456Z",
      // ...
    }
  }
}
```

---

## 📊 Practical Examples

### Example 1: Check Data Freshness Before Trading

```javascript
const probabilities = await probCalc.calculateProbabilities(
  'AAPL', 180, '2024-02-16', 'call'
);

console.log('Calculation time:', probabilities.calculation_timestamp);
console.log('Data age:', probabilities.data_age_seconds, 'seconds');
console.log('Freshness:', probabilities.data_freshness);

// Decision based on freshness
if (probabilities.data_freshness === 'OLD') {
  console.log('⚠️ WARNING: Data is over 15 minutes old');
  console.log('⚠️ Consider re-fetching before trading');
  return;
}

if (probabilities.data_freshness === 'FRESH') {
  console.log('✅ Data is fresh (<60 seconds), safe to trade');
}
```

### Example 2: Intraday Bar Age Detection

```javascript
const bars = await client.getIntradayBars('SPY', 5, 'minute');

// Check last bar
const latestBar = bars[bars.length - 1];
const barTimestamp = new Date(latestBar.bar_timestamp);
const fetchTimestamp = new Date(latestBar.fetch_timestamp);
const barAge = (fetchTimestamp - barTimestamp) / 1000;

console.log('Latest bar closed at:', latestBar.bar_timestamp);
console.log('Fetched at:', latestBar.fetch_timestamp);
console.log('Bar age:', barAge, 'seconds');

if (barAge < 60) {
  console.log('🔴 Current bar (still forming)');
  console.log('Price may change before bar closes');
} else if (barAge < 300) {
  console.log('✅ Recent complete bar');
} else {
  console.log('⚠️ Old bar - market may have moved');
}
```

### Example 3: Compare Fetch Times Across Data Sources

```javascript
const [option, vix, spy] = await Promise.all([
  client.getOptionSnapshot('AAPL', 180, '2024-02-16', 'call'),
  client.getQuote('VIX'),
  client.getQuote('SPY')
]);

console.log('Option data:', option.data_timestamp);
console.log('VIX data:', vix.data_timestamp);
console.log('SPY data:', spy.data_timestamp);

// Check if all data is from similar times
const timestamps = [
  new Date(option.data_timestamp),
  new Date(vix.data_timestamp),
  new Date(spy.data_timestamp)
];

const maxSpread = Math.max(...timestamps) - Math.min(...timestamps);
const spreadSeconds = maxSpread / 1000;

if (spreadSeconds > 60) {
  console.log(`⚠️ Data timestamps spread across ${spreadSeconds}s`);
  console.log('⚠️ Data may not be synchronized');
}
```

### Example 4: Track Validation Timing

```javascript
const startTime = Date.now();

const validation = await validator.validateTrade(
  'ORCL',
  'iron_condor',
  { short_call: 235, short_put: 230 },
  '2024-01-26'
);

const endTime = Date.now();
const duration = (endTime - startTime) / 1000;

console.log('Validation completed in:', duration, 'seconds');
console.log('Validation timestamp:', validation.timestamp);

// Check if any data was stale
const callProb = validation.probabilities.short_call;
if (callProb.data_freshness !== 'FRESH') {
  console.log(`⚠️ Call probability used ${callProb.data_freshness} data`);
  console.log(`Data was ${callProb.data_age_seconds}s old`);
}
```

### Example 5: Real-Time Monitoring Loop

```javascript
async function monitorPosition(symbol, strikes) {
  setInterval(async () => {
    const now = new Date().toISOString();
    console.log(`\n[${now}] Checking position...`);

    const evaluation = await decisionTree.evaluateExit(
      symbol,
      { short_call: strikes.call, expiration: '2024-02-16' },
      currentPrice
    );

    console.log('Decision made at:', evaluation.timestamp);
    console.log('Current price:', evaluation.current_price);
    console.log('Decision:', evaluation.decision);
    console.log('Urgency:', evaluation.urgency);

    // Check how fresh the data is
    const probData = evaluation.probabilities.call;
    const dataAge = probData.data_age_seconds;

    if (dataAge > 300) {
      console.log('⚠️ WARNING: Using data from', dataAge, 'seconds ago');
    }

    if (evaluation.decision === 'EXIT_IMMEDIATE') {
      console.log('🚨 EXIT SIGNAL - Stopping monitor');
      clearInterval();
    }
  }, 60000);  // Check every minute
}
```

---

## 🎯 Best Practices

### 1. Always Check Data Freshness for Critical Decisions

```javascript
if (data.data_freshness === 'FRESH') {
  // Safe to execute trade
} else {
  // Re-fetch before trading
}
```

### 2. Log Timestamps for Audit Trail

```javascript
console.log({
  action: 'TRADE_EXECUTED',
  timestamp: new Date().toISOString(),
  validation_timestamp: validation.timestamp,
  data_age: validation.probabilities.short_call.data_age_seconds
});
```

### 3. Set Alerts for Stale Data

```javascript
if (data.data_age_seconds > 300) {
  sendAlert('Data is over 5 minutes old - refresh needed');
}
```

### 4. Use Timestamps for Performance Monitoring

```javascript
const startFetch = Date.now();
const data = await client.getOptionSnapshot(...);
const fetchDuration = Date.now() - startFetch;

console.log('API call took:', fetchDuration, 'ms');
console.log('Data age:', data.data_age_seconds, 's');
console.log('Total staleness:', (fetchDuration/1000 + data.data_age_seconds), 's');
```

---

## ⏱️ Expected Latencies

| Data Source | Typical Latency |
|-------------|-----------------|
| Option quote | 0.5-2 seconds |
| Stock quote | 0.3-1 second |
| VIX/SPY quote | 0.3-1 second |
| Intraday bars (5-min) | 5-30 seconds after bar close |
| Intraday bars (1-min) | 1-10 seconds after bar close |
| Technical indicators | N/A (daily only) |

**Total validation time:** 1-3 seconds (parallel API calls)

---

## 🚨 Timestamp Warning Thresholds

```javascript
// Recommended thresholds
const THRESHOLDS = {
  FRESH: 60,      // < 1 minute
  RECENT: 300,    // < 5 minutes
  STALE: 900,     // < 15 minutes
  OLD: Infinity   // > 15 minutes
};

function assessDataFreshness(ageSeconds) {
  if (ageSeconds < THRESHOLDS.FRESH) return 'FRESH';
  if (ageSeconds < THRESHOLDS.RECENT) return 'RECENT';
  if (ageSeconds < THRESHOLDS.STALE) return 'STALE';
  return 'OLD';
}

function shouldAllowTrade(freshness) {
  return freshness === 'FRESH' || freshness === 'RECENT';
}
```

---

## Summary

**Every piece of data now includes:**

✅ **When it was fetched** (`timestamp` / `fetch_timestamp`)
✅ **When it was created** (`data_timestamp` / `bar_timestamp`)
✅ **How old it is** (`data_age_seconds`)
✅ **Freshness indicator** (`data_freshness`)

**Use timestamps to:**
- ✅ Ensure data is fresh before trading
- ✅ Build audit trails
- ✅ Detect synchronized data
- ✅ Monitor API performance
- ✅ Set up alerts for stale data

**Never trade on OLD data!** Always check `data_freshness` before executing.
