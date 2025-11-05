# Massive Options MCP Server

An MCP (Model Context Protocol) server that integrates Massive.com's Options API with Claude, enabling advanced options trading analysis and real-time market data access.

## Features

**Professional-Grade Options Analysis MCP Server**

This comprehensive MCP server provides 17 tools designed to transform data into profitable trading decisions:

### Market Data & Analysis (9 tools)
- **Core Data Access**: Real-time quotes with Greeks/IV, option chains, historical aggregates, symbol search
- **Advanced Analytics**: Comprehensive single-option analysis with Black-Scholes probabilities, expected moves, break-even, leverage, and risk/reward calculations
- **Market Structure Analysis**: Put/call ratios, gamma exposure (GEX), max pain, and open interest distribution
- **Volatility Analysis**: IV smile/skew patterns, term structure, and pricing anomalies across strikes/expirations
- **Dealer Positioning**: HeatSeeker-style GEX/VEX matrices showing where dealers dampen or amplify moves
- **Deep Multi-Strategy Analysis**: All-in-one tool combining institutional flow detection, strategy generation, position sizing, and P&L scenarios

### Risk Management & Position Tracking (8 tools)
- **Portfolio Greeks**: Aggregate delta, gamma, theta, vega across all positions with risk warnings
- **Position Tracking**: Track positions in persistent storage with P&L monitoring and exit signals
- **Circuit Breakers**: Automatic trading halts when loss limits or risk thresholds exceeded
- **Stress Testing**: Portfolio simulation under market crash scenarios with Monte Carlo VaR
- **Smart Money Detection**: Identify institutional flow, unusual volume, block trades, and sweeps
- **Liquidity Analysis**: Filter options by liquidity score to ensure tradeable markets
- **Transaction Cost Modeling**: Real P&L calculations including commissions, slippage, and spreads
- **Position Sizing**: Kelly criterion-based sizing with true expected value after costs

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

**Market Analysis:**
- "Get quote for AAPL 180 call expiring 2025-12-20"
- "Show me the option chain for SPY expiring 2025-11-15"
- "Analyze the TSLA 250 call expiring 2025-12-20 - show probabilities and risk/reward"
- "Analyze SPY volatility smile and term structure"
- "Show market structure for QQQ - put/call ratios, GEX, and max pain"
- "Get dealer positioning matrix for IBIT with GEX and VEX"
- "Run deep analysis on SPY with $10K account - find best strategies"

**Risk Management:**
- "Calculate my portfolio Greeks across all positions"
- "Check if circuit breakers allow trading right now"
- "Stress test my portfolio - what happens in a market crash?"
- "Run Monte Carlo simulation to calculate my 95% VaR"
- "Detect unusual institutional flow in IBIT options"
- "Check liquidity for this option - is the spread too wide?"

**Position Tracking:**
- "Track this new position: SPY bull call spread, 580/590 strikes, Jan 2026"
- "Show all my open positions with current P&L"
- "Check if any positions hit profit targets or stop losses"
- "Close my position XYZ with exit price $2.50"

## Available Tools (17 Total)

### Market Data & Analysis Tools

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

### Risk Management & Position Tracking Tools

### 10. get_portfolio_greeks
Calculate portfolio-level Greeks by aggregating across all positions.
- **Required**: positions (array with delta, gamma, theta, vega)
- **Optional**: account_size
- **Returns**: Net delta/gamma/theta/vega, directional bias, risk warnings when limits exceeded

### 11. track_position
Add a new position to tracking system (stored in .claude/positions.json).
- **Required**: symbol, strategy, expiration
- **Optional**: entry_price, entry_credit, contracts, strike_price, notes
- **Returns**: Position ID and confirmation

### 12. get_tracked_positions
View all tracked positions with current P&L and exit signals.
- **Optional**: status (open/closed/all, default: open)
- **Returns**: Positions with alerts for profit targets, stop losses, time-based exits

### 13. close_position
Close a tracked position and record exit details.
- **Required**: position_id
- **Optional**: exit_price, exit_profit
- **Returns**: Closed position with final P&L

### 14. check_circuit_breakers
Check if circuit breakers allow trading based on risk limits.
- **Required**: account_size
- **Optional**: daily_pnl, portfolio_risk, vix_level, positions
- **Returns**: trading_allowed (boolean), breakers_tripped, warnings, recommendations
- **Limits**: Max daily loss ($500 or 5%), portfolio risk (20%), VIX spike (>40), position loss (50%)

### 15. stress_test_portfolio
Run stress tests on portfolio under various market scenarios.
- **Required**: portfolio_greeks (from get_portfolio_greeks)
- **Optional**: scenarios (array), run_monte_carlo (boolean), monte_carlo_config
- **Returns**: Worst/best case P&L, scenario analysis, recommendations, optional VaR calculations
- **Scenarios**: MARKET_CRASH_MILD, MARKET_CRASH_SEVERE, FLASH_CRASH, VOLATILITY_CRUSH, SLOW_BLEED, RALLY, SIDEWAYS, WHIPSAW

### 16. detect_unusual_flow
Detect smart money and institutional activity in options.
- **Required**: symbol, options (array with volume/OI data)
- **Optional**: config (volume_multiplier, min_volume, min_premium)
- **Returns**: Unusual contracts with conviction scores (0-100), bullish/bearish signals, put/call flow analysis
- **Flags**: High volume (3x average), high premium ($50K+), sweeps, block trades

### 17. assess_liquidity
Analyze option liquidity to ensure tradeable markets.
- **Required**: option (single) OR options_array (multiple)
- **Optional**: min_quality (EXCELLENT/GOOD/FAIR)
- **Returns**: Liquidity score (0-100), quality rating, bid-ask spread %, warnings
- **Thresholds**: EXCELLENT (<3% spread, 500+ volume), GOOD (<7% spread, 100+ volume), FAIR (<15% spread, 50+ volume)

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