# Massive Options MCP Server

An MCP (Model Context Protocol) server that integrates Massive.com's Options API with Claude, enabling advanced options trading analysis and real-time market data access.

## Features

**Professional-Grade Options Analysis MCP Server**

This streamlined MCP server provides 9 essential tools for serious options trading:

- **Core Data Access**: Real-time quotes with Greeks/IV, option chains, historical aggregates, symbol search
- **Advanced Analytics**: Comprehensive single-option analysis with Black-Scholes probabilities, expected moves, break-even, leverage, and risk/reward calculations
- **Market Structure Analysis**: Put/call ratios, gamma exposure (GEX), max pain, and open interest distribution
- **Volatility Analysis**: IV smile/skew patterns, term structure, and pricing anomalies across strikes/expirations
- **Dealer Positioning**: HeatSeeker-style GEX/VEX matrices showing where dealers dampen or amplify moves
- **Deep Multi-Strategy Analysis**: All-in-one tool combining institutional flow detection, strategy generation, position sizing, and P&L scenarios

## Setup

### 1. Install Dependencies

```bash
cd massive-options-mcp
npm install
```

### 2. Configure API Access

1. Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

2. Add your Massive.com API key to `.env`:
```
MASSIVE_API_KEY=your_actual_api_key_here
```

### 3. Connect to Claude Desktop

1. Open Claude Desktop settings
2. Go to Developer > Edit Config
3. Add the following configuration:

```json
{
  "mcpServers": {
    "massive-options": {
      "command": "node",
      "args": ["/path/to/massive-options-mcp/src/index.js"],
      "env": {
        "MASSIVE_API_KEY": "your_api_key_here"
      }
    }
  }
}
```

4. Restart Claude Desktop

## Usage Examples

Once connected, you can ask Claude to:

- "Get quote for AAPL 180 call expiring 2025-12-20"
- "Show me the option chain for SPY expiring 2025-11-15"
- "Get historical data for NVDA 140 call from Oct 1 to Nov 1, daily bars"
- "Search for Bitcoin ETF symbols"
- "Analyze the TSLA 250 call expiring 2025-12-20 - show probabilities and risk/reward"
- "Analyze SPY volatility smile and term structure"
- "Show market structure for QQQ - put/call ratios, GEX, and max pain"
- "Get dealer positioning matrix for IBIT with GEX and VEX"
- "Run deep analysis on SPY with $10K account - find best strategies"

## Available Tools (9 Essential Tools)

### 1. get_option_quote
Get real-time data for ONE specific option including price, Greeks, IV, volume, and OI.
- **Required**: symbol, optionType (call/put), strike, expiration (YYYY-MM-DD)
- **Returns**: Bid/ask, Greeks (delta, gamma, theta, vega), IV, volume, open interest

### 2. get_option_chain
Retrieve ALL available options for a symbol (use sparingly - returns hundreds of contracts).
- **Required**: symbol
- **Optional**: expiration (YYYY-MM-DD)

### 3. get_historical_aggregates
Get historical OHLC bars for an option with custom intervals (5-min, hourly, daily, etc).
- **Required**: symbol, optionType, strike, expiration, multiplier, timespan, from, to
- **Use for**: Backtesting, charting, technical analysis

### 4. search_options
Search for stock symbols that have options available.
- **Required**: query (company name or ticker)

### 5. get_option_analytics
Comprehensive analytics for a single option including Black-Scholes calculations.
- **Required**: symbol, optionType, strike, expiration
- **Optional**: targetPrice
- **Returns**: Break-even, ITM probability, expected moves, leverage, time value, risk/reward

### 6. get_volatility_analysis
Analyze IV characteristics across strikes and expirations.
- **Required**: symbol
- **Optional**: expiration
- **Returns**: Volatility smile/skew, term structure, ATM IV, pattern detection

### 7. get_market_structure
Market structure analysis showing dealer positioning and sentiment.
- **Required**: symbol
- **Optional**: expiration
- **Returns**: Put/call ratios, GEX, max pain, OI distribution, support/resistance

### 8. get_dealer_positioning_matrix
HeatSeeker-style GEX/VEX analysis across all strikes and expirations.
- **Required**: symbol
- **Optional**: expirations (array), strike_range, include_vex, format
- **Returns**: Dealer gamma/vega exposure, magnet levels, danger zones, trading implications

### 9. deep_options_analysis
All-in-one comprehensive analysis with strategy generation and position sizing.
- **Required**: symbol, account_size
- **Optional**: target_expirations, strikes_to_analyze, mode, strategies, risk_config
- **Returns**: Institutional flow detection, ranked strategy recommendations, position sizes, P&L scenarios

## Advanced Analytics Documentation

For detailed information about the analytics calculations and examples, see [docs/ANALYTICS.md](docs/ANALYTICS.md).

## Development

To run in development mode with auto-reload:

```bash
npm run dev
```

### Running Tests

The project includes comprehensive unit and integration tests:

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

## Troubleshooting

1. **API Key Issues**: Ensure your Massive.com API key is valid and has the necessary permissions
2. **Connection Errors**: Check that the MCP server path in Claude Desktop config is absolute
3. **Rate Limits**: The Massive API may have rate limits; implement appropriate error handling

## License

MIT