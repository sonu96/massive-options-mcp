# Options Screener

The Options Screener is a powerful MCP tool that allows AI assistants (like Claude) to discover and filter options across the market based on multiple criteria. Instead of analyzing a specific symbol, the screener helps you **find opportunities** across 70+ popular tickers.

## Overview

The `screen_options` tool enables natural language queries like:

- "Find high IV calls for selling premium"
- "Show me liquid OTM puts with 30-45 DTE"
- "Find covered call candidates with delta 0.30-0.40"
- "Screen for cheap hedging puts under $1"

## Features

- **Multi-Symbol Screening**: Screen across 70+ popular symbols or provide a custom list
- **Advanced Filtering**: Filter by volume, open interest, delta, IV, price, DTE, moneyness, liquidity
- **Intelligent Caching**: 5-minute cache reduces API calls and improves performance
- **Flexible Sorting**: Sort results by volume, IV, delta, liquidity score, price, or open interest
- **Liquidity Assessment**: Automatically evaluates bid-ask spreads and assigns quality ratings
- **Fast Parallel Fetching**: Fetches multiple symbol chains in parallel for speed

## Quick Start

### Basic Usage (via Claude)

```
User: Find high volume options on SPY with good liquidity

Claude calls screen_options with:
{
  "symbols": ["SPY"],
  "min_volume": 100,
  "liquidity_quality": "GOOD",
  "limit": 20
}
```

### Programmatic Usage

```javascript
import { MassiveOptionsClient } from './massive-client.js';

const client = new MassiveOptionsClient(process.env.MASSIVE_API_KEY);

const results = await client.screenOptions({
  symbols: ['AAPL', 'MSFT', 'GOOGL'],
  min_volume: 100,
  min_open_interest: 500,
  option_type: 'call',
  min_delta: 0.30,
  max_delta: 0.40,
  min_days_to_expiration: 30,
  max_days_to_expiration: 45,
  liquidity_quality: 'GOOD',
  sort_by: 'iv',
  limit: 20
});

console.log(`Found ${results.total_matched} matches`);
console.log(`Top 5:`, results.matches.slice(0, 5));
```

## Filter Parameters

### Symbol Selection

| Parameter | Type | Description |
|-----------|------|-------------|
| `symbols` | array | Array of ticker symbols to screen. If not provided, uses 70+ default symbols (SPY, QQQ, AAPL, TSLA, NVDA, etc.) |

**Default Symbols List**: SPY, QQQ, IWM, DIA, VXX, GLD, SLV, TLT, AAPL, MSFT, GOOGL, AMZN, META, NVDA, TSLA, AMD, and 55+ more large-cap stocks across tech, finance, healthcare, energy, and consumer sectors.

### Volume & Open Interest

| Parameter | Type | Description |
|-----------|------|-------------|
| `min_volume` | number | Minimum daily volume (e.g., 100 for liquid options) |
| `max_volume` | number | Maximum daily volume |
| `min_open_interest` | number | Minimum open interest (e.g., 500 for institutional interest) |

### Greeks & Probability

| Parameter | Type | Description |
|-----------|------|-------------|
| `min_delta` | number | Minimum delta (absolute value). Works for both calls and puts. Example: 0.30 = ~70% probability ITM |
| `max_delta` | number | Maximum delta (absolute value). Example: 0.40 for probability range |

**Note**: Delta filters use absolute values, so both calls (positive delta) and puts (negative delta) are evaluated consistently.

### Implied Volatility

| Parameter | Type | Description |
|-----------|------|-------------|
| `min_iv` | number | Minimum IV as decimal (e.g., 0.30 for 30% IV - good for premium selling) |
| `max_iv` | number | Maximum IV as decimal (e.g., 0.60 to avoid excessive volatility) |

### Price

| Parameter | Type | Description |
|-----------|------|-------------|
| `min_price` | number | Minimum option premium (e.g., 0.50 for $50 minimum) |
| `max_price` | number | Maximum option premium (e.g., 5.00 to avoid expensive options) |

### Option Type

| Parameter | Type | Description |
|-----------|------|-------------|
| `option_type` | enum | Filter by type: `"call"`, `"put"`, or `"both"` (default: both) |

### Days to Expiration (DTE)

