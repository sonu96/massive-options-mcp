/**
 * Options Screener Module
 *
 * Provides functionality to screen options across the market based on various criteria
 * including volume, open interest, Greeks, implied volatility, and liquidity.
 */

import { analyzeOptionLiquidity } from './liquidity-filter.js';

/**
 * Popular symbols for screening (can be overridden by user)
 * Focused on high-volume, liquid options markets
 */
export const DEFAULT_SCREENER_SYMBOLS = [
  // Major ETFs
  'SPY', 'QQQ', 'IWM', 'DIA', 'VXX', 'GLD', 'SLV', 'TLT', 'EEM', 'XLE',

  // Mega Cap Tech
  'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'NVDA', 'TSLA', 'AMD', 'NFLX', 'CRM',

  // Large Cap Tech
  'INTC', 'ORCL', 'CSCO', 'ADBE', 'AVGO', 'TXN', 'QCOM', 'NOW', 'AMAT', 'MU',

  // Finance
  'JPM', 'BAC', 'WFC', 'GS', 'MS', 'C', 'BLK', 'SCHW',

  // Healthcare
  'JNJ', 'UNH', 'PFE', 'ABBV', 'LLY', 'TMO', 'ABT', 'MRK',

  // Consumer/Retail
  'WMT', 'HD', 'MCD', 'NKE', 'SBUX', 'TGT', 'COST', 'LOW',

  // Energy
  'XOM', 'CVX', 'COP', 'SLB', 'EOG',

  // Other High Volume
  'BA', 'DIS', 'V', 'MA', 'PYPL', 'SQ', 'COIN', 'UBER', 'ABNB', 'SHOP'
];

/**
 * Cache for option chain data
 * Structure: { symbol: { data: [...], timestamp: Date } }
 */
const optionChainCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Clear expired cache entries
 */
function cleanCache() {
  const now = Date.now();
  for (const [symbol, cached] of optionChainCache.entries()) {
    if (now - cached.timestamp > CACHE_TTL_MS) {
      optionChainCache.delete(symbol);
    }
  }
}

/**
 * Get cached option chain or return null if expired/missing
 */
export function getCachedChain(symbol) {
  cleanCache();
  const cached = optionChainCache.get(symbol);
  if (!cached) return null;

  const age = Date.now() - cached.timestamp;
  if (age > CACHE_TTL_MS) {
    optionChainCache.delete(symbol);
    return null;
  }

  return cached.data;
}

/**
 * Cache option chain data
 */
export function setCachedChain(symbol, data) {
  optionChainCache.set(symbol, {
    data,
    timestamp: Date.now()
  });
}

/**
 * Clear all cached data
 */
export function clearCache() {
  optionChainCache.clear();
}

/**
 * Calculate days to expiration from expiration date string
 */
function getDaysToExpiration(expirationDate) {
  const expiry = new Date(expirationDate);
  const now = new Date();
  const diffTime = expiry - now;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
}

/**
 * Determine moneyness category
 */
function getMoneynessCategory(option, underlyingPrice) {
  if (!option.details?.strike_price || !underlyingPrice) return 'unknown';

  const strike = option.details.strike_price;
  const isCall = option.details.contract_type === 'call';

  // For calls: ITM if stock > strike, OTM if stock < strike
  // For puts: ITM if stock < strike, OTM if stock > strike
  const percentDiff = Math.abs((strike - underlyingPrice) / underlyingPrice);

  if (isCall) {
    if (underlyingPrice > strike * 1.01) return 'ITM';
    if (underlyingPrice < strike * 0.99) return 'OTM';
    return 'ATM';
  } else {
    if (underlyingPrice < strike * 0.99) return 'ITM';
    if (underlyingPrice > strike * 1.01) return 'OTM';
    return 'ATM';
  }
}

/**
 * Apply screener filters to an array of options
 *
 * @param {Array} options - Array of option objects with quotes, Greeks, etc.
 * @param {Object} criteria - Filtering criteria
 * @returns {Array} Filtered options
 */
