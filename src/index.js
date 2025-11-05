#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { 
  ListToolsRequestSchema, 
  CallToolRequestSchema 
} from '@modelcontextprotocol/sdk/types.js';
import { MassiveOptionsClient } from './massive-client.js';
import dotenv from 'dotenv';

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
        name: 'get_option_greeks',
        description: 'Get the Greeks (Delta, Gamma, Theta, Vega) for a specific option contract. Greeks measure the sensitivity of an option\'s price to various factors.',
        inputSchema: {
          type: 'object',
          properties: {
            symbol: {
              type: 'string',
              description: 'Stock ticker symbol in uppercase (e.g., "IBIT")'
            },
            optionType: {
              type: 'string',
              enum: ['call', 'put'],
              description: 'Option type: "call" or "put" (lowercase only)'
            },
            strike: {
              type: 'number',
              description: 'Strike price as a number (e.g., 70)'
            },
            expiration: {
              type: 'string',
              pattern: '^\\d{4}-\\d{2}-\\d{2}$',
              description: 'Expiration date in YYYY-MM-DD format'
            }
          },
          required: ['symbol', 'optionType', 'strike', 'expiration'],
          additionalProperties: false
        }
      },
      {
        name: 'get_implied_volatility',
        description: 'Get the implied volatility (IV) for a specific option contract. IV represents the market\'s expectation of future volatility.',
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
            }
          },
          required: ['symbol', 'optionType', 'strike', 'expiration'],
          additionalProperties: false
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
        name: 'get_previous_day_ohlc',
        description: 'Get the previous trading day\'s open, high, low, close, and volume for an option contract. Essential for daily performance analysis.',
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
            }
          },
          required: ['symbol', 'optionType', 'strike', 'expiration'],
          additionalProperties: false
        }
      },
      {
        name: 'get_daily_open_close',
        description: 'Get opening and closing prices for an option on a specific date, including pre-market and after-hours data. Useful for analyzing daily performance and off-hours trading activity.',
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
            date: {
              type: 'string',
              pattern: '^\\d{4}-\\d{2}-\\d{2}$',
              description: 'The date to get open/close data for in YYYY-MM-DD format'
            }
          },
          required: ['symbol', 'optionType', 'strike', 'expiration', 'date'],
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
        name: 'get_unusual_options_activity',
        description: 'Get unusual options activity based on volume and open interest',
        inputSchema: {
          type: 'object',
          properties: {
            minVolume: {
              type: 'number',
              description: 'Minimum volume threshold (default: 1000)'
            },
            minOI: {
              type: 'number',
              description: 'Minimum open interest threshold (default: 5000)'
            }
          }
        }
      },
      {
        name: 'get_last_trade',
        description: 'Get the most recent trade for a specific option contract. Returns real-time trade data including price, size, exchange, and timestamp. Useful for monitoring current market activity.',
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
            }
          },
          required: ['symbol', 'optionType', 'strike', 'expiration'],
          additionalProperties: false
        }
      },
      {
        name: 'get_option_chain_snapshot',
        description: 'Get a comprehensive market snapshot of all option contracts for a symbol with Greeks, IV, and analysis. Includes underlying price, put/call ratios, and organized data by expiration. Perfect for strategy comparison and market overview.',
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
              description: 'Optional: Filter by specific expiration date'
            },
            strikeMin: {
              type: 'number',
              description: 'Optional: Minimum strike price to include'
            },
            strikeMax: {
              type: 'number',
              description: 'Optional: Maximum strike price to include'
            }
          },
          required: ['symbol'],
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
      
      case 'get_option_greeks': {
        const data = await client.getGreeks(args.symbol, args.optionType, args.strike, args.expiration);
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      }
      
      case 'get_implied_volatility': {
        const data = await client.getImpliedVolatility(args.symbol, args.optionType, args.strike, args.expiration);
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      }
      
      case 'get_historical_aggregates': {
        const data = await client.getHistoricalAggregates(
          args.symbol, args.optionType, args.strike, args.expiration,
          args.multiplier, args.timespan, args.from, args.to
        );
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      }
      
      case 'get_previous_day_ohlc': {
        const data = await client.getPreviousDayOHLC(
          args.symbol, args.optionType, args.strike, args.expiration
        );
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      }
      
      case 'get_daily_open_close': {
        const data = await client.getDailyOpenClose(
          args.symbol, args.optionType, args.strike, args.expiration, args.date
        );
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      }
      
      case 'search_options': {
        const data = await client.searchOptions(args.query);
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      }
      
      case 'get_unusual_options_activity': {
        const data = await client.getUnusualActivity(args.minVolume, args.minOI);
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      }
      
      case 'get_last_trade': {
        const data = await client.getLastTrade(
          args.symbol, args.optionType, args.strike, args.expiration
        );
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      }
      
      case 'get_option_chain_snapshot': {
        const data = await client.getOptionChainSnapshot(
          args.symbol, args.expiration, args.strikeMin, args.strikeMax
        );
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