| Parameter | Type | Description |
|-----------|------|-------------|
| `min_days_to_expiration` | number | Minimum DTE (e.g., 30 for at least 1 month out) |
| `max_days_to_expiration` | number | Maximum DTE (e.g., 45 for 30-45 DTE range) |

### Moneyness

| Parameter | Type | Description |
|-----------|------|-------------|
| `moneyness` | enum | Filter by position: `"ITM"` (in the money), `"ATM"` (at the money), `"OTM"` (out of the money), or `"all"` (default) |

**Moneyness Categories**:
- **Calls**: ITM if stock > strike×1.01, OTM if stock < strike×0.99
- **Puts**: ITM if stock < strike×0.99, OTM if stock > strike×1.01
- **ATM**: Neither ITM nor OTM (within 1% of strike)

### Liquidity Quality

| Parameter | Type | Description |
|-----------|------|-------------|
| `liquidity_quality` | enum | Minimum quality: `"EXCELLENT"`, `"GOOD"`, or `"FAIR"` |

**Liquidity Ratings**:
- **EXCELLENT**: Tight spreads (<2%) + high volume (>200) + high OI (>1000)
- **GOOD**: Decent spreads (<5%) + moderate volume (>100) + moderate OI (>500)
- **FAIR**: Wider spreads (<10%) + some volume (>20) + some OI (>100)
- **POOR**: Everything else

### Sorting & Limiting

| Parameter | Type | Description |
|-----------|------|-------------|
| `sort_by` | enum | Sort by: `"volume"` (default), `"open_interest"`, `"iv"`, `"delta"`, `"price"`, `"liquidity_score"` |
| `limit` | number | Maximum results to return (default: 50, max: 200) |

## Common Screening Strategies

### 1. Covered Call Candidates

Find OTM calls 30-45 DTE with moderate delta for selling against stock holdings:

```javascript
{
  option_type: 'call',
  moneyness: 'OTM',
  min_delta: 0.25,
  max_delta: 0.40,
  min_days_to_expiration: 30,
  max_days_to_expiration: 45,
  min_volume: 50,
  liquidity_quality: 'GOOD',
  sort_by: 'iv',
  limit: 20
}
```

### 2. Cash-Secured Puts

Find OTM puts with high IV for generating income:

```javascript
{
  option_type: 'put',
  moneyness: 'OTM',
  min_iv: 0.35,
  min_delta: 0.15,
  max_delta: 0.30,
  min_days_to_expiration: 21,
  max_days_to_expiration: 45,
  min_open_interest: 500,
  liquidity_quality: 'GOOD',
  sort_by: 'iv',
  limit: 25
}
```

### 3. Portfolio Hedging

Find cheap OTM puts for downside protection:

```javascript
{
  symbols: ['SPY', 'QQQ', 'IWM'],
  option_type: 'put',
  moneyness: 'OTM',
  min_delta: 0.05,
  max_delta: 0.15,
  max_price: 1.00,
  min_days_to_expiration: 30,
  max_days_to_expiration: 60,
  min_volume: 100,
  sort_by: 'price',
  limit: 20
}
```

### 4. High IV Plays

Find options with elevated IV for premium selling strategies:

```javascript
{
  min_iv: 0.40,
  min_days_to_expiration: 21,
  max_days_to_expiration: 45,
  min_open_interest: 500,
  liquidity_quality: 'GOOD',
  sort_by: 'iv',
  limit: 30
}
```

### 5. Swing Trading Setups

Find ATM/slightly OTM calls with decent delta for directional plays:

```javascript
{
  option_type: 'call',
  min_delta: 0.50,
  max_delta: 0.70,
  min_volume: 200,
  min_days_to_expiration: 30,
  max_days_to_expiration: 60,
  liquidity_quality: 'EXCELLENT',
  sort_by: 'liquidity_score',
  limit: 15
}
```

### 6. Deep Value Options

Find cheap options with reasonable liquidity:

```javascript
{
  max_price: 0.50,
  min_volume: 50,
  min_open_interest: 200,
  min_days_to_expiration: 14,
  max_days_to_expiration: 30,
  liquidity_quality: 'FAIR',
  sort_by: 'volume',
  limit: 25
}
```

## Response Structure