export function applyScreenerFilters(options, criteria) {
  return options.filter(option => {
    // Volume filter
    if (criteria.min_volume !== undefined) {
      const volume = option.day?.volume || option.session?.volume || 0;
      if (volume < criteria.min_volume) return false;
    }

    if (criteria.max_volume !== undefined) {
      const volume = option.day?.volume || option.session?.volume || 0;
      if (volume > criteria.max_volume) return false;
    }

    // Open Interest filter
    if (criteria.min_open_interest !== undefined) {
      const oi = option.open_interest || 0;
      if (oi < criteria.min_open_interest) return false;
    }

    // Delta filter
    if (criteria.min_delta !== undefined && option.greeks?.delta !== undefined) {
      // Handle both calls (positive delta) and puts (negative delta)
      const absDelta = Math.abs(option.greeks.delta);
      const absMinDelta = Math.abs(criteria.min_delta);
      if (absDelta < absMinDelta) return false;
    }

    if (criteria.max_delta !== undefined && option.greeks?.delta !== undefined) {
      const absDelta = Math.abs(option.greeks.delta);
      const absMaxDelta = Math.abs(criteria.max_delta);
      if (absDelta > absMaxDelta) return false;
    }

    // Implied Volatility filter
    if (criteria.min_iv !== undefined && option.implied_volatility !== undefined) {
      if (option.implied_volatility < criteria.min_iv) return false;
    }

    if (criteria.max_iv !== undefined && option.implied_volatility !== undefined) {
      if (option.implied_volatility > criteria.max_iv) return false;
    }

    // Price filter (option premium)
    if (criteria.min_price !== undefined) {
      const price = option.last_quote?.midpoint || option.last_quote?.last || 0;
      if (price < criteria.min_price) return false;
    }

    if (criteria.max_price !== undefined) {
      const price = option.last_quote?.midpoint || option.last_quote?.last || 0;
      if (price > criteria.max_price) return false;
    }

    // Option Type filter
    if (criteria.option_type && criteria.option_type !== 'both') {
      if (option.details?.contract_type !== criteria.option_type) return false;
    }

    // Days to Expiration filter
    if (criteria.min_days_to_expiration !== undefined || criteria.max_days_to_expiration !== undefined) {
      const expirationDate = option.details?.expiration_date;
      if (!expirationDate) return false;

      const dte = getDaysToExpiration(expirationDate);

      if (criteria.min_days_to_expiration !== undefined && dte < criteria.min_days_to_expiration) {
        return false;
      }

      if (criteria.max_days_to_expiration !== undefined && dte > criteria.max_days_to_expiration) {
        return false;
      }
    }

    // Moneyness filter
    if (criteria.moneyness && criteria.moneyness !== 'all') {
      const underlyingPrice = option.underlying_asset?.price;
      if (!underlyingPrice) return false;

      const moneyness = getMoneynessCategory(option, underlyingPrice);
      if (moneyness !== criteria.moneyness) return false;
    }

    // Liquidity Quality filter
    if (criteria.liquidity_quality) {
      const liquidity = analyzeOptionLiquidity(option);
      if (!liquidity || liquidity.quality !== criteria.liquidity_quality) {
        // Allow EXCELLENT to match GOOD if strict, or adjust hierarchy
        const qualityRank = { 'EXCELLENT': 3, 'GOOD': 2, 'FAIR': 1, 'POOR': 0 };
        const requiredRank = qualityRank[criteria.liquidity_quality] || 0;
        const actualRank = qualityRank[liquidity?.quality] || 0;

        if (actualRank < requiredRank) return false;
      }
    }

    return true;
  });
}

/**
 * Rank and sort screener results
 *
 * @param {Array} options - Filtered options
 * @param {String} sortBy - Sort criterion
 * @returns {Array} Sorted options
 */
export function rankScreenerResults(options, sortBy = 'volume') {
  const sortFunctions = {
    volume: (a, b) => {
      const volA = a.day?.volume || a.session?.volume || 0;
      const volB = b.day?.volume || b.session?.volume || 0;
      return volB - volA; // Descending
    },

    open_interest: (a, b) => {
      return (b.open_interest || 0) - (a.open_interest || 0);
    },

    iv: (a, b) => {
      return (b.implied_volatility || 0) - (a.implied_volatility || 0);
    },

    delta: (a, b) => {
      const deltaA = Math.abs(a.greeks?.delta || 0);
      const deltaB = Math.abs(b.greeks?.delta || 0);
      return deltaB - deltaA;
    },

    price: (a, b) => {
      const priceA = a.last_quote?.midpoint || a.last_quote?.last || 0;
      const priceB = b.last_quote?.midpoint || b.last_quote?.last || 0;
      return priceB - priceA;
    },

    liquidity_score: (a, b) => {
      const liqA = analyzeOptionLiquidity(a);
      const liqB = analyzeOptionLiquidity(b);
      return (liqB?.score || 0) - (liqA?.score || 0);
    }
  };

  const sortFn = sortFunctions[sortBy] || sortFunctions.volume;
  return [...options].sort(sortFn);
}

/**
 * Format screener output for display
 *
 * @param {Array} options - Options to format
 * @param {Number} limit - Maximum number of results
 * @returns {Array} Formatted results
 */
export function formatScreenerOutput(options, limit = 50) {
  return options.slice(0, limit).map(option => {
    const liquidity = analyzeOptionLiquidity(option);
    const expirationDate = option.details?.expiration_date;
    const dte = expirationDate ? getDaysToExpiration(expirationDate) : null;
    const underlyingPrice = option.underlying_asset?.price;
    const moneyness = underlyingPrice ? getMoneynessCategory(option, underlyingPrice) : 'unknown';

    return {
      // Basic Info
      ticker: option.ticker,
      underlying_symbol: option.underlying_asset?.ticker || option.ticker?.split(':')[1]?.slice(0, -15),
      contract_type: option.details?.contract_type,
      strike: option.details?.strike_price,
      expiration: expirationDate,
      days_to_expiration: dte,
      moneyness,

      // Pricing
      bid: option.last_quote?.bid,
      ask: option.last_quote?.ask,
      last: option.last_quote?.last || option.last_trade?.price,
      midpoint: option.last_quote?.midpoint,

      // Volume & Interest
      volume: option.day?.volume || option.session?.volume,
      open_interest: option.open_interest,

      // Greeks
      delta: option.greeks?.delta,
      gamma: option.greeks?.gamma,
      theta: option.greeks?.theta,
      vega: option.greeks?.vega,

      // Volatility
      implied_volatility: option.implied_volatility,

      // Underlying
      underlying_price: underlyingPrice,
      break_even_price: option.break_even_price,

      // Liquidity Assessment
      liquidity_quality: liquidity?.quality,
      liquidity_score: liquidity?.score,
      bid_ask_spread: liquidity?.bid_ask_spread,
      bid_ask_spread_percent: liquidity?.bid_ask_spread_percent,

      // Additional Context
      change_percent: option.day?.change_percent || option.session?.change_percent,
      vwap: option.day?.vwap
    };
  });
}

/**
 * Get default symbols list or validate user-provided list
 */
export function getSymbolsList(userSymbols) {
  if (!userSymbols || !Array.isArray(userSymbols) || userSymbols.length === 0) {
    return DEFAULT_SCREENER_SYMBOLS;
  }

  // Validate and uppercase user symbols
  return userSymbols
    .filter(s => typeof s === 'string' && s.trim().length > 0)
    .map(s => s.trim().toUpperCase());
}
