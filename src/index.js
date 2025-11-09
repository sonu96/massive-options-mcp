#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { 
  ListToolsRequestSchema, 
  CallToolRequestSchema 
} from '@modelcontextprotocol/sdk/types.js';
import { MassiveOptionsClient } from './massive-client.js';
import dotenv from 'dotenv';

// Import risk management and analysis modules
import { calculatePortfolioGreeks, calculateScenarioPnL, generatePortfolioRiskWarnings } from './portfolio-greeks.js';
import { addPosition, getOpenPositions, closePosition, calculatePositionPnL, generateExitSignals, monitorPositions } from './position-tracker.js';
import { checkCircuitBreakers, recordTrade, resetCircuitBreakers, getBreakerStatus, DEFAULT_BREAKERS } from './circuit-breakers.js';
import { runStressTest, runMonteCarloSimulation, STRESS_SCENARIOS } from './stress-testing.js';
import { detectUnusualActivity, analyzePutCallFlow, analyzeFlowPersistence } from './flow-detector.js';
import { analyzeOptionLiquidity, filterOptionsByLiquidity, assessMarketDepth } from './liquidity-filter.js';

dotenv.config();

const server = new Server(
  {
    name: 'massive-options-mcp',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

const client = new MassiveOptionsClient(
  process.env.MASSIVE_API_KEY,
  process.env.MASSIVE_API_BASE_URL
);

// Handle tool listing
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'get_option_chain',
        description: 'ONLY use this to get ALL options for a symbol. DO NOT use this for specific option quotes. This returns hundreds of contracts. For a specific strike/expiration, use get_option_quote instead.',
        inputSchema: {
          type: 'object',
          properties: {
            symbol: {
              type: 'string',
              description: 'Stock ticker symbol (e.g., "AAPL", "IBIT", "SPY"). Must be uppercase.'
            },
            expiration: {
              type: 'string',
              description: 'Optional: Filter by specific expiration date in YYYY-MM-DD format (e.g., "2025-11-14")'
            }
          },
          required: ['symbol'],
          additionalProperties: false
        }
      },
      {
        name: 'get_option_quote',
        description: 'Get data for ONE SPECIFIC option. Use this when you know the exact strike price and expiration date. Returns price, Greeks, IV, and contract details. REQUIRES ALL 4 PARAMETERS: symbol, optionType, strike, expiration.',
        inputSchema: {
          type: 'object',
          properties: {
            symbol: {
              type: 'string',
              description: 'Stock ticker symbol in uppercase (e.g., "IBIT", "AAPL", "SPY")'
            },
            optionType: {
              type: 'string',
              enum: ['call', 'put'],
              description: 'Option type: must be exactly "call" or "put" (lowercase)'
            },
            strike: {
              type: 'number',
              description: 'Strike price as a number (e.g., 70 for $70, not "70" or "$70")'
            },
            expiration: {
              type: 'string',
              pattern: '^\\d{4}-\\d{2}-\\d{2}$',
              description: 'Expiration date in YYYY-MM-DD format (e.g., "2025-11-14"). Must include leading zeros.'
            }
          },
          required: ['symbol', 'optionType', 'strike', 'expiration'],
          additionalProperties: false,
          examples: [
            {
              symbol: 'IBIT',
              optionType: 'call',
              strike: 62,
              expiration: '2025-11-14'
            }
          ]
        }
      },
      {
        name: 'get_historical_aggregates',
        description: 'Get historical OHLC aggregates for an option contract with custom time intervals (e.g., 5-minute, hourly, daily bars). Useful for charting and technical analysis.',
        inputSchema: {
          type: 'object',
          properties: {
            symbol: {
              type: 'string',
              description: 'Stock ticker symbol'
            },
            optionType: {
              type: 'string',
              enum: ['call', 'put'],
              description: 'Option type: "call" or "put"'
            },
            strike: {
              type: 'number',
              description: 'Strike price'
            },
            expiration: {
              type: 'string',
              pattern: '^\\d{4}-\\d{2}-\\d{2}$',
              description: 'Expiration date in YYYY-MM-DD format'
            },
            multiplier: {
              type: 'number',
              description: 'The size of the timespan multiplier (e.g., 1, 5, 15)'
            },
            timespan: {
              type: 'string',
              enum: ['minute', 'hour', 'day', 'week', 'month', 'quarter', 'year'],
              description: 'The size of the time window'
            },
            from: {
              type: 'string',
              pattern: '^\\d{4}-\\d{2}-\\d{2}$',
              description: 'Start date in YYYY-MM-DD format'
            },
            to: {
              type: 'string',
              pattern: '^\\d{4}-\\d{2}-\\d{2}$',
              description: 'End date in YYYY-MM-DD format'
            }
          },
          required: ['symbol', 'optionType', 'strike', 'expiration', 'multiplier', 'timespan', 'from', 'to'],
          additionalProperties: false
        }
      },
      {
        name: 'search_options',
        description: 'Search for stock symbols that have options available. Use this to find the correct ticker symbol before querying options.',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Company name or ticker to search for (e.g., "Apple" or "AAPL")'
            }
          },
          required: ['query'],
          additionalProperties: false
        }
      },
      {
        name: 'get_option_analytics',
        description: 'Get comprehensive analytics for a specific option including break-even, probability of ITM, expected move, leverage, time value, moneyness analysis, and risk/reward calculations. This tool provides advanced calculations beyond basic Greeks.',
        inputSchema: {
          type: 'object',
          properties: {
            symbol: {
              type: 'string',
              description: 'Stock ticker symbol in uppercase'
            },
            optionType: {
              type: 'string',
              enum: ['call', 'put'],
              description: 'Option type: "call" or "put" (lowercase only)'
            },
            strike: {
              type: 'number',
              description: 'Strike price as a number'
            },
            expiration: {
              type: 'string',
              pattern: '^\\d{4}-\\d{2}-\\d{2}$',
              description: 'Expiration date in YYYY-MM-DD format'
            },
            targetPrice: {
              type: 'number',
              description: 'Optional: Target stock price for risk/reward analysis'
            }
          },
          required: ['symbol', 'optionType', 'strike', 'expiration'],
          additionalProperties: false
        }
      },
      {
        name: 'get_volatility_analysis',
        description: 'Analyze volatility characteristics including smile/skew patterns, term structure, and IV relationships across strikes and expirations. Provides insights into market sentiment and pricing anomalies.',
        inputSchema: {
          type: 'object',
          properties: {
            symbol: {
              type: 'string',
              description: 'Stock ticker symbol in uppercase'
            },
            expiration: {
              type: 'string',
              pattern: '^\\d{4}-\\d{2}-\\d{2}$',
              description: 'Optional: Specific expiration to analyze. If not provided, analyzes all available expirations'
            }
          },
          required: ['symbol'],
          additionalProperties: false
        }
      },
      {
        name: 'get_market_structure',
        description: 'Analyze option market structure including put/call ratios, gamma exposure (GEX), max pain, and open interest distribution. Provides insights into dealer positioning, support/resistance levels, and overall market sentiment.',
        inputSchema: {
          type: 'object',
          properties: {
            symbol: {
              type: 'string',
              description: 'Stock ticker symbol in uppercase'
            },
            expiration: {
              type: 'string',
              pattern: '^\\d{4}-\\d{2}-\\d{2}$',
              description: 'Optional: Specific expiration to analyze. If not provided, analyzes all available expirations'
            }
          },
          required: ['symbol'],
          additionalProperties: false
        }
      },
      {
        name: 'get_dealer_positioning_matrix',
        description: 'HeatSeeker-style dealer positioning analysis. Calculates dealer gamma exposure (GEX) and vega exposure (VEX) across all strikes and expirations. Identifies magnet levels, danger zones, support/resistance, and generates trading implications based on dealer hedging behavior. Shows where dealers will dampen or amplify volatility.',
        inputSchema: {
          type: 'object',
          properties: {
            symbol: {
              type: 'string',
              description: 'Stock ticker symbol in uppercase (e.g., "IBIT", "SPY")'
            },
            expirations: {
              type: 'array',
              items: {
                type: 'string',
                pattern: '^\\d{4}-\\d{2}-\\d{2}$'
              },
              description: 'Optional: Array of specific expiration dates to analyze (YYYY-MM-DD format). If not provided, analyzes all available expirations'
            },
            strike_range: {
              type: 'object',
              properties: {
                min: {
                  type: 'number',
                  description: 'Minimum strike price to include'
                },
                max: {
                  type: 'number',
                  description: 'Maximum strike price to include'
                }
              },
              description: 'Optional: Strike price range to analyze. If not provided, includes all strikes'
            },
            include_vex: {
              type: 'boolean',
              description: 'Include Vega Exposure (VEX) matrix in addition to GEX. Default: false'
            },
            format: {
              type: 'string',
              enum: ['matrix', 'list'],
              description: 'Output format: "matrix" (object of objects) or "list" (array of rows). Default: "matrix"'
            }
          },
          required: ['symbol'],
          additionalProperties: false,
          examples: [
            {
              symbol: 'IBIT',
              expirations: ['2025-11-07', '2025-11-14', '2025-11-21', '2025-11-28'],
              strike_range: { min: 49, max: 63 }
            }
          ]
        }
      },
      {
        name: 'deep_options_analysis',
        description: 'Comprehensive multi-expiration options analysis with institutional flow detection, volume spikes, strategy generation, position sizing, and P&L scenarios. This is a POWERFUL all-in-one tool that combines market snapshot, volatility analysis, unusual activity detection, and generates ranked strategy recommendations with risk management.',
        inputSchema: {
          type: 'object',
          properties: {
            symbol: {
              type: 'string',
              description: 'Stock ticker symbol in uppercase (e.g., "IBIT", "SPY")'
            },
            target_expirations: {
              type: 'array',
              items: {
                type: 'string',
                pattern: '^\\d{4}-\\d{2}-\\d{2}$'
              },
              description: 'Optional: Array of specific expiration dates to analyze in YYYY-MM-DD format (e.g., ["2026-01-16", "2026-03-20"]). If not provided, analyzes first 4 available expirations'
            },
            strikes_to_analyze: {
              type: 'array',
              items: {
                type: 'number'
              },
              description: 'Optional: Array of specific strike prices to focus on (e.g., [58, 65, 70, 75, 80]). If not provided or if mode is "auto", will auto-detect based on unusual activity and institutional flow'
            },
            account_size: {
              type: 'number',
              description: 'Trading account size in dollars (e.g., 4000 for $4,000 account). Required for position sizing calculations'
            },
            mode: {
              type: 'string',
              enum: ['manual', 'auto', 'both'],
              description: 'Strategy generation mode: "manual" uses only strikes_to_analyze, "auto" auto-detects from flow/volume, "both" combines both approaches. Default: "both"'
            },
            strategies: {
              type: 'array',
              items: {
                type: 'string',
                enum: ['bull_call_spread', 'bear_put_spread', 'iron_condor', 'calendar_spread']
              },
              description: 'Array of strategy types to generate. Default: all strategies ["bull_call_spread", "bear_put_spread", "iron_condor", "calendar_spread"]'
            },
            risk_config: {
              type: 'object',
              properties: {
                max_risk_pct: {
                  type: 'number',
                  description: 'Max % of account to risk per trade (0.005-0.10, default: 0.02 for 2%)'
                },
                min_reward_ratio: {
                  type: 'number',
                  description: 'Minimum reward:risk ratio to consider (1.0-10.0, default: 2.0)'
                },
                min_prob_profit: {
                  type: 'number',
                  description: 'Minimum probability of profit (0.3-0.95, default: 0.5)'
                },
                max_concentration: {
                  type: 'number',
                  description: 'Max % of account in any single position (0.05-0.50, default: 0.40 for 40%)'
                }
              },
              description: 'Optional: Risk management configuration. All parameters have safe defaults if not provided'
            },
            current_price: {
              type: 'number',
              description: 'Optional: Override current underlying price. If not provided, fetches from market data'
            }
          },
          required: ['symbol', 'account_size'],
          additionalProperties: false,
          examples: [
            {
              symbol: 'IBIT',
              target_expirations: ['2026-01-16', '2026-03-20'],
              strikes_to_analyze: [58, 65, 70, 75, 80],
              account_size: 4000,
              mode: 'both',
              strategies: ['bull_call_spread', 'bear_put_spread'],
              risk_config: {
                max_risk_pct: 0.02,
                min_reward_ratio: 2.0,
                max_concentration: 0.40
              }
            }
          ]
        }
      },
      {
        name: 'get_portfolio_greeks',
        description: 'Calculate portfolio-level Greeks by aggregating across all positions. Shows total delta, gamma, theta, vega exposure with risk warnings when limits exceeded. Essential for understanding overall portfolio risk and market exposure.',
        inputSchema: {
          type: 'object',
          properties: {
            positions: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  symbol: { type: 'string' },
                  quantity: { type: 'number' },
                  delta: { type: 'number' },
                  gamma: { type: 'number' },
                  theta: { type: 'number' },
                  vega: { type: 'number' }
                }
              },
              description: 'Array of positions with their Greeks'
            },
            account_size: {
              type: 'number',
              description: 'Trading account size for risk percentage calculations'
            }
          },
          required: ['positions'],
          additionalProperties: false
        }
      },
      {
        name: 'track_position',
        description: 'Add a new position to tracking system. Stores position in .claude/positions.json for ongoing monitoring, P&L calculation, and exit signal generation.',
        inputSchema: {
          type: 'object',
          properties: {
            symbol: { type: 'string', description: 'Stock ticker symbol' },
            strategy: { type: 'string', description: 'Strategy name (e.g., "bull_call_spread")' },
            entry_price: { type: 'number', description: 'Entry price paid per contract' },
            entry_credit: { type: 'number', description: 'Credit received (for credit spreads)' },
            contracts: { type: 'number', description: 'Number of contracts' },
            expiration: { type: 'string', description: 'Expiration date YYYY-MM-DD' },
            strike_price: { type: 'number', description: 'Strike price (or short strike for spreads)' },
            notes: { type: 'string', description: 'Optional notes about the trade' }
          },
          required: ['symbol', 'strategy', 'expiration'],
          additionalProperties: false
        }
      },
      {
        name: 'get_tracked_positions',
        description: 'View all tracked positions with current P&L and exit signals. Returns positions with alerts for profit targets, stop losses, and time-based exits.',
        inputSchema: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              enum: ['open', 'closed', 'all'],
              description: 'Filter by status. Default: "open"'
            }
          },
          additionalProperties: false
        }
      },
      {
        name: 'close_position',
        description: 'Close a tracked position and record exit details.',
        inputSchema: {
          type: 'object',
          properties: {
            position_id: { type: 'string', description: 'Position ID from tracked positions' },
            exit_price: { type: 'number', description: 'Exit price per contract' },
            exit_profit: { type: 'number', description: 'Total profit/loss from position' }
          },
          required: ['position_id'],
          additionalProperties: false
        }
      },
      {
        name: 'check_circuit_breakers',
        description: 'Check if circuit breakers allow trading. Prevents catastrophic losses by halting trading when daily loss limits, portfolio risk limits, or VIX spikes are exceeded. Returns trading_allowed boolean and any warnings.',
        inputSchema: {
          type: 'object',
          properties: {
            account_size: { type: 'number', description: 'Trading account size' },
            daily_pnl: { type: 'number', description: 'Current daily P&L (negative for loss)' },
            portfolio_risk: { type: 'number', description: 'Total portfolio risk exposure' },
            vix_level: { type: 'number', description: 'Current VIX level' },
            positions: {
              type: 'array',
              items: { type: 'object' },
              description: 'Array of current positions'
            }
          },
          required: ['account_size'],
          additionalProperties: false
        }
      },
      {
        name: 'stress_test_portfolio',
        description: 'Run stress tests on portfolio to estimate P&L under various market scenarios (crash, volatility spike, sideways grind, etc.). Shows worst-case and best-case scenarios with recommendations. Includes Monte Carlo simulation for Value-at-Risk (VaR) calculations.',
        inputSchema: {
          type: 'object',
          properties: {
            portfolio_greeks: {
              type: 'object',
              properties: {
                net_delta: { type: 'number' },
                net_gamma: { type: 'number' },
                net_theta: { type: 'number' },
                net_vega: { type: 'number' }
              },
              description: 'Portfolio Greeks from get_portfolio_greeks'
            },
            scenarios: {
              type: 'array',
              items: { type: 'string' },
              description: 'Optional: Specific scenarios to test. Available: MARKET_CRASH_MILD, MARKET_CRASH_SEVERE, FLASH_CRASH, VOLATILITY_CRUSH, SLOW_BLEED, RALLY, SIDEWAYS, WHIPSAW'
            },
            run_monte_carlo: {
              type: 'boolean',
              description: 'Run Monte Carlo simulation for VaR calculations. Default: false'
            },
            monte_carlo_config: {
              type: 'object',
              properties: {
                num_simulations: { type: 'number', description: 'Number of simulations (default: 1000)' },
                days_forward: { type: 'number', description: 'Time horizon in days (default: 30)' },
                daily_volatility: { type: 'number', description: 'Daily volatility (default: 0.01 = 1%)' }
              }
            }
          },
          required: ['portfolio_greeks'],
          additionalProperties: false
        }
      },
      {
        name: 'detect_unusual_flow',
        description: 'Detect smart money / institutional activity in options. Identifies unusual volume, block trades, sweeps, and put/call flow imbalances. Returns conviction scores and bullish/bearish signals.',
        inputSchema: {
          type: 'object',
          properties: {
            symbol: { type: 'string', description: 'Stock ticker symbol' },
            options: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  contract_type: { type: 'string', enum: ['call', 'put'] },
                  strike_price: { type: 'number' },
                  volume: { type: 'number' },
                  open_interest: { type: 'number' },
                  last_price: { type: 'number' }
                }
              },
              description: 'Array of option contracts with volume data'
            },
            config: {
              type: 'object',
              properties: {
                volume_multiplier: { type: 'number', description: 'Volume must be Nx average (default: 3)' },
                min_volume: { type: 'number', description: 'Minimum absolute volume (default: 100)' },
                min_premium: { type: 'number', description: 'Minimum premium spent (default: 50000)' }
              }
            }
          },
          required: ['symbol', 'options'],
          additionalProperties: false
        }
      },
      {
        name: 'assess_liquidity',
        description: 'Analyze option liquidity to ensure tradeable markets. Calculates liquidity score (0-100), quality rating (EXCELLENT/GOOD/FAIR/POOR), and warns about wide spreads or low volume. Prevents recommending illiquid options with poor fills.',
        inputSchema: {
          type: 'object',
          properties: {
            option: {
              type: 'object',
              properties: {
                bid: { type: 'number' },
                ask: { type: 'number' },
                volume: { type: 'number' },
                open_interest: { type: 'number' }
              },
              description: 'Option data with bid, ask, volume, open interest'
            },
            options_array: {
              type: 'array',
              items: { type: 'object' },
              description: 'Array of options to filter by liquidity'
            },
            min_quality: {
              type: 'string',
              enum: ['EXCELLENT', 'GOOD', 'FAIR'],
              description: 'Minimum quality threshold (default: FAIR)'
            }
          },
          additionalProperties: false
        }
      },
      {
        name: 'get_market_status',
        description: 'Get current market status for all exchanges including NYSE, NASDAQ, AMEX. Shows whether markets are open or closed, after hours status, and overall trading availability.',
        inputSchema: {
          type: 'object',
          properties: {},
          additionalProperties: false
        }
      },
      {
        name: 'get_upcoming_market_holidays',
        description: 'Get list of upcoming market holidays and closures. Useful for planning trades and understanding when markets will be closed.',
        inputSchema: {
          type: 'object',
          properties: {},
          additionalProperties: false
        }
      },
      {
        name: 'get_dividends',
        description: 'Get dividend data with comprehensive filtering and sorting options. Filter by ticker, dates (ex-dividend, record, declaration, pay), cash amount, and frequency. Results can be sorted by any field.',
        inputSchema: {
          type: 'object',
          properties: {
            ticker: {
              type: 'string',
              description: 'Stock ticker symbol to filter by (e.g., "AAPL")'
            },
            ex_dividend_date: {
              type: 'string',
              pattern: '^\\d{4}-\\d{2}-\\d{2}$',
              description: 'Filter by ex-dividend date in YYYY-MM-DD format'
            },
            record_date: {
              type: 'string',
              pattern: '^\\d{4}-\\d{2}-\\d{2}$',
              description: 'Filter by record date in YYYY-MM-DD format'
            },
            declaration_date: {
              type: 'string',
              pattern: '^\\d{4}-\\d{2}-\\d{2}$',
              description: 'Filter by declaration date in YYYY-MM-DD format'
            },
            pay_date: {
              type: 'string',
              pattern: '^\\d{4}-\\d{2}-\\d{2}$',
              description: 'Filter by payment date in YYYY-MM-DD format'
            },
            cash_amount: {
              type: 'number',
              description: 'Filter by dividend cash amount'
            },
            frequency: {
              type: 'number',
              description: 'Filter by dividend frequency (e.g., 1=annual, 4=quarterly, 12=monthly)'
            },
            limit: {
              type: 'number',
              description: 'Maximum number of results to return (default: 100)'
            },
            sort: {
              type: 'string',
              description: 'Field to sort by (default: ex_dividend_date). Options: ticker, ex_dividend_date, record_date, declaration_date, pay_date, cash_amount'
            },
            order: {
              type: 'string',
              enum: ['asc', 'desc'],
              description: 'Sort order: ascending or descending (default: desc)'
            }
          },
          additionalProperties: false
        }
      },
      {
        name: 'get_option_ema',
        description: 'Get Exponential Moving Average (EMA) technical indicator for an option contract. EMA is a trend-following indicator that gives more weight to recent prices. Useful for identifying trend direction and potential entry/exit points.',
        inputSchema: {
          type: 'object',
          properties: {
            symbol: {
              type: 'string',
              description: 'Stock ticker symbol in uppercase (e.g., "AAPL")'
            },
            optionType: {
              type: 'string',
              enum: ['call', 'put'],
              description: 'Option type: "call" or "put"'
            },
            strike: {
              type: 'number',
              description: 'Strike price'
            },
            expiration: {
              type: 'string',
              pattern: '^\\d{4}-\\d{2}-\\d{2}$',
              description: 'Expiration date in YYYY-MM-DD format'
            },
            timespan: {
              type: 'string',
              enum: ['minute', 'hour', 'day', 'week', 'month'],
              description: 'Timespan for EMA calculation (default: day)'
            },
            window: {
              type: 'number',
              description: 'EMA window/period size (e.g., 9, 20, 50, 200). Default: 20'
            }
          },
          required: ['symbol', 'optionType', 'strike', 'expiration'],
          additionalProperties: false
        }
      },
      {
        name: 'get_option_rsi',
        description: 'Get Relative Strength Index (RSI) technical indicator for an option contract. RSI measures momentum and identifies overbought (>70) or oversold (<30) conditions. Includes automatic interpretation of RSI levels.',
        inputSchema: {
          type: 'object',
          properties: {
            symbol: {
              type: 'string',
              description: 'Stock ticker symbol in uppercase (e.g., "AAPL")'
            },
            optionType: {
              type: 'string',
              enum: ['call', 'put'],
              description: 'Option type: "call" or "put"'
            },
            strike: {
              type: 'number',
              description: 'Strike price'
            },
            expiration: {
              type: 'string',
              pattern: '^\\d{4}-\\d{2}-\\d{2}$',
              description: 'Expiration date in YYYY-MM-DD format'
            },
            timespan: {
              type: 'string',
              enum: ['minute', 'hour', 'day', 'week', 'month'],
              description: 'Timespan for RSI calculation (default: day)'
            },
            window: {
              type: 'number',
              description: 'RSI window/period size (typically 14). Default: 14'
            }
          },
          required: ['symbol', 'optionType', 'strike', 'expiration'],
          additionalProperties: false
        }
      }
    ]
  };
});