```javascript
{
  success: true,
  matches: [
    {
      ticker: 'O:SPY251219C00595000',
      underlying_symbol: 'SPY',
      contract_type: 'call',
      strike: 595,
      expiration: '2025-12-19',
      days_to_expiration: 35,
      moneyness: 'OTM',

      // Pricing
      bid: 2.45,
      ask: 2.50,
      midpoint: 2.475,
      last: 2.48,

      // Volume & Interest
      volume: 1523,
      open_interest: 8942,

      // Greeks
      delta: 0.35,
      gamma: 0.012,
      theta: -0.08,
      vega: 0.15,

      // Volatility
      implied_volatility: 0.42,

      // Underlying
      underlying_price: 585.32,
      break_even_price: 597.475,

      // Liquidity
      liquidity_quality: 'EXCELLENT',
      liquidity_score: 92.5,
      bid_ask_spread: 0.05,
      bid_ask_spread_percent: 2.02,

      // Additional
      change_percent: 3.25,
      vwap: 2.46
    },
    // ... more matches
  ],
  total_screened: 15234,      // Total options examined
  total_matched: 87,          // Options matching criteria
  returned: 20,               // Results in response (limited by 'limit' param)
  symbols_screened: 70,       // Number of symbols screened
  cache_hits: 65,             // Symbols loaded from cache
  cache_misses: 5,            // Symbols fetched from API
  execution_time_ms: 2345,    // Total execution time
  criteria: { /* echo of input criteria */ }
}
```

## Performance & Caching

### Caching Strategy

- **Cache Duration**: 5 minutes
- **Cache Scope**: Option chain data per symbol
- **Cache Benefits**:
  - Reduces API calls (saves costs)
  - Improves response time (typically 3-10x faster on cache hits)
  - Allows multiple screening queries without re-fetching data

### Cache Statistics

Every response includes cache metrics:

```javascript
{
  cache_hits: 65,      // Symbols loaded from cache
  cache_misses: 5,     // Symbols fetched from API
  execution_time_ms: 2345
}
```

**Performance Example**:
- First call (cold cache): ~8-15 seconds for 70 symbols
- Second call (warm cache): ~1-3 seconds for same symbols
- Third call within 5 min: ~1-3 seconds (still cached)

### Parallel Fetching

The screener fetches option chains in parallel with a concurrency limit:
- **Batch Size**: 10 symbols at a time
- **Purpose**: Balance speed vs. API rate limits
- **Result**: Significantly faster than sequential fetching

## Limitations

### 1. Symbol Coverage

- **Default**: 70+ popular, high-volume symbols
- **Custom**: Can provide your own symbol list via `symbols` parameter
- **Not Supported**: Scanning ALL market symbols (would require thousands of API calls)

### 2. API Rate Limits

- Respects Massive API rate limits via batching
- 5-minute cache helps minimize API usage
- For extensive screening across many symbols, consider running during off-peak hours

### 3. Data Freshness

- Cached data is up to 5 minutes old
- For real-time precision, use `get_option_quote` on specific contracts
- Screener is optimized for **discovery**, not tick-by-tick monitoring

### 4. Filtering Precision

- Some filters (like liquidity quality) depend on data availability
- Missing Greeks or IV values may exclude otherwise valid options
- Results are best-effort based on available market data

## Best Practices

### 1. Start Narrow, Then Expand

Begin with a focused search:

```javascript
// Good: Specific criteria
{ symbols: ['SPY'], min_volume: 100, option_type: 'call', limit: 10 }

// Not ideal: Too broad (slow + many results)
{ limit: 200 }
```

### 2. Use Liquidity Filters

Always filter for liquid options to ensure tradability:

```javascript
{
  min_volume: 50,
  min_open_interest: 100,
  liquidity_quality: 'GOOD'
}
```

### 3. Combine Related Filters

For covered calls, combine multiple relevant filters:

```javascript
{
  option_type: 'call',
  moneyness: 'OTM',
  min_delta: 0.25,
  max_delta: 0.40,
  min_days_to_expiration: 30,
  max_days_to_expiration: 45
}
```

### 4. Sort by Relevance

Choose sorting based on your strategy:

- **Premium selling**: `sort_by: 'iv'` (highest IV first)
- **Liquidity concerns**: `sort_by: 'liquidity_score'`
- **Popular options**: `sort_by: 'volume'`
- **Institutional interest**: `sort_by: 'open_interest'`

### 5. Use Reasonable Limits

Balance comprehensiveness with performance:

