import axios from 'axios';
import { calculateFullAnalytics, calculateRiskReward } from './calculations.js';
import {
  analyzeVolatilitySmile,
  analyzeTermStructure,
  calculateIVRank
} from './volatility-analysis.js';
import {
  analyzePutCallRatios,
  analyzeGammaExposure,
  calculateMaxPain,
  analyzeOIDistribution
} from './market-structure.js';
import {
  generateBullCallSpreads,
  generateBearPutSpreads,
  generateIronCondors,
  generateCalendarSpreads,
  rankStrategies
} from './strategy-builder.js';
import {
  calculatePositionSize,
  validateRiskParameters,
  generateAllocationReport
} from './position-sizing.js';
import {
  generatePnLScenarios,
  generateComprehensivePnLReport,
  calculatePortfolioPnL
} from './pnl-calculator.js';
import {
  generateDealerMatrix,
  identifyKeyLevels,
  generateExpirationSummaries,
  generateTradingImplications,
  formatMatrixForDisplay
} from './dealer-positioning.js';

// Helper function to calculate days to expiration
function calculateDaysToExpiration(expirationDate) {
  const expiry = new Date(expirationDate);
  const today = new Date();
  const diffTime = expiry - today;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays > 0 ? diffDays : 0;
}

// Helper function to determine moneyness
function calculateMoneyness(contractType, strikePrice, underlyingPrice) {
  if (!underlyingPrice) return 'Unknown';
  
  if (contractType === 'call') {
    if (underlyingPrice > strikePrice * 1.05) return 'ITM (In The Money)';
    if (underlyingPrice < strikePrice * 0.95) return 'OTM (Out of The Money)';
    return 'ATM (At The Money)';
  } else { // put
    if (underlyingPrice < strikePrice * 0.95) return 'ITM (In The Money)';
    if (underlyingPrice > strikePrice * 1.05) return 'OTM (Out of The Money)';
    return 'ATM (At The Money)';
  }
}

export class MassiveOptionsClient {
  constructor(apiKey, baseUrl = 'https://api.massive.com/v3') {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.client = axios.create({
      baseURL: baseUrl,
      params: {
        apiKey: apiKey
      }
    });
  }

  async getOptionChain(symbol, expiration = null) {
    try {
      const params = {
        underlying_ticker: symbol,
        limit: 1000  // Already correct here
      };
      if (expiration) {
        params.expiration_date = expiration;
      }

      const response = await this.client.get('/reference/options/contracts', { params });
      return response.data;
    } catch (error) {
      throw new Error(`Failed to get option chain: ${error.message}`);
    }
  }

  async getQuote(symbol, optionType, strike, expiration) {
    try {
      // Use the snapshot endpoint with filters to get quote data
      const response = await this.client.get('/snapshot/options/' + symbol, {
        params: {
          contract_type: optionType,
          strike_price: strike,
          expiration_date: expiration
        }
      });

      if (!response.data.results || response.data.results.length === 0) {
        throw new Error('Option contract not found or no quote data available');
      }

      // Return the first result (should be only one with our filters)
      const quote = response.data.results[0];
      
      // Get additional contract details from reference endpoint
      let contractDetails = {};
      try {
        const refResponse = await this.client.get(`/reference/options/contracts/${quote.details.ticker}`);
        if (refResponse.data.results) {
          contractDetails = refResponse.data.results;
        }
      } catch (refError) {
        console.error('Could not fetch additional contract details:', refError.message);
      }
      
      // Get underlying stock price
      let underlyingPrice = null;
      try {
        const stockResponse = await this.client.get(`/v2/aggs/ticker/${symbol}/prev`);
        if (stockResponse.data.results && stockResponse.data.results.length > 0) {
          underlyingPrice = stockResponse.data.results[0].c; // closing price
        }
      } catch (stockError) {
        // Try alternative endpoint
        try {
          const altResponse = await this.client.get(`/v3/quotes/${symbol}`);
          if (altResponse.data.results && altResponse.data.results.length > 0) {
            underlyingPrice = altResponse.data.results[0].ask_price || altResponse.data.results[0].bid_price;
          }
        } catch (e) {
          console.error('Could not fetch underlying price:', e.message);
        }
      }
      
      // Format the response to include all relevant quote and contract data
      return {
        // Contract identification
        ticker: quote.details.ticker,
        underlying_ticker: symbol,
        contract_type: quote.details.contract_type,
        
        // Contract specifications
        strike_price: quote.details.strike_price,
        expiration_date: quote.details.expiration_date,
        exercise_style: quote.details.exercise_style,
        shares_per_contract: quote.details.shares_per_contract,
        
        // Exchange information
        primary_exchange: contractDetails.primary_exchange || 'N/A',
        cfi: contractDetails.cfi || 'N/A',
        
        // Market data
        quote: {
          last: quote.day.close,
          open: quote.day.open,
          high: quote.day.high,
          low: quote.day.low,
          volume: quote.day.volume,
          vwap: quote.day.vwap,
          change: quote.day.change,
          change_percent: quote.day.change_percent,
          previous_close: quote.day.previous_close,
          last_updated: new Date(quote.day.last_updated / 1000000).toISOString()
        },
        
        // Risk metrics
        greeks: {
          delta: quote.greeks?.delta || null,
          gamma: quote.greeks?.gamma || null,
          theta: quote.greeks?.theta || null,
          vega: quote.greeks?.vega || null,
          rho: quote.greeks?.rho || null
        },
        implied_volatility: quote.implied_volatility,
        
        // Market interest
        open_interest: quote.open_interest,
        
        // Additional info for analysis
        underlying_price: underlyingPrice,
        moneyness: calculateMoneyness(quote.details.contract_type, quote.details.strike_price, underlyingPrice),
        days_to_expiration: calculateDaysToExpiration(quote.details.expiration_date)
      };
    } catch (error) {
      throw new Error(`Failed to get quote: ${error.message}`);
    }
  }

  async getHistoricalAggregates(symbol, optionType, strike, expiration, multiplier, timespan, from, to) {
    try {
      // First, get the option ticker
      const ticker = await this.getOptionTicker(symbol, optionType, strike, expiration);
      
      // Get aggregates with custom timespan (v2 endpoint)
      const response = await axios.get(`https://api.massive.com/v2/aggs/ticker/${ticker}/range/${multiplier}/${timespan}/${from}/${to}`, {
        params: { apiKey: this.apiKey }
      });
      
      return {
        ticker: ticker,
        underlying: symbol,
        contract_type: optionType,
        strike: strike,
        expiration: expiration,
        timespan: `${multiplier} ${timespan}`,
        from: from,
        to: to,
        results: response.data.results || [],
        resultsCount: response.data.resultsCount || 0
      };
    } catch (error) {
      throw new Error(`Failed to get historical aggregates: ${error.message}`);
    }
  }

