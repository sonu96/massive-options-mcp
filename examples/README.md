# Real-Time Stock & Options Examples

## Real-Time Stock Price (`realtime-stock-price.js`)

Get real-time stock quotes with timestamps and intraday data.

### Usage

```bash
# Get current ORCL price
node examples/realtime-stock-price.js ORCL

# Get intraday bars (5-minute default)
node examples/realtime-stock-price.js ORCL intraday

# Get 1-minute intraday bars
node examples/realtime-stock-price.js ORCL intraday 1

# Monitor in real-time (60 seconds default)
node examples/realtime-stock-price.js ORCL monitor

# Monitor every 30 seconds
node examples/realtime-stock-price.js ORCL monitor 30

# Show everything (quote + intraday)
node examples/realtime-stock-price.js ORCL all
```

### Example Output

```
============================================================
📊 Real-Time Stock Data: ORCL
============================================================

Fetching current quote...
✅ Fetched in 245ms

⏰ TIMESTAMP INFORMATION:
  Fetch timestamp: 2024-01-22T14:30:15.123Z
  Data timestamp: 2024-01-22T14:30:12.456Z
  Data age: 2.7 seconds
  Freshness: 🟢 FRESH

💰 PRICE INFORMATION:
  Current Price: $118.05
  Change: -2.30
  Change %: -1.91%
  Open: $120.35
  High: $121.20
  Low: $117.80
  Volume: 8,542,320
  VWAP: $119.45
  Market Status: open
```

### Features

✅ Real-time stock quotes with timestamps
✅ Data freshness indicators (FRESH/RECENT/STALE/OLD)
✅ Intraday bars (1-min, 5-min, 15-min)
✅ VWAP calculation
✅ Intraday range analysis
✅ Real-time monitoring mode
✅ Automatic data age calculation

### Commands

| Command | Description | Example |
|---------|-------------|---------|
| `quote` | Get current quote (default) | `node examples/realtime-stock-price.js ORCL` |
| `intraday [MIN]` | Get intraday bars | `node examples/realtime-stock-price.js ORCL intraday 5` |
| `monitor [SEC]` | Monitor real-time | `node examples/realtime-stock-price.js ORCL monitor 60` |
| `all` | Show quote + intraday | `node examples/realtime-stock-price.js ORCL all` |

### Requirements

- Valid Massive API key in `.env` file
- Market must be open for real-time data
- During closed hours, shows previous close data