```javascript
{ limit: 20 }  // Good for quick scans
{ limit: 50 }  // Default, good balance
{ limit: 200 } // Maximum, for comprehensive analysis
```

## Troubleshooting

### No Matches Found

**Possible causes**:
1. Criteria too restrictive (try relaxing filters)
2. No options available for selected symbols
3. Market data temporarily unavailable

**Solutions**:
- Remove one filter at a time to identify the constraint
- Check if symbols have active options markets
- Try with highly liquid symbols (SPY, QQQ) first

### Slow Performance

**Possible causes**:
1. Too many symbols (cold cache)
2. Network latency
3. API rate limiting

**Solutions**:
- Reduce number of symbols
- Wait for cache to warm up (second call will be faster)
- Use smaller batches during market hours

### Missing Data Fields

Some options may have incomplete data:
- **Greeks**: May be unavailable for deep ITM/OTM options
- **IV**: Not always calculated for illiquid options
- **Volume**: 0 for newly listed contracts

Filters that depend on missing fields will exclude these options.

## Example Claude Queries

Here are natural language queries Claude can interpret and execute:

1. **"Find covered call opportunities on tech stocks"**
   ```javascript
   {
     symbols: ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META'],
     option_type: 'call',
     moneyness: 'OTM',
     min_delta: 0.25,
     max_delta: 0.40,
     min_days_to_expiration: 30,
     max_days_to_expiration: 45,
     liquidity_quality: 'GOOD',
     sort_by: 'iv'
   }
   ```

2. **"Show me high IV options for selling premium"**
   ```javascript
   {
     min_iv: 0.40,
     min_days_to_expiration: 21,
     max_days_to_expiration: 45,
     min_open_interest: 500,
     liquidity_quality: 'GOOD',
     sort_by: 'iv'
   }
   ```

3. **"Find cheap puts for portfolio protection"**
   ```javascript
   {
     symbols: ['SPY', 'QQQ', 'IWM'],
     option_type: 'put',
     moneyness: 'OTM',
     max_price: 1.00,
     min_days_to_expiration: 30,
     max_days_to_expiration: 60,
     min_volume: 100,
     sort_by: 'price'
   }
   ```

## Integration with Other Tools

The screener works great with other MCP tools:

### Workflow: Screen → Analyze → Trade

1. **Screen** for opportunities:
   ```javascript
   screen_options({ min_iv: 0.40, liquidity_quality: 'GOOD' })
   ```

2. **Analyze** top candidates:
   ```javascript
   deep_options_analysis({ symbol: 'AAPL' })
   ```

3. **Validate** before trading:
   ```javascript
   validate_option_trade({
     symbol: 'AAPL',
     strikes: { short_call: 180 },
     expiration: '2025-12-19'
   })
   ```

4. **Track** position:
   ```javascript
   track_position({ /* position details */ })
   ```

## Technical Details

### Architecture

- **Module**: `src/options-screener.js` (filtering & caching logic)
- **Client Method**: `MassiveOptionsClient.screenOptions()` in `src/massive-client.js`
- **MCP Tool**: `screen_options` registered in `src/index.js`
- **Tests**: `tests/test-screener.js`

### Dependencies

- **Liquidity Filter**: Uses existing `liquidity-filter.js` module
- **Calculations**: Reuses `calculations.js` for moneyness
- **Massive API**: Fetches option chains via `getOptionChain()`

### Default Symbols

See `DEFAULT_SCREENER_SYMBOLS` in `src/options-screener.js` for the full list of 70+ symbols covering:
- Major ETFs (SPY, QQQ, IWM, DIA, VXX, GLD, SLV, TLT)
- Mega-cap tech (AAPL, MSFT, GOOGL, AMZN, META, NVDA, TSLA, AMD)
- Large-cap tech (INTC, ORCL, CSCO, ADBE, AVGO, TXN, QCOM)
- Finance (JPM, BAC, WFC, GS, MS, C, BLK, SCHW)
- Healthcare (JNJ, UNH, PFE, ABBV, LLY, TMO, ABT, MRK)
- Consumer/Retail (WMT, HD, MCD, NKE, SBUX, TGT, COST, LOW)
- Energy (XOM, CVX, COP, SLB, EOG)
- Other high-volume stocks

## Support

For issues or questions:
- Check the [main README](../README.md)
- Review [test examples](../tests/test-screener.js)
- Consult [Massive API docs](https://massive.com/docs)