  async getPreviousDayOHLC(symbol, optionType, strike, expiration) {
    try {
      // Get the option ticker
      const ticker = await this.getOptionTicker(symbol, optionType, strike, expiration);
      
      // Get previous day's OHLC (v2 endpoint)
      const response = await axios.get(`https://api.massive.com/v2/aggs/ticker/${ticker}/prev`, {
        params: { apiKey: this.apiKey }
      });
      
      if (!response.data.results || response.data.results.length === 0) {
        throw new Error('No previous day data available');
      }
      
      const data = response.data.results[0];
      
      return {
        ticker: ticker,
        underlying: symbol,
        contract_type: optionType,
        strike: strike,
        expiration: expiration,
        date: new Date(data.t).toISOString().split('T')[0],
        open: data.o,
        high: data.h,
        low: data.l,
        close: data.c,
        volume: data.v,
        vwap: data.vw,
        timestamp: new Date(data.t).toISOString()
      };
    } catch (error) {
      throw new Error(`Failed to get previous day OHLC: ${error.message}`);
    }
  }

  async getDailyOpenClose(symbol, optionType, strike, expiration, date) {
    try {
      // Get the option ticker
      const ticker = await this.getOptionTicker(symbol, optionType, strike, expiration);
      
      // Get open-close data for specific date (v1 endpoint)
      const response = await axios.get(`https://api.massive.com/v1/open-close/${ticker}/${date}`, {
        params: { apiKey: this.apiKey }
      });
      
      if (response.data.status === 'NOT_FOUND') {
        throw new Error(`No data available for ${date}. This endpoint may not support options or the contract may not have traded on this date.`);
      }
      
      return {
        ticker: ticker,
        underlying: symbol,
        contract_type: optionType,
        strike: strike,
        expiration: expiration,
        date: date,
        open: response.data.open || null,
        close: response.data.close || null,
        high: response.data.high || null,
        low: response.data.low || null,
        volume: response.data.volume || null,
        preMarket: response.data.preMarket || null,
        afterHours: response.data.afterHours || null
      };
    } catch (error) {
      throw new Error(`Failed to get daily open-close data: ${error.message}`);
    }
  }

  async getGreeks(symbol, optionType, strike, expiration) {
    try {
      // Get snapshot data which includes Greeks
      const response = await this.client.get('/snapshot/options/' + symbol, {
        params: {
          contract_type: optionType,
          strike_price: strike,
          expiration_date: expiration
        }
      });

      if (!response.data.results || response.data.results.length === 0) {
        throw new Error('Option contract not found or no Greeks data available');
      }

      const quote = response.data.results[0];
      
      return {
        ticker: quote.details.ticker,
        underlying: symbol,
        contract_type: optionType,
        strike: strike,
        expiration: expiration,
        greeks: quote.greeks || {
          delta: null,
          gamma: null,
          theta: null,
          vega: null,
          rho: null
        },
        last_price: quote.day.close,
        last_updated: new Date(quote.day.last_updated / 1000000).toISOString()
      };
    } catch (error) {
      throw new Error(`Failed to get greeks: ${error.message}`);
    }
  }

  async getImpliedVolatility(symbol, optionType, strike, expiration) {
    try {
      // Get snapshot data which includes implied volatility
      const response = await this.client.get('/snapshot/options/' + symbol, {
        params: {
          contract_type: optionType,
          strike_price: strike,
          expiration_date: expiration
        }
      });

      if (!response.data.results || response.data.results.length === 0) {
        throw new Error('Option contract not found or no IV data available');
      }

      const quote = response.data.results[0];
      
      return {
        ticker: quote.details.ticker,
        underlying: symbol,
        contract_type: optionType,
        strike: strike,
        expiration: expiration,
        implied_volatility: quote.implied_volatility,
        last_price: quote.day.close,
        volume: quote.day.volume,
        open_interest: quote.open_interest,
        last_updated: new Date(quote.day.last_updated / 1000000).toISOString()
      };
    } catch (error) {
      throw new Error(`Failed to get implied volatility: ${error.message}`);
    }
  }

  // Helper method to get option ticker
  async getOptionTicker(symbol, optionType, strike, expiration) {
    const contractResponse = await this.client.get('/reference/options/contracts', {
      params: {
        underlying_ticker: symbol,
        contract_type: optionType,
        strike_price: strike,
        expiration_date: expiration,
        limit: 1
      }
    });

    if (!contractResponse.data.results || contractResponse.data.results.length === 0) {
      throw new Error('Option contract not found');
    }

    return contractResponse.data.results[0].ticker;
  }

  async getLastTrade(symbol, optionType, strike, expiration) {
    try {
      // Get the option ticker
      const ticker = await this.getOptionTicker(symbol, optionType, strike, expiration);
      
      // Get last trade data (v2 endpoint)
      const response = await axios.get(`https://api.massive.com/v2/last/trade/${ticker}`, {
        params: { apiKey: this.apiKey }
      });
      
      if (!response.data || !response.data.results) {
        throw new Error('No last trade data available');
      }
      
      const trade = response.data.results;
      
      return {
        ticker: ticker,
        underlying: symbol,
        contract_type: optionType,
        strike: strike,
        expiration: expiration,
        trade: {
          price: trade.price,
          size: trade.size,
          exchange: trade.exchange,
          conditions: trade.conditions || [],
          timestamp: new Date(trade.participant_timestamp || trade.sip_timestamp).toISOString()
        },
        status: response.data.status
      };
    } catch (error) {
      if (error.response?.status === 403) {
        throw new Error('Last trade data requires an upgraded API subscription. This endpoint is not available with the current plan.');
      }
      throw new Error(`Failed to get last trade: ${error.message}`);
    }
  }

