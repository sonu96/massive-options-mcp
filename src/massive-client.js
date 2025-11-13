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
        // Timestamp information
        timestamp: new Date().toISOString(),
        data_timestamp: quote.day?.last_updated
          ? new Date(quote.day.last_updated / 1000000).toISOString()
          : new Date().toISOString(),

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
          last_updated: quote.day?.last_updated
            ? new Date(quote.day.last_updated / 1000000).toISOString()
            : null
        },

        // Latest bid/ask if available
        last_quote: quote.last_quote ? {
          bid_price: quote.last_quote.bid_price,
          ask_price: quote.last_quote.ask_price,
          mid_price: quote.last_quote.mid_price,
          bid_size: quote.last_quote.bid_size,
          ask_size: quote.last_quote.ask_size,
          quote_timestamp: quote.last_quote.last_updated
            ? new Date(quote.last_quote.last_updated / 1000000).toISOString()
            : null
        } : null,

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

  async getMarketIndicators() {
    try {
      console.error('Fetching market indicators...');

      const symbols = {
        SPY: 'S&P 500 ETF',
        VIX: 'Volatility Index',
        QQQ: 'Nasdaq-100 Tech ETF',
        UUP: 'US Dollar Index ETF',
        TLT: '20+ Year Treasury Bond ETF'
      };

      const indicators = {};

      // Fetch data for each symbol
      for (const [symbol, name] of Object.entries(symbols)) {
        try {
          // Get current quote
          const quoteResponse = await this.client.get(`/v3/quotes/${symbol}`);

          // Get previous day data
          const prevResponse = await this.client.get(`/v2/aggs/ticker/${symbol}/prev`);

          if (quoteResponse.data.results && quoteResponse.data.results.length > 0 &&
              prevResponse.data.results && prevResponse.data.results.length > 0) {

            const quote = quoteResponse.data.results[0];
            const prev = prevResponse.data.results[0];

            // Calculate current price (use last trade or average of bid/ask)
            const currentPrice = quote.last_price || ((quote.ask_price + quote.bid_price) / 2);
            const prevClose = prev.c;

            // Calculate change
            const change = currentPrice - prevClose;
            const changePercent = (change / prevClose) * 100;

            // Determine direction and strength
            let direction, strength, trend;

            if (changePercent > 0) {
              direction = 'UP';
              if (changePercent > 2) strength = 'STRONG';
              else if (changePercent > 0.5) strength = 'MODERATE';
              else strength = 'WEAK';
            } else if (changePercent < 0) {
              direction = 'DOWN';
              if (changePercent < -2) strength = 'STRONG';
              else if (changePercent < -0.5) strength = 'MODERATE';
              else strength = 'WEAK';
            } else {
              direction = 'FLAT';
              strength = 'NEUTRAL';
            }

            // Special handling for VIX (volatility interpretation)
            if (symbol === 'VIX') {
              if (currentPrice > 30) trend = 'HIGH FEAR - Market stress elevated';
              else if (currentPrice > 20) trend = 'ELEVATED - Increased uncertainty';
              else if (currentPrice < 15) trend = 'LOW - Complacency in markets';
              else trend = 'NORMAL - Healthy volatility levels';
            } else if (symbol === 'UUP') {
              // Dollar interpretation
              trend = direction === 'UP' ?
                'Dollar strengthening - headwind for stocks/commodities' :
                'Dollar weakening - tailwind for stocks/commodities';
            } else if (symbol === 'TLT') {
              // Bond interpretation (inverse to yields)
              trend = direction === 'UP' ?
                'Bonds rallying - yields falling, risk-off sentiment' :
                'Bonds selling - yields rising, risk-on or inflation concerns';
            } else {
              // Stock ETF interpretation
              trend = `${direction.toLowerCase()} ${strength.toLowerCase()}`;
            }

            indicators[symbol] = {
              name: name,
              current_price: parseFloat(currentPrice.toFixed(2)),
              previous_close: parseFloat(prevClose.toFixed(2)),
              change: parseFloat(change.toFixed(2)),
              change_percent: parseFloat(changePercent.toFixed(2)),
              direction: direction,
              strength: strength,
              trend: trend,
              timestamp: new Date(quote.participant_timestamp / 1000000).toISOString()
            };

          }
        } catch (symbolError) {
          console.error(`Error fetching ${symbol}:`, symbolError.message);
          indicators[symbol] = {
            name: name,
            error: `Failed to fetch data: ${symbolError.message}`
          };
        }
      }

      // Generate market summary
      const summary = this.generateMarketSummary(indicators);

      return {
        timestamp: new Date().toISOString(),
        indicators: indicators,
        market_summary: summary
      };

    } catch (error) {
      throw new Error(`Failed to get market indicators: ${error.message}`);
    }
  }

  generateMarketSummary(indicators) {
    const summary = {
      overall_sentiment: 'NEUTRAL',
      risk_environment: 'NORMAL',
      key_observations: []
    };

    // Check SPY direction
    if (indicators.SPY && !indicators.SPY.error) {
      if (indicators.SPY.direction === 'UP' && indicators.SPY.strength !== 'WEAK') {
        summary.overall_sentiment = 'BULLISH';
        summary.key_observations.push(`SPY trending ${indicators.SPY.direction.toLowerCase()} (${indicators.SPY.change_percent}%)`);
      } else if (indicators.SPY.direction === 'DOWN' && indicators.SPY.strength !== 'WEAK') {
        summary.overall_sentiment = 'BEARISH';
        summary.key_observations.push(`SPY trending ${indicators.SPY.direction.toLowerCase()} (${indicators.SPY.change_percent}%)`);
      }
    }

    // Check VIX level
    if (indicators.VIX && !indicators.VIX.error) {
      if (indicators.VIX.current_price > 25) {
        summary.risk_environment = 'HIGH_FEAR';
        summary.key_observations.push(`VIX elevated at ${indicators.VIX.current_price} - heightened volatility`);
      } else if (indicators.VIX.current_price < 15) {
        summary.risk_environment = 'COMPLACENT';
        summary.key_observations.push(`VIX low at ${indicators.VIX.current_price} - low volatility/complacency`);
      }
    }

    // Check tech vs broad market divergence
    if (indicators.SPY && indicators.QQQ && !indicators.SPY.error && !indicators.QQQ.error) {
      const divergence = indicators.QQQ.change_percent - indicators.SPY.change_percent;
      if (Math.abs(divergence) > 0.5) {
        if (divergence > 0) {
          summary.key_observations.push(`Tech outperforming (QQQ +${divergence.toFixed(2)}% vs SPY)`);
        } else {
          summary.key_observations.push(`Tech underperforming (QQQ ${divergence.toFixed(2)}% vs SPY)`);
        }
      }
    }

    // Check dollar strength impact
    if (indicators.UUP && !indicators.UUP.error) {
      if (indicators.UUP.direction === 'UP' && indicators.UUP.strength !== 'WEAK') {
        summary.key_observations.push('Strong dollar may pressure equities');
      } else if (indicators.UUP.direction === 'DOWN' && indicators.UUP.strength !== 'WEAK') {
        summary.key_observations.push('Weak dollar supportive for equities');
      }
    }

    // Check bond market signals
    if (indicators.TLT && !indicators.TLT.error) {
      if (indicators.TLT.direction === 'UP' && indicators.TLT.strength === 'STRONG') {
        summary.key_observations.push('Strong bond rally signals risk-off sentiment');
      } else if (indicators.TLT.direction === 'DOWN' && indicators.TLT.strength === 'STRONG') {
        summary.key_observations.push('Bond selloff may indicate rate concerns');
      }
    }

    return summary;
  }

  // ========================================
  // Real-Time Validation System Methods
  // ========================================

  /**
   * Get real-time option snapshot (alias for getQuote with full data)
   * Used by probability calculator and validators
   */
  async getOptionSnapshot(symbol, strike, expiration, optionType) {
    return await this.getQuote(symbol, optionType, strike, expiration);
  }

  /**
   * Get specific option snapshot by option contract ticker
   * Example: O:AAPL250117C00150000
   */
  async getSpecificOptionSnapshot(symbol, optionContract) {
    try {
      const fetchTimestamp = new Date().toISOString();
      const response = await this.client.get(`/v3/snapshot/options/${symbol}/${optionContract}`);

      if (!response.data.results) {
        throw new Error('Option contract not found');
      }

      const results = response.data.results;

      // Add timestamp metadata
      return {
        ...results,
        fetch_timestamp: fetchTimestamp,
        data_timestamp: results.day?.last_updated
          ? new Date(results.day.last_updated / 1000000).toISOString()
          : fetchTimestamp,
        data_age_seconds: results.day?.last_updated
          ? (Date.now() - (results.day.last_updated / 1000000)) / 1000
          : 0
      };
    } catch (error) {
      throw new Error(`Failed to get option snapshot: ${error.message}`);
    }
  }

  /**
   * Get intraday bars for underlying or option
   * @param {string} symbol - Stock ticker
   * @param {number} multiplier - Bar size (1, 5, 15, etc.)
   * @param {string} timespan - 'minute', 'hour', 'day'
   * @param {string} date - Date in YYYY-MM-DD format (default: today)
   * @returns {Array} Array of OHLCV bars
   */
  async getIntradayBars(symbol, multiplier = 5, timespan = 'minute', date = null) {
    try {
      const fetchTimestamp = new Date().toISOString();
      const targetDate = date || new Date().toISOString().split('T')[0];

      const response = await this.client.get(`/v2/aggs/ticker/${symbol}/range/${multiplier}/${timespan}/${targetDate}/${targetDate}`);

      const results = response.data.results || [];

      // Add timestamp to each bar
      return results.map(bar => ({
        ...bar,
        bar_timestamp: new Date(bar.t).toISOString(),
        fetch_timestamp: fetchTimestamp
      }));
    } catch (error) {
      console.error(`Failed to get intraday bars: ${error.message}`);
      return [];
    }
  }

  /**
   * Get historical bars for volatility calculations
   * @param {string} symbol - Stock ticker
   * @param {number} multiplier - Bar size
   * @param {string} timespan - 'day', 'week', 'month'
   * @param {string} from - Start date YYYY-MM-DD
   * @param {string} to - End date YYYY-MM-DD
   * @returns {Array} Array of OHLCV bars
   */
  async getHistoricalBars(symbol, multiplier, timespan, from, to) {
    try {
      const fetchTimestamp = new Date().toISOString();
      const response = await this.client.get(`/v2/aggs/ticker/${symbol}/range/${multiplier}/${timespan}/${from}/${to}`);

      const results = response.data.results || [];

      // Add timestamp to each bar
      return results.map(bar => ({
        ...bar,
        bar_timestamp: new Date(bar.t).toISOString(),
        fetch_timestamp: fetchTimestamp
      }));
    } catch (error) {
      throw new Error(`Failed to get historical bars: ${error.message}`);
    }
  }

  /**
   * Get RSI (Relative Strength Index) indicator
   * @param {string} symbol - Stock ticker
   * @param {number} window - RSI period (default 14)
   * @returns {Object} RSI data with values array
   */
  async getRSI(symbol, window = 14) {
    try {
      const response = await this.client.get(`/v1/indicators/rsi/${symbol}`, {
        params: {
          timespan: 'day',
          adjusted: true,
          window: window,
          series_type: 'close',
          order: 'desc',
          limit: 1
        }
      });

      return response.data.results || null;
    } catch (error) {
      console.error(`Failed to get RSI: ${error.message}`);
      return null;
    }
  }

  /**
   * Get SMA (Simple Moving Average) indicator
   * @param {string} symbol - Stock ticker
   * @param {number} window - SMA period (20, 50, 200, etc.)
   * @returns {Object} SMA data with values array
   */
  async getSMA(symbol, window = 20) {
    try {
      const response = await this.client.get(`/v1/indicators/sma/${symbol}`, {
        params: {
          timespan: 'day',
          adjusted: true,
          window: window,
          series_type: 'close',
          order: 'desc',
          limit: 1
        }
      });

      return response.data.results || null;
    } catch (error) {
      console.error(`Failed to get SMA: ${error.message}`);
      return null;
    }
  }

  /**
   * Get EMA (Exponential Moving Average) indicator
   * @param {string} symbol - Stock ticker
   * @param {number} window - EMA period
   * @returns {Object} EMA data with values array
   */
  async getEMA(symbol, window = 20) {
    try {
      const response = await this.client.get(`/v1/indicators/ema/${symbol}`, {
        params: {
          timespan: 'day',
          adjusted: true,
          window: window,
          series_type: 'close',
          order: 'desc',
          limit: 1
        }
      });

      return response.data.results || null;
    } catch (error) {
      console.error(`Failed to get EMA: ${error.message}`);
      return null;
    }
  }

  /**
   * Get MACD indicator
   * @param {string} symbol - Stock ticker
   * @returns {Object} MACD data
   */
  async getMACD(symbol) {
    try {
      const response = await this.client.get(`/v1/indicators/macd/${symbol}`, {
        params: {
          timespan: 'day',
          adjusted: true,
          short_window: 12,
          long_window: 26,
          signal_window: 9,
          series_type: 'close',
          order: 'desc',
          limit: 1
        }
      });

      return response.data.results || null;
    } catch (error) {
      console.error(`Failed to get MACD: ${error.message}`);
      return null;
    }
  }
}