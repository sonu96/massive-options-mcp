# Massive Options MCP Server

An MCP (Model Context Protocol) server that integrates Massive.com's Options API with Claude, enabling advanced options trading analysis and real-time market data access.

## Features

- **Option Chain Analysis**: Get complete option chains with all strikes and expirations
- **Real-time Quotes**: Access live option prices and market data
- **Greeks Calculation**: Retrieve Delta, Gamma, Theta, Vega, and Rho
- **Implied Volatility**: Analyze IV for any option contract
- **Historical Data**: Access historical option prices and trends
- **Unusual Activity Scanner**: Find high-volume and high-OI options
- **Search Functionality**: Search options by symbol or keyword
- **Advanced Analytics** 🆕: Comprehensive options analysis including:
  - Black-Scholes probability calculations (ITM/OTM probabilities)
  - Expected move ranges based on implied volatility
  - Break-even analysis and intrinsic/time value breakdown
  - Leverage calculations and daily theta decay
  - Risk/reward analysis with custom target prices
  - Volume/OI ratio analysis for unusual activity detection

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

- "Show me the option chain for AAPL"
- "What are the Greeks for SPY 450 call expiring next Friday?"
- "Find unusual options activity with volume > 10,000"
- "Get the implied volatility for TSLA puts"
- "Show me historical data for NVDA 500 calls from last month"
- "Search for options on tech stocks"
- "Analyze the IBIT $62 call expiring 2025-11-14 with full analytics"
- "What's the probability of SPY 480 put finishing ITM?"
- "Calculate risk/reward for TSLA 250 call with $300 target"
- "Show expected move range for QQQ based on current IV"
- "Analyze SPY volatility smile and term structure"
- "Show market structure for TSLA including gamma exposure and max pain"
- "What's the put/call ratio for AAPL?"

## Available Tools

### get_option_chain
Retrieves all available options for a symbol.
- **Required**: symbol
- **Optional**: expiration (YYYY-MM-DD)

### get_option_quote
Gets real-time quote for a specific option.
- **Required**: symbol, optionType (call/put), strike, expiration

### get_option_greeks
Calculates Greeks for an option contract.
- **Required**: symbol, optionType, strike, expiration

### get_implied_volatility
Gets IV for a specific option.
- **Required**: symbol, optionType, strike, expiration

### get_historical_option_data
Retrieves historical data for an option.
- **Required**: symbol, optionType, strike, expiration, startDate, endDate

### search_options
Searches for options by query.
- **Required**: query

### get_unusual_options_activity
Finds unusual activity based on volume/OI.
- **Optional**: minVolume (default: 1000), minOI (default: 5000)

### get_option_analytics 🆕
Provides comprehensive analytics for a specific option including probability calculations, expected moves, and risk/reward analysis.
- **Required**: symbol, optionType (call/put), strike, expiration
- **Optional**: targetPrice (for risk/reward calculations)

Returns advanced metrics including:
- Break-even price and intrinsic/time value breakdown
- Probability of finishing ITM using Black-Scholes model
- Expected move ranges (1σ and 2σ) based on implied volatility
- Leverage factor and daily theta decay
- Volume/OI ratio analysis for detecting unusual activity
- Risk/reward calculations when target price is provided

### get_option_chain_snapshot
Gets comprehensive market snapshot of all options for a symbol with analytics.
- **Required**: symbol
- **Optional**: expiration, strikeMin, strikeMax

### get_volatility_analysis 🆕
Analyzes volatility characteristics including:
- **Required**: symbol
- **Optional**: expiration

Returns:
- Volatility smile/skew analysis for each expiration
- Term structure analysis (contango/backwardation)
- ATM implied volatility levels
- Smile steepness and pattern detection

### get_market_structure 🆕
Provides comprehensive market structure analysis including:
- **Required**: symbol
- **Optional**: expiration

Returns:
- Put/Call ratios (volume, open interest, premium-weighted)
- Gamma exposure (GEX) and dealer positioning
- Max pain calculation and expected price magnets
- Open interest distribution with support/resistance levels
- Overall market interpretation

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