  async getOptionChainSnapshot(symbol, expiration = null, strikeMin = null, strikeMax = null) {
    try {
      // Build query parameters
      const params = {
        limit: 250  // Maximum allowed by API
      };
      if (expiration) params.expiration_date = expiration;
      if (strikeMin !== null) params['strike_price.gte'] = strikeMin;
      if (strikeMax !== null) params['strike_price.lte'] = strikeMax;

      // Fetch all pages of results (pagination)
      let allResults = [];
      let offset = 0;
      let hasMore = true;

      while (hasMore) {
        params.offset = offset;

        const response = await this.client.get(`/snapshot/options/${symbol}`, { params });

        if (!response.data.results) {
          break;
        }

        allResults = allResults.concat(response.data.results);

        // Check if there are more pages
        if (response.data.next_url && response.data.results.length === params.limit) {
          offset += params.limit;
        } else {
          hasMore = false;
        }

        // Safety check: don't fetch more than 2000 contracts total
        if (allResults.length >= 2000) {
          console.error('Warning: Reached max of 2000 contracts, stopping pagination');
          hasMore = false;
        }
      }

      if (allResults.length === 0) {
        throw new Error('No options data available for this symbol');
      }

      console.error(`Fetched ${allResults.length} contracts via pagination`);

      // Get underlying asset data
      let underlyingData = null;
      try {
        const stockResponse = await axios.get(`https://api.massive.com/v2/aggs/ticker/${symbol}/prev`, {
          params: { apiKey: this.apiKey }
        });
        if (stockResponse.data.results && stockResponse.data.results.length > 0) {
          underlyingData = stockResponse.data.results[0];
        }
      } catch (e) {
        console.error('Could not fetch underlying data:', e.message);
      }

      // Process and organize the data
      const contracts = allResults.map(contract => ({
        // Contract identification
        ticker: contract.details.ticker,
        type: contract.details.contract_type,
        strike: contract.details.strike_price,
        expiration: contract.details.expiration_date,
        
        // Market data
        price: {
          last: contract.day?.close || null,
          change: contract.day?.change || 0,
          change_percent: contract.day?.change_percent || 0,
          volume: contract.day?.volume || 0,
          open_interest: contract.open_interest || 0
        },
        
        // Greeks and IV
        greeks: contract.greeks || {},
        implied_volatility: contract.implied_volatility || null,
        
        // Analysis
        moneyness: underlyingData ? 
          calculateMoneyness(contract.details.contract_type, contract.details.strike_price, underlyingData.c) : 
          'Unknown',
        break_even: contract.details.contract_type === 'call' ? 
          contract.details.strike_price + (contract.day?.close || 0) :
          contract.details.strike_price - (contract.day?.close || 0)
      }));
      
      // Organize by expiration and strike
      const expirations = {};
      contracts.forEach(contract => {
        if (!expirations[contract.expiration]) {
          expirations[contract.expiration] = {
            calls: [],
            puts: []
          };
        }
        if (contract.type === 'call') {
          expirations[contract.expiration].calls.push(contract);
        } else {
          expirations[contract.expiration].puts.push(contract);
        }
      });
      
      // Sort strikes within each expiration
      Object.keys(expirations).forEach(exp => {
        expirations[exp].calls.sort((a, b) => a.strike - b.strike);
        expirations[exp].puts.sort((a, b) => a.strike - b.strike);
      });
      
      return {
        underlying: {
          symbol: symbol,
          price: underlyingData?.c || null,
          change: underlyingData ? underlyingData.c - underlyingData.o : null,
          volume: underlyingData?.v || null
        },
        snapshot_time: new Date().toISOString(),
        total_contracts: contracts.length,
        expirations: Object.keys(expirations).sort(),
        data: expirations,
        summary: {
          total_call_volume: contracts.filter(c => c.type === 'call').reduce((sum, c) => sum + c.price.volume, 0),
          total_put_volume: contracts.filter(c => c.type === 'put').reduce((sum, c) => sum + c.price.volume, 0),
          total_call_oi: contracts.filter(c => c.type === 'call').reduce((sum, c) => sum + c.price.open_interest, 0),
          total_put_oi: contracts.filter(c => c.type === 'put').reduce((sum, c) => sum + c.price.open_interest, 0),
          put_call_ratio: contracts.filter(c => c.type === 'put').reduce((sum, c) => sum + c.price.volume, 0) /
                          contracts.filter(c => c.type === 'call').reduce((sum, c) => sum + c.price.volume, 0) || 0
        }
      };
    } catch (error) {
      throw new Error(`Failed to get option chain snapshot: ${error.message}`);
    }
  }

  async searchOptions(query) {
    try {
      // Search for underlying ticker
      const response = await this.client.get('/reference/tickers', {
        params: {
          search: query,
          type: 'CS',  // Common Stock
          limit: 10
        }
      });
      
      return response.data;
    } catch (error) {
      throw new Error(`Failed to search options: ${error.message}`);
    }
  }

  async getUnusualActivity(minVolume = 1000, minOI = 5000) {
    try {
      // This would typically require scanning through snapshots or aggregates
      // For now, return a message about the limitation
      return {
        message: 'Unusual activity scanning requires live data subscription and custom filtering',
        suggestion: 'Use getOptionChain to get contracts, then check individual volume/OI'
      };
    } catch (error) {
      throw new Error(`Failed to get unusual activity: ${error.message}`);
    }
  }

  async getOptionAnalytics(symbol, optionType, strike, expiration, targetPrice = null) {
    try {
      // First get the option quote with all necessary data
      const optionData = await this.getQuote(symbol, optionType, strike, expiration);
      
      // Get the current stock price
      const stockPrice = optionData.underlying_price;
      if (!stockPrice) {
        throw new Error('Could not fetch underlying stock price - required for analytics calculations');
      }
      
      // Format option data for calculations
      const formattedData = {
        contract_type: optionData.contract_type,
        strike_price: optionData.strike_price,
        expiration_date: optionData.expiration_date,
        quote: {
          last: optionData.quote.last,
          volume: optionData.quote.volume
        },
        greeks: optionData.greeks,
        implied_volatility: optionData.implied_volatility,
        open_interest: optionData.open_interest
      };
      
      // Calculate full analytics
      const analytics = calculateFullAnalytics(formattedData, stockPrice);
      
      // Add risk/reward analysis if target price is provided
      let riskRewardAnalysis = null;
      if (targetPrice !== null) {
        riskRewardAnalysis = calculateRiskReward(
          optionType,
          optionData.quote.last,
          strike,
          stockPrice,
          targetPrice
        );
      }
      
      // Combine all data
      return {
        // Original contract data
        ticker: optionData.ticker,
        underlying: symbol,
        underlying_price: stockPrice,
        contract: {
          type: optionData.contract_type,
          strike: optionData.strike_price,
          expiration: optionData.expiration_date,
          exercise_style: optionData.exercise_style
        },
        
        // Market data
        market: {
          last_price: optionData.quote.last,
          volume: optionData.quote.volume,
          open_interest: optionData.open_interest,
          change: optionData.quote.change,
          change_percent: optionData.quote.change_percent
        },
        
        // All calculated analytics
        analytics: analytics,
        
        // Risk/reward analysis (if target provided)
        risk_reward: riskRewardAnalysis,
        
        // Original Greeks for reference
        original_greeks: optionData.greeks,
        
        // Timestamp
        calculated_at: new Date().toISOString()
      };
      
    } catch (error) {
      throw new Error(`Failed to get option analytics: ${error.message}`);
    }
  }