// Helper function to clean and validate parameters
function cleanParameters(args) {
  const cleaned = {};
  
  // Clean each parameter
  for (const [key, value] of Object.entries(args)) {
    if (typeof value === 'string') {
      // Remove backticks and extra quotes
      cleaned[key] = value.replace(/`/g, '').trim();
      
      // Convert numeric strings to numbers for strike parameter
      if (key === 'strike' && /^\d+(\.\d+)?$/.test(cleaned[key])) {
        cleaned[key] = parseFloat(cleaned[key]);
      }
    } else {
      cleaned[key] = value;
    }
  }
  
  return cleaned;
}

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: rawArgs } = request.params;
  
  // Clean parameters to handle formatting issues
  const args = cleanParameters(rawArgs || {});

  try {
    // Log all tool calls for debugging
    console.error(`DEBUG: Tool called: ${name}`);
    console.error(`DEBUG: Raw args received:`, JSON.stringify(rawArgs, null, 2));
    console.error(`DEBUG: Cleaned args:`, JSON.stringify(args, null, 2));
    
    switch (name) {
      case 'get_option_chain': {
        // Check if user might be trying to get a specific quote
        if (args.strike !== undefined || args.optionType) {
          console.error('WARNING: get_option_chain was called with strike/optionType parameters. Use get_option_quote for specific options.');
          return { 
            content: [{ 
              type: 'text', 
              text: `Error: You appear to be looking for a specific option quote. Please use the 'get_option_quote' tool instead, which requires: symbol, optionType ("call" or "put"), strike (number), and expiration (YYYY-MM-DD). The get_option_chain tool returns ALL options for a symbol and only accepts 'symbol' and optional 'expiration' parameters.` 
            }] 
          };
        }
        
        // If only symbol is provided, don't dump everything - ask for clarification
        if (Object.keys(args).length === 1 && args.symbol) {
          // Get a sample of available expirations to help the user
          try {
            const chainData = await client.getOptionChain(args.symbol);
            const expirations = [...new Set(chainData.results.map(opt => opt.expiration_date))].sort().slice(0, 5);
            const strikes = [...new Set(chainData.results.filter(opt => opt.contract_type === 'call').map(opt => opt.strike_price))].sort((a,b) => a-b).slice(0, 10);
            
            return {
              content: [{
                type: 'text',
                text: `I found options for ${args.symbol}. To get specific data, please provide:\n\n1. What type of option? (call or put)\n2. What strike price? Sample strikes: ${strikes.join(', ')}\n3. What expiration? Nearest expirations: ${expirations.join(', ')}\n\nThen I can get you a specific quote with price, Greeks, and IV.\n\nAlternatively, if you want to see ALL available options (warning: large dataset), let me know.`
              }]
            };
          } catch (error) {
            return {
              content: [{
                type: 'text',
                text: `To get options data for ${args.symbol}, I need more information:\n\n• For a specific option: Provide the strike price, expiration date, and whether it's a call or put\n• For all options: Confirm you want the complete option chain (can be hundreds of contracts)\n\nWhat would you like to see?`
              }]
            };
          }
        }
        
        const data = await client.getOptionChain(args.symbol, args.expiration);
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      }
      
      case 'get_option_quote': {
        // Debug: log received arguments
        console.error('DEBUG: get_option_quote received args:', JSON.stringify(args, null, 2));
        
        // Validate required parameters
        if (!args.symbol || !args.optionType || args.strike === undefined || !args.expiration) {
          const missingParams = [];
          if (!args.symbol) missingParams.push('symbol');
          if (!args.optionType) missingParams.push('optionType');
          if (args.strike === undefined) missingParams.push('strike');
          if (!args.expiration) missingParams.push('expiration');
          
          throw new Error(`Missing required parameters: ${missingParams.join(', ')}. To get a quote for a specific option, you must provide ALL of: symbol (e.g., "IBIT"), optionType ("call" or "put"), strike (e.g., 70), and expiration (e.g., "2025-11-14"). Received: ${JSON.stringify(args)}`);
        }
        
        const data = await client.getQuote(args.symbol, args.optionType, args.strike, args.expiration);
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      }

      case 'get_historical_aggregates': {
        const data = await client.getHistoricalAggregates(
          args.symbol, args.optionType, args.strike, args.expiration,
          args.multiplier, args.timespan, args.from, args.to
        );
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      }

      case 'search_options': {
        const data = await client.searchOptions(args.query);
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      }

      case 'get_option_analytics': {
        const data = await client.getOptionAnalytics(
          args.symbol, args.optionType, args.strike, args.expiration, args.targetPrice
        );
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      }
      
      case 'get_volatility_analysis': {
        const data = await client.getVolatilityAnalysis(
          args.symbol, args.expiration
        );
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      }
      
      case 'get_market_structure': {
        const data = await client.getMarketStructure(
          args.symbol, args.expiration
        );
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      }

      case 'get_dealer_positioning_matrix': {
        const data = await client.getDealerPositioningMatrix({
          symbol: args.symbol,
          expirations: args.expirations || null,
          strike_range: args.strike_range || null,
          include_vex: args.include_vex || false,
          format: args.format || 'matrix'
        });
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      }

      case 'deep_options_analysis': {
        const data = await client.deepOptionsAnalysis({
          symbol: args.symbol,
          target_expirations: args.target_expirations || [],
          strikes_to_analyze: args.strikes_to_analyze || [],
          account_size: args.account_size,
          mode: args.mode || 'both',
          strategies: args.strategies || ['bull_call_spread', 'bear_put_spread', 'iron_condor', 'calendar_spread'],
          risk_config: args.risk_config || {},
          current_price: args.current_price
        });
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      }

      case 'get_portfolio_greeks': {
        const result = calculatePortfolioGreeks(args.positions, {
          account_size: args.account_size
        });
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      case 'track_position': {
        const position = addPosition({
          symbol: args.symbol,
          strategy: args.strategy,
          entry_price: args.entry_price,
          entry_credit: args.entry_credit,
          contracts: args.contracts,
          expiration: args.expiration,
          strike_price: args.strike_price,
          notes: args.notes
        });
        return { content: [{ type: 'text', text: JSON.stringify({
          success: true,
          message: 'Position tracked successfully',
          position
        }, null, 2) }] };
      }

      case 'get_tracked_positions': {
        const status = args.status || 'open';
        let positions;

        if (status === 'open') {
          positions = getOpenPositions();
        } else if (status === 'all') {
          const { loadPositions } = await import('./position-tracker.js');
          positions = loadPositions();
        } else {
          const { loadPositions } = await import('./position-tracker.js');
          positions = loadPositions().filter(p => p.status === status);
        }

        return { content: [{ type: 'text', text: JSON.stringify({
          total_positions: positions.length,
          positions
        }, null, 2) }] };
      }

      case 'close_position': {
        const closedPosition = closePosition(args.position_id, {
          exit_price: args.exit_price,
          exit_profit: args.exit_profit
        });
        return { content: [{ type: 'text', text: JSON.stringify({
          success: true,
          message: 'Position closed successfully',
          position: closedPosition
        }, null, 2) }] };
      }

      case 'check_circuit_breakers': {
        const result = checkCircuitBreakers({
          account_size: args.account_size,
          daily_pnl: args.daily_pnl,
          portfolio_risk: args.portfolio_risk,
          vix_level: args.vix_level,
          positions: args.positions || []
        }, DEFAULT_BREAKERS);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      case 'stress_test_portfolio': {
        const stressTestResult = runStressTest(
          args.portfolio_greeks,
          args.scenarios || null,
          {}
        );

        let result = { stress_test: stressTestResult };

        if (args.run_monte_carlo) {
          const monteCarloResult = runMonteCarloSimulation(
            args.portfolio_greeks,
            args.monte_carlo_config || {}
          );
          result.monte_carlo = monteCarloResult;
        }

        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      case 'detect_unusual_flow': {
        const flowAnalysis = detectUnusualActivity(
          args.options,
          args.config || {}
        );

        // Also analyze put/call flow if we have both
        const calls = args.options.filter(o => o.contract_type === 'call');
        const puts = args.options.filter(o => o.contract_type === 'put');

        let putCallAnalysis = null;
        if (calls.length > 0 && puts.length > 0) {
          putCallAnalysis = analyzePutCallFlow(calls, puts);
        }

        return { content: [{ type: 'text', text: JSON.stringify({
          symbol: args.symbol,
          unusual_activity: flowAnalysis,
          put_call_flow: putCallAnalysis
        }, null, 2) }] };
      }

      case 'assess_liquidity': {
        let result;

        if (args.option) {
          // Analyze single option
          result = analyzeOptionLiquidity(args.option);
        } else if (args.options_array) {
          // Filter array of options
          result = filterOptionsByLiquidity(args.options_array, {
            min_quality: args.min_quality || 'FAIR'
          });
        } else {
          throw new Error('Must provide either "option" or "options_array" parameter');
        }

        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      case 'get_market_status': {
        const data = await client.getMarketStatus();
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      }

      case 'get_upcoming_market_holidays': {
        const data = await client.getUpcomingMarketHolidays();
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      }

      case 'get_dividends': {
        const data = await client.getDividends({
          ticker: args.ticker,
          ex_dividend_date: args.ex_dividend_date,
          record_date: args.record_date,
          declaration_date: args.declaration_date,
          pay_date: args.pay_date,
          cash_amount: args.cash_amount,
          frequency: args.frequency,
          limit: args.limit,
          sort: args.sort,
          order: args.order
        });
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      }

      case 'get_option_ema': {
        const data = await client.getOptionEMA(
          args.symbol,
          args.optionType,
          args.strike,
          args.expiration,
          args.timespan || 'day',
          args.window || 20
        );
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      }

      case 'get_option_rsi': {
        const data = await client.getOptionRSI(
          args.symbol,
          args.optionType,
          args.strike,
          args.expiration,
          args.timespan || 'day',
          args.window || 14
        );
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [
        { 
          type: 'text', 
          text: `Error: ${error.message}` 
        }
      ]
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);

console.error('Massive Options MCP Server running...');