  async getVolatilityAnalysis(symbol, expiration = null) {
    try {
      // Get option chain snapshot
      const chainData = await this.getOptionChainSnapshot(symbol, expiration);
      
      if (!chainData || !chainData.data) {
        throw new Error('No option chain data available');
      }
      
      const analysis = {
        symbol: symbol,
        underlying_price: chainData.underlying.price,
        analysis_time: new Date().toISOString(),
        smile_analysis: {},
        term_structure: null,
        iv_rank: null
      };
      
      // Analyze volatility smile for each expiration
      const expirations = Object.keys(chainData.data).sort();
      
      for (const exp of expirations) {
        const expData = chainData.data[exp];
        const strikes = [];
        const ivs = [];
        
        // Combine calls and puts, using OTM options
        const allOptions = [...expData.calls, ...expData.puts]
          .filter(opt => opt.implied_volatility && opt.strike)
          .sort((a, b) => a.strike - b.strike);
        
        // Remove duplicates and build strike/IV arrays
        const strikeSet = new Set();
        allOptions.forEach(opt => {
          if (!strikeSet.has(opt.strike)) {
            strikeSet.add(opt.strike);
            strikes.push(opt.strike);
            ivs.push(opt.implied_volatility);
          }
        });
        
        if (strikes.length >= 3) {
          try {
            analysis.smile_analysis[exp] = analyzeVolatilitySmile(
              strikes, 
              ivs, 
              chainData.underlying.price
            );
          } catch (e) {
            console.error(`Failed to analyze smile for ${exp}:`, e.message);
          }
        }
      }
      
      // Analyze term structure if we have multiple expirations
      if (expirations.length >= 2) {
        const atmIVs = [];
        const validExpirations = [];
        
        expirations.forEach(exp => {
          if (analysis.smile_analysis[exp]) {
            atmIVs.push(analysis.smile_analysis[exp].atmIV);
            validExpirations.push(exp);
          }
        });
        
        if (atmIVs.length >= 2) {
          analysis.term_structure = analyzeTermStructure(validExpirations, atmIVs);
        }
      }
      
      // Note: IV Rank would require historical data which isn't available from current API
      analysis.iv_rank = {
        message: 'IV Rank calculation requires historical implied volatility data',
        current_iv: analysis.smile_analysis[expirations[0]]?.atmIV || null
      };
      
      return analysis;
      
    } catch (error) {
      throw new Error(`Failed to get volatility analysis: ${error.message}`);
    }
  }

  async getMarketStructure(symbol, expiration = null) {
    try {
      // Get option chain snapshot
      const chainData = await this.getOptionChainSnapshot(symbol, expiration);
      
      if (!chainData || !chainData.data) {
        throw new Error('No option chain data available');
      }
      
      const spotPrice = chainData.underlying.price;
      if (!spotPrice) {
        throw new Error('Unable to get underlying price');
      }
      
      // Perform all market structure analyses
      const analysis = {
        symbol: symbol,
        underlying_price: spotPrice,
        analysis_time: new Date().toISOString(),
        
        // Put/Call ratios
        put_call_ratios: analyzePutCallRatios(chainData.data),
        
        // Gamma exposure
        gamma_exposure: analyzeGammaExposure(chainData.data, spotPrice),
        
        // Max pain
        max_pain: calculateMaxPain(chainData.data, spotPrice),
        
        // OI distribution
        oi_distribution: analyzeOIDistribution(chainData.data, spotPrice),
        
        // Summary metrics from chainData
        summary: chainData.summary
      };
      
      // Add overall market interpretation
      analysis.overall_interpretation = this.interpretMarketStructure(analysis);
      
      return analysis;
      
    } catch (error) {
      throw new Error(`Failed to get market structure analysis: ${error.message}`);
    }
  }

  // Helper method to provide overall market interpretation
  interpretMarketStructure(analysis) {
    const interpretations = [];
    
    // P/C ratio interpretation
    if (analysis.put_call_ratios.volume.ratio > 1.0) {
      interpretations.push('Elevated put activity suggests defensive positioning');
    } else if (analysis.put_call_ratios.volume.ratio < 0.6) {
      interpretations.push('High call activity indicates bullish sentiment');
    }
    
    // Gamma regime
    if (analysis.gamma_exposure.regime === 'Negative Gamma') {
      interpretations.push('Dealers short gamma - expect volatile, trending moves');
    } else {
      interpretations.push('Dealers long gamma - expect range-bound, mean-reverting action');
    }
    
    // Max pain
    const maxPainDiff = analysis.max_pain.percentFromSpot;
    if (Math.abs(maxPainDiff) > 3) {
      interpretations.push(`Max pain ${maxPainDiff > 0 ? 'above' : 'below'} spot may create ${maxPainDiff > 0 ? 'upward' : 'downward'} pressure`);
    }
    
    // Support/Resistance
    if (analysis.oi_distribution.nearestResistance && analysis.oi_distribution.nearestSupport) {
      interpretations.push(`Key range: ${analysis.oi_distribution.nearestSupport}-${analysis.oi_distribution.nearestResistance}`);
    }
    
    return interpretations.join('. ');
  }

  /**
   * Deep options analysis - comprehensive multi-expiration analysis with strategies
   * @param {Object} params - Analysis parameters
   * @returns {Object} Comprehensive analysis report
   */
  async deepOptionsAnalysis(params) {
    const {
      symbol,
      target_expirations = [],
      strikes_to_analyze = [],
      account_size,
      mode = 'both', // 'manual', 'auto', or 'both'
      strategies = ['bull_call_spread', 'bear_put_spread', 'iron_condor', 'calendar_spread'],
      risk_config = {},
      current_price = null
    } = params;

    // Validate and sanitize risk configuration
    const validatedRiskConfig = validateRiskParameters(risk_config);

    const analysis = {
      symbol: symbol,
      analysis_time: new Date().toISOString(),
      account_size: account_size,
      risk_configuration: validatedRiskConfig,
      snapshot: null,
      unusual_activity: [],
      institutional_magnets: [],
      volatility_analysis: {},
      recommended_strategies: [],
      allocation_report: null,
      portfolio_pnl: null
    };

    try {
      // Step 1: Get comprehensive market snapshot
      console.error('Step 1: Fetching market snapshot...');
      const snapshot = await this.getOptionChainSnapshot(symbol);
      analysis.snapshot = {
        underlying_price: snapshot.underlying.price,
        total_contracts: snapshot.total_contracts,
        expirations_available: snapshot.expirations,
        put_call_ratio: snapshot.summary.put_call_ratio
      };

      const underlyingPrice = current_price || snapshot.underlying.price;
      if (!underlyingPrice) {
        throw new Error('Could not determine underlying price');
      }

      // Step 2: Analyze target expirations (or all if not specified)
      const expirationsToAnalyze = target_expirations.length > 0 ?
        target_expirations :
        snapshot.expirations.slice(0, 4); // Analyze first 4 expirations

      console.error(`Step 2: Analyzing ${expirationsToAnalyze.length} expirations...`);

      // Step 3: Get market structure and volatility for each expiration
      for (const expiration of expirationsToAnalyze) {
        try {
          // Get market structure
          const marketStructure = await this.getMarketStructure(symbol, expiration);

          // Get volatility analysis
          const volAnalysis = await this.getVolatilityAnalysis(symbol, expiration);

          analysis.volatility_analysis[expiration] = {
            smile: volAnalysis.smile_analysis[expiration],
            put_call_ratios: marketStructure.put_call_ratios,
            gamma_exposure: marketStructure.gamma_exposure,
            max_pain: marketStructure.max_pain,
            oi_distribution: marketStructure.oi_distribution
          };

          // Identify institutional magnets (high OI strikes)
          if (marketStructure.oi_distribution.callWalls) {
            marketStructure.oi_distribution.callWalls.slice(0, 3).forEach(wall => {
              analysis.institutional_magnets.push({
                expiration: expiration,
                strike: wall.strike,
                type: 'resistance',
                open_interest: wall.openInterest,
                strength: wall.percentOfTotal
              });
            });
          }

          if (marketStructure.oi_distribution.putWalls) {
            marketStructure.oi_distribution.putWalls.slice(0, 3).forEach(wall => {
              analysis.institutional_magnets.push({
                expiration: expiration,
                strike: wall.strike,
                type: 'support',
                open_interest: wall.openInterest,
                strength: wall.percentOfTotal
              });
            });
          }

        } catch (error) {
          console.error(`Failed to analyze expiration ${expiration}:`, error.message);
        }
      }

      // Step 4: Detect unusual activity (volume spikes)
      console.error('Step 4: Detecting unusual activity...');
      const unusualStrikes = new Set();

      for (const expiration of expirationsToAnalyze) {
        const expData = snapshot.data[expiration];
        if (!expData) continue;

        // Check both calls and puts
        [...expData.calls, ...expData.puts].forEach(option => {
          const volume = option.price?.volume || 0;
          const oi = option.price?.open_interest || 0;

          // Flag unusual activity: high volume relative to OI, or very high absolute volume
          const volumeOIRatio = oi > 0 ? volume / oi : 0;

          if (volume > 1000 && (volumeOIRatio > 0.5 || volume > 5000)) {
            analysis.unusual_activity.push({
              expiration: expiration,
              strike: option.strike,
              type: option.type,
              volume: volume,
              open_interest: oi,
              volume_oi_ratio: parseFloat(volumeOIRatio.toFixed(2)),
              last_price: option.price?.last || 0,
              unusual_score: parseFloat((volume / 1000 + volumeOIRatio * 10).toFixed(2))
            });

            // Track strike for auto-detection
            if (mode === 'auto' || mode === 'both') {
              unusualStrikes.add(option.strike);
            }
          }
        });
      }

      // Sort unusual activity by score
      analysis.unusual_activity.sort((a, b) => b.unusual_score - a.unusual_score);
      analysis.unusual_activity = analysis.unusual_activity.slice(0, 20); // Top 20

      // Step 5: Determine strikes to use for strategy generation
      let strikesToUse = [];

      if (mode === 'manual' && strikes_to_analyze.length > 0) {
        strikesToUse = strikes_to_analyze;
      } else if (mode === 'auto' || (mode === 'both' && strikes_to_analyze.length === 0)) {
        // Auto-detect strikes from unusual activity and institutional magnets
        const autoStrikes = new Set([...unusualStrikes]);

        // Add institutional magnet strikes
        analysis.institutional_magnets.forEach(magnet => {
          if (magnet.strength > 10) { // Only strong magnets
            autoStrikes.add(magnet.strike);
          }
        });

        // Add ATM and near-the-money strikes
        const atmStrikes = [
          Math.floor(underlyingPrice / 5) * 5, // Round to nearest 5
          Math.ceil(underlyingPrice / 5) * 5
        ];
        atmStrikes.forEach(s => autoStrikes.add(s));

        strikesToUse = Array.from(autoStrikes).sort((a, b) => a - b);
      } else if (mode === 'both') {
        // Combine manual and auto
        const combinedStrikes = new Set([...strikes_to_analyze, ...unusualStrikes]);
        strikesToUse = Array.from(combinedStrikes).sort((a, b) => a - b);
      }

      console.error(`Step 5: Generating strategies for ${strikesToUse.length} strikes...`);

      // Step 6: Generate strategies for each expiration
      const allStrategies = [];

      for (const expiration of expirationsToAnalyze) {
        const expData = snapshot.data[expiration];
        if (!expData) continue;

        // Filter options by strikes to analyze
        const callsToUse = strikesToUse.length > 0 ?
          expData.calls.filter(c => strikesToUse.includes(c.strike)) :
          expData.calls;
        const putsToUse = strikesToUse.length > 0 ?
          expData.puts.filter(p => strikesToUse.includes(p.strike)) :
          expData.puts;

        // Generate each strategy type if requested
        if (strategies.includes('bull_call_spread')) {
          const bullCallSpreads = generateBullCallSpreads(
            callsToUse,
            underlyingPrice,
            strikesToUse.length > 0 ? strikesToUse : null
          );
          allStrategies.push(...bullCallSpreads);
        }

        if (strategies.includes('bear_put_spread')) {
          const bearPutSpreads = generateBearPutSpreads(
            putsToUse,
            underlyingPrice,
            strikesToUse.length > 0 ? strikesToUse : null
          );
          allStrategies.push(...bearPutSpreads);
        }

        if (strategies.includes('iron_condor')) {
          const ironCondors = generateIronCondors(
            callsToUse,
            putsToUse,
            underlyingPrice
          );
          allStrategies.push(...ironCondors);
        }
      }

      // Generate calendar spreads across expirations
      if (strategies.includes('calendar_spread') && expirationsToAnalyze.length >= 2) {
        const calendarSpreads = generateCalendarSpreads(
          snapshot.data,
          underlyingPrice,
          'call'
        );
        allStrategies.push(...calendarSpreads);
      }

      console.error(`Step 6: Generated ${allStrategies.length} strategy candidates...`);

      // Step 7: Rank and filter strategies
      const rankedStrategies = rankStrategies(allStrategies, {
        minRewardRatio: validatedRiskConfig.min_reward_ratio,
        minProbProfit: validatedRiskConfig.min_prob_profit,
        preferenceType: 'balanced'
      });

      console.error(`Step 7: ${rankedStrategies.length} strategies passed filters...`);

      // Step 8: Calculate position sizing for top strategies
      const strategiesWithSizing = rankedStrategies.slice(0, 15).map(strategy => {
        const sizing = calculatePositionSize(strategy, account_size, validatedRiskConfig);

        // Generate P&L scenarios
        const pnlReport = generateComprehensivePnLReport(
          strategy,
          sizing.recommended_contracts,
          {
            currentPrice: underlyingPrice,
            targetPrices: [
              underlyingPrice * 0.95,
              underlyingPrice,
              underlyingPrice * 1.05,
              underlyingPrice * 1.10
            ]
          }
        );

        return {
          ...strategy,
          position_sizing: sizing,
          pnl_analysis: pnlReport
        };
      });

      // Filter out rejected strategies
      analysis.recommended_strategies = strategiesWithSizing.filter(
        s => !s.position_sizing.rejected
      );

      console.error(`Step 8: ${analysis.recommended_strategies.length} strategies recommended...`);

      // Step 9: Generate allocation report
      if (analysis.recommended_strategies.length > 0) {
        analysis.allocation_report = generateAllocationReport(
          analysis.recommended_strategies,
          account_size
        );

        // Generate portfolio-level P&L
        analysis.portfolio_pnl = calculatePortfolioPnL(
          analysis.recommended_strategies,
          { currentPrice: underlyingPrice }
        );
      }

      // Step 10: Generate executive summary
      analysis.executive_summary = {
        total_strategies_analyzed: allStrategies.length,
        strategies_recommended: analysis.recommended_strategies.length,
        total_capital_required: analysis.allocation_report?.total_capital_allocated || 0,
        total_risk: analysis.allocation_report?.total_risk || 0,
        potential_profit: analysis.allocation_report?.total_potential_profit || 0,
        portfolio_reward_ratio: analysis.allocation_report?.portfolio_reward_ratio || 0,
        unusual_activity_detected: analysis.unusual_activity.length,
        key_support_levels: analysis.institutional_magnets
          .filter(m => m.type === 'support')
          .slice(0, 3)
          .map(m => m.strike),
        key_resistance_levels: analysis.institutional_magnets
          .filter(m => m.type === 'resistance')
          .slice(0, 3)
          .map(m => m.strike)
      };

      return analysis;

    } catch (error) {
      throw new Error(`Deep options analysis failed: ${error.message}`);
    }
  }

  /**
   * Get dealer positioning matrix (GEX/VEX) across strikes and expirations
   * HeatSeeker-style analysis showing dealer gamma and vega exposure
   * @param {Object} params - Analysis parameters
   * @returns {Object} Dealer positioning matrix with key levels and implications
   */
  async getDealerPositioningMatrix(params) {
    const {
      symbol,
      expirations = null, // If null, uses all available
      strike_range = null, // { min, max } or null for all
      include_vex = false,
      format = 'matrix' // 'matrix' or 'list'
    } = params;

    try {
      console.error('Fetching dealer positioning matrix...');

      // Get option chain snapshot
      const snapshot = await this.getOptionChainSnapshot(
        symbol,
        null, // Get all expirations
        strike_range?.min,
        strike_range?.max
      );

      const underlyingPrice = snapshot.underlying.price;
      if (!underlyingPrice) {
        throw new Error('Could not determine underlying price');
      }

      // Filter to requested expirations or use all available
      const targetExpirations = expirations || snapshot.expirations;
      const filteredData = {};

      targetExpirations.forEach(exp => {
        if (snapshot.data[exp]) {
          filteredData[exp] = snapshot.data[exp];
        }
      });

      if (Object.keys(filteredData).length === 0) {
        throw new Error('No data available for requested expirations');
      }

      console.error(`Processing ${Object.keys(filteredData).length} expirations...`);

      // Generate dealer GEX/VEX matrix
      const { gexMatrix, vexMatrix, strikes } = generateDealerMatrix(
        filteredData,
        underlyingPrice,
        {
          strikeMin: strike_range?.min,
          strikeMax: strike_range?.max,
          includeVEX: include_vex
        }
      );

      // Identify key levels
      const keyLevels = identifyKeyLevels(gexMatrix, strikes, underlyingPrice);

      // Generate expiration summaries
      const expirationSummaries = generateExpirationSummaries(
        gexMatrix,
        filteredData,
        underlyingPrice
      );

      // Generate trading implications
      const tradingImplications = generateTradingImplications(keyLevels, underlyingPrice);

      // Format output
      const result = {
        symbol: symbol,
        current_price: underlyingPrice,
        analysis_time: new Date().toISOString(),
        expirations: targetExpirations,
        strike_range: {
          min: Math.min(...strikes),
          max: Math.max(...strikes),
          count: strikes.length
        },

        // Matrix data
        gex_matrix: format === 'matrix' ? gexMatrix : formatMatrixForDisplay(gexMatrix, strikes),

        // Key levels identified
        key_levels: {
          max_positive_gex: {
            strike: keyLevels.maxPositiveGEX.strike,
            expiration: keyLevels.maxPositiveGEX.expiration,
            value: parseFloat(keyLevels.maxPositiveGEX.value.toFixed(2)),
            interpretation: keyLevels.maxPositiveGEX.value > 10000000 ?
              `Strong magnet level at $${keyLevels.maxPositiveGEX.strike} - dealers will suppress volatility and push price toward this strike` :
              'Moderate positive GEX - some volatility dampening'
          },
          max_negative_gex: {
            strike: keyLevels.maxNegativeGEX.strike,
            expiration: keyLevels.maxNegativeGEX.expiration,
            value: parseFloat(keyLevels.maxNegativeGEX.value.toFixed(2)),
            interpretation: keyLevels.maxNegativeGEX.value < -10000000 ?
              `Danger zone at $${keyLevels.maxNegativeGEX.strike} - break through this level triggers dealer hedging that amplifies the move` :
              'Moderate negative GEX - some volatility amplification'
          },
          zero_gamma_strike: keyLevels.zeroGammaStrike,
          total_gex: parseFloat(keyLevels.totalGEX.toFixed(2)),
          regime: keyLevels.regime
        },

        // Expiration-level summaries
        expiration_summary: expirationSummaries,

        // Trading implications
        trading_implications: tradingImplications,

        // GEX by strike (aggregated across expirations)
        gex_by_strike: Object.entries(keyLevels.gexByStrike)
          .map(([strike, gex]) => ({
            strike: parseFloat(strike),
            gex: parseFloat(gex.toFixed(2))
          }))
          .sort((a, b) => b.gex - a.gex) // Sort by GEX descending
      };

      // Add VEX matrix if requested
      if (include_vex && vexMatrix) {
        result.vex_matrix = format === 'matrix' ? vexMatrix : formatMatrixForDisplay(vexMatrix, strikes);
      }

      console.error('Dealer positioning analysis complete.');

      return result;

    } catch (error) {
      throw new Error(`Failed to get dealer positioning matrix: ${error.message}`);
    }
  }

  /**
   * Get Exponential Moving Average (EMA) for an option contract
   * @param {Object} params - EMA parameters
   * @returns {Object} EMA data with values and timestamps
   */
  async getOptionEMA(params) {
    const {
      symbol,
      optionType,
      strike,
      expiration,
      timespan = 'day', // day, hour, minute
      window = 50, // EMA window (10, 20, 50, 200 common)
      series_type = 'close', // close, open, high, low
      limit = 10,
      adjusted = true
    } = params;

    try {
      // Get the option ticker
      const ticker = await this.getOptionTicker(symbol, optionType, strike, expiration);

      // Call the EMA endpoint
      const response = await axios.get(`https://api.massive.com/v1/indicators/ema/${ticker}`, {
        params: {
          timespan,
          adjusted: adjusted.toString(),
          window,
          series_type,
          order: 'desc',
          limit,
          apiKey: this.apiKey
        }
      });

      if (!response.data.results || !response.data.results.values) {
        throw new Error('No EMA data available for this option');
      }

      return {
        ticker: ticker,
        underlying: symbol,
        contract_type: optionType,
        strike: strike,
        expiration: expiration,
        indicator: 'EMA',
        parameters: {
          window: window,
          timespan: timespan,
          series_type: series_type,
          adjusted: adjusted
        },
        results: response.data.results.values.map(item => ({
          timestamp: new Date(item.timestamp).toISOString(),
          value: item.value
        })),
        next_url: response.data.next_url || null,
        status: response.data.status
      };

    } catch (error) {
      if (error.response?.status === 404) {
        throw new Error('EMA data not available for this option contract. The option may be too illiquid or recently listed.');
      }
      throw new Error(`Failed to get option EMA: ${error.message}`);
    }
  }

  /**
   * Get Relative Strength Index (RSI) for an option contract
   * @param {Object} params - RSI parameters
   * @returns {Object} RSI data with values and timestamps
   */
  async getOptionRSI(params) {
    const {
      symbol,
      optionType,
      strike,
      expiration,
      timespan = 'day', // day, hour, minute
      window = 14, // RSI window (typically 14)
      series_type = 'close', // close, open, high, low
      limit = 10,
      adjusted = true
    } = params;

    try {
      // Get the option ticker
      const ticker = await this.getOptionTicker(symbol, optionType, strike, expiration);

      // Call the RSI endpoint
      const response = await axios.get(`https://api.massive.com/v1/indicators/rsi/${ticker}`, {
        params: {
          timespan,
          adjusted: adjusted.toString(),
          window,
          series_type,
          order: 'desc',
          limit,
          apiKey: this.apiKey
        }
      });

      if (!response.data.results || !response.data.results.values) {
        throw new Error('No RSI data available for this option');
      }

      const values = response.data.results.values.map(item => ({
        timestamp: new Date(item.timestamp).toISOString(),
        value: item.value
      }));

      // Analyze RSI levels
      const latestRSI = values[0]?.value;
      let signal = 'Neutral';
      if (latestRSI >= 70) {
        signal = 'Overbought - Consider selling or taking profits';
      } else if (latestRSI <= 30) {
        signal = 'Oversold - Potential buying opportunity';
      }

      return {
        ticker: ticker,
        underlying: symbol,
        contract_type: optionType,
        strike: strike,
        expiration: expiration,
        indicator: 'RSI',
        parameters: {
          window: window,
          timespan: timespan,
          series_type: series_type,
          adjusted: adjusted
        },
        current_rsi: latestRSI,
        signal: signal,
        interpretation: {
          overbought_threshold: 70,
          oversold_threshold: 30,
          current_status: latestRSI >= 70 ? 'Overbought' : latestRSI <= 30 ? 'Oversold' : 'Neutral'
        },
        results: values,
        next_url: response.data.next_url || null,
        status: response.data.status
      };

    } catch (error) {
      if (error.response?.status === 404) {
        throw new Error('RSI data not available for this option contract. The option may be too illiquid or recently listed.');
      }
      throw new Error(`Failed to get option RSI: ${error.message}`);
    }
  }

  /**
   * Get current market trading status
   * @returns {Object} Current market status for all exchanges
   */
  async getMarketStatus() {
    try {
      const response = await axios.get('https://api.massive.com/v1/marketstatus/now', {
        params: { apiKey: this.apiKey }
      });

      if (!response.data) {
        throw new Error('No market status data available');
      }

      // Process market status for each exchange
      const markets = response.data.exchanges || response.data;
      const marketStatus = Array.isArray(markets) ? markets : [markets];

      const summary = {
        timestamp: new Date().toISOString(),
        overall_status: marketStatus.every(m => m.market === 'open') ? 'Markets Open' : 'Markets Closed',
        markets: marketStatus.map(exchange => ({
          exchange: exchange.exchange || exchange.name || 'Unknown',
          market: exchange.market || exchange.status,
          server_time: exchange.serverTime ? new Date(exchange.serverTime).toISOString() : null,
          local_open: exchange.local_open || null,
          local_close: exchange.local_close || null,
          currencies: exchange.currencies || null
        })),
        trading_allowed: marketStatus.some(m => m.market === 'open'),
        after_hours: marketStatus.some(m => m.market === 'extended-hours'),
        warnings: []
      };

      // Add warnings for closed markets
      if (!summary.trading_allowed) {
        summary.warnings.push('Markets are currently closed. Regular trading hours are 9:30 AM - 4:00 PM ET.');
      }

      if (summary.after_hours) {
        summary.warnings.push('Extended hours trading is active. Liquidity may be limited.');
      }

      return summary;

    } catch (error) {
      throw new Error(`Failed to get market status: ${error.message}`);
    }
  }

  /**
   * Get upcoming market holidays and special hours
   * @returns {Object} Upcoming market holidays and early close days
   */
  async getUpcomingMarketHolidays() {
    try {
      const response = await axios.get('https://api.massive.com/v1/marketstatus/upcoming', {
        params: { apiKey: this.apiKey }
      });

      if (!response.data) {
        throw new Error('No market holiday data available');
      }

      const holidays = Array.isArray(response.data) ? response.data : [response.data];

      return {
        timestamp: new Date().toISOString(),
        total_events: holidays.length,
        upcoming_events: holidays.map(event => ({
          date: event.date,
          exchange: event.exchange || 'NYSE',
          name: event.name || event.holiday || 'Market Holiday',
          status: event.status || event.market,
          open: event.open || null,
          close: event.close || null,
          early_close: event.status === 'early-close' || (event.close && event.close !== '16:00'),
          full_closure: event.status === 'closed' || event.market === 'closed',
          notes: event.status === 'early-close' ? `Market closes early at ${event.close}` :
                 event.status === 'closed' ? 'Market fully closed' : null
        })),
        next_full_closure: holidays.find(h => h.status === 'closed' || h.market === 'closed'),
        next_early_close: holidays.find(h => h.status === 'early-close')
      };

    } catch (error) {
      throw new Error(`Failed to get upcoming market holidays: ${error.message}`);
    }
  }

  /**
   * Get dividend information for a stock
   * @param {Object} params - Dividend query parameters
   * @returns {Object} Dividend data including upcoming and historical dividends
   */
  async getDividends(params = {}) {
    const {
      ticker = null,
      ex_dividend_date = null, // Filter by ex-dividend date
      record_date = null,
      declaration_date = null,
      pay_date = null,
      frequency = null, // 0=one-time, 1=annual, 2=bi-annual, 4=quarterly, 12=monthly
      cash_amount = null,
      limit = 100,
      sort = 'ex_dividend_date',
      order = 'desc'
    } = params;

    try {
      const queryParams = {
        apiKey: this.apiKey,
        limit,
        sort,
        order
      };

      // Add optional filters
      if (ticker) queryParams.ticker = ticker;
      if (ex_dividend_date) queryParams.ex_dividend_date = ex_dividend_date;
      if (record_date) queryParams.record_date = record_date;
      if (declaration_date) queryParams.declaration_date = declaration_date;
      if (pay_date) queryParams.pay_date = pay_date;
      if (frequency !== null) queryParams.frequency = frequency;
      if (cash_amount !== null) queryParams.cash_amount = cash_amount;

      const response = await axios.get('https://api.massive.com/v3/reference/dividends', {
        params: queryParams
      });

      if (!response.data.results) {
        return {
          ticker: ticker || 'All',
          total_results: 0,
          dividends: [],
          next_dividend: null
        };
      }

      const dividends = response.data.results.map(div => ({
        ticker: div.ticker,
        cash_amount: div.cash_amount,
        currency: div.currency || 'USD',
        declaration_date: div.declaration_date,
        ex_dividend_date: div.ex_dividend_date,
        pay_date: div.pay_date,
        record_date: div.record_date,
        frequency: div.frequency,
        frequency_name: this.getDividendFrequencyName(div.frequency),
        dividend_type: div.dividend_type,
        days_until_ex_div: this.calculateDaysUntil(div.ex_dividend_date),
        days_until_payment: this.calculateDaysUntil(div.pay_date)
      }));

      // Find next upcoming dividend for this ticker
      const upcoming = dividends.filter(d =>
        new Date(d.ex_dividend_date) > new Date()
      ).sort((a, b) =>
        new Date(a.ex_dividend_date) - new Date(b.ex_dividend_date)
      );

      const result = {
        ticker: ticker || 'All',
        total_results: dividends.length,
        dividends: dividends,
        next_dividend: upcoming.length > 0 ? upcoming[0] : null,
        status: response.data.status,
        request_id: response.data.request_id
      };

      // Add options trading implications if we have an upcoming dividend
      if (ticker && result.next_dividend && result.next_dividend.days_until_ex_div <= 30) {
        result.options_implications = {
          warning: 'Upcoming ex-dividend date affects option pricing',
          ex_div_date: result.next_dividend.ex_dividend_date,
          days_until: result.next_dividend.days_until_ex_div,
          dividend_amount: result.next_dividend.cash_amount,
          impact: {
            call_options: 'May experience early assignment risk if deep ITM',
            put_options: 'Intrinsic value increases by dividend amount on ex-div date',
            strategy: result.next_dividend.days_until_ex_div <= 7 ?
              'CRITICAL: Ex-div date within 7 days - high early assignment risk for ITM calls' :
              'Monitor positions closely as ex-div date approaches'
          }
        };
      }

      return result;

    } catch (error) {
      throw new Error(`Failed to get dividend data: ${error.message}`);
    }
  }

  /**
   * Helper method to get dividend frequency name
   */
  getDividendFrequencyName(frequency) {
    const frequencies = {
      0: 'One-Time',
      1: 'Annual',
      2: 'Semi-Annual',
      4: 'Quarterly',
      12: 'Monthly'
    };
    return frequencies[frequency] || 'Unknown';
  }

  /**
   * Helper method to calculate days until a date
   */
  calculateDaysUntil(dateString) {
    if (!dateString) return null;
    const targetDate = new Date(dateString);
    const today = new Date();
    const diffTime = targetDate - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  }
}