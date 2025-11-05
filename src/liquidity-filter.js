/**
 * Liquidity Filtering Module
 *
 * Filters options based on liquidity metrics to ensure tradeable markets.
 * Prevents recommending illiquid options with wide spreads that result in poor fills.
 */

import { analyzeBidAskSpread } from './transaction-costs.js';

/**
 * Liquidity quality thresholds
 */
export const LIQUIDITY_THRESHOLDS = {
  EXCELLENT: {
    max_spread_pct: 3,
    min_volume: 500,
    min_open_interest: 1000,
    label: 'EXCELLENT',
    description: 'Very tight spread - ideal for trading'
  },
  GOOD: {
    max_spread_pct: 7,
    min_volume: 100,
    min_open_interest: 500,
    label: 'GOOD',
    description: 'Acceptable spread - tradeable with limit orders'
  },
  FAIR: {
    max_spread_pct: 15,
    min_volume: 50,
    min_open_interest: 200,
    label: 'FAIR',
    description: 'Wide spread - use limit orders, expect slippage'
  },
  POOR: {
    max_spread_pct: Infinity,
    min_volume: 0,
    min_open_interest: 0,
    label: 'POOR',
    description: 'Very wide spread - avoid if possible'
  }
};

/**
 * Analyze option liquidity
 * @param {object} option - Option data with bid, ask, volume, open_interest
 * @param {object} config - Liquidity configuration (optional)
 * @returns {object} Liquidity analysis
 */
export function analyzeOptionLiquidity(option, config = {}) {
  const {
    min_liquidity_score = 50, // 0-100 scale
    require_volume = true,
    require_open_interest = true
  } = config;

  // Extract data
  const bid = option.bid || option.bid_price || 0;
  const ask = option.ask || option.ask_price || 0;
  const volume = option.volume || option.day_volume || 0;
  const openInterest = option.open_interest || option.oi || 0;

  // Handle case where bid/ask are missing
  if (bid === 0 || ask === 0) {
    return {
      tradeable: false,
      liquidity_score: 0,
      quality: 'POOR',
      reason: 'No bid/ask quotes available',
      warnings: ['No market - cannot trade this option'],
      bid,
      ask,
      volume,
      open_interest: openInterest
    };
  }

  // Analyze bid-ask spread
  const spreadAnalysis = analyzeBidAskSpread(bid, ask);

  // Determine quality tier
  let quality, thresholds;
  if (spreadAnalysis.spread_pct < LIQUIDITY_THRESHOLDS.EXCELLENT.max_spread_pct &&
      volume >= LIQUIDITY_THRESHOLDS.EXCELLENT.min_volume &&
      openInterest >= LIQUIDITY_THRESHOLDS.EXCELLENT.min_open_interest) {
    quality = 'EXCELLENT';
    thresholds = LIQUIDITY_THRESHOLDS.EXCELLENT;
  } else if (spreadAnalysis.spread_pct < LIQUIDITY_THRESHOLDS.GOOD.max_spread_pct &&
             volume >= LIQUIDITY_THRESHOLDS.GOOD.min_volume &&
             openInterest >= LIQUIDITY_THRESHOLDS.GOOD.min_open_interest) {
    quality = 'GOOD';
    thresholds = LIQUIDITY_THRESHOLDS.GOOD;
  } else if (spreadAnalysis.spread_pct < LIQUIDITY_THRESHOLDS.FAIR.max_spread_pct &&
             volume >= LIQUIDITY_THRESHOLDS.FAIR.min_volume &&
             openInterest >= LIQUIDITY_THRESHOLDS.FAIR.min_open_interest) {
    quality = 'FAIR';
    thresholds = LIQUIDITY_THRESHOLDS.FAIR;
  } else {
    quality = 'POOR';
    thresholds = LIQUIDITY_THRESHOLDS.POOR;
  }

  // Calculate liquidity score (0-100)
  let liquidityScore = 0;

  // Spread component (40 points max)
  if (spreadAnalysis.spread_pct < 3) {
    liquidityScore += 40;
  } else if (spreadAnalysis.spread_pct < 7) {
    liquidityScore += 30;
  } else if (spreadAnalysis.spread_pct < 15) {
    liquidityScore += 20;
  } else {
    liquidityScore += 10;
  }

  // Volume component (30 points max)
  if (volume >= 500) {
    liquidityScore += 30;
  } else if (volume >= 100) {
    liquidityScore += 20;
  } else if (volume >= 50) {
    liquidityScore += 10;
  } else if (volume >= 10) {
    liquidityScore += 5;
  }

  // Open interest component (30 points max)
  if (openInterest >= 1000) {
    liquidityScore += 30;
  } else if (openInterest >= 500) {
    liquidityScore += 20;
  } else if (openInterest >= 200) {
    liquidityScore += 10;
  } else if (openInterest >= 50) {
    liquidityScore += 5;
  }

  // Generate warnings
  const warnings = [];
  if (spreadAnalysis.spread_pct > 10) {
    warnings.push(`Wide bid-ask spread (${spreadAnalysis.spread_pct.toFixed(1)}%) - expect slippage`);
  }
  if (volume < 50) {
    warnings.push(`Low volume (${volume}) - may be difficult to fill large orders`);
  }
  if (openInterest < 200) {
    warnings.push(`Low open interest (${openInterest}) - limited market depth`);
  }

  // Determine if tradeable
  const tradeable = liquidityScore >= min_liquidity_score &&
                    spreadAnalysis.tradeable &&
                    (!require_volume || volume > 0) &&
                    (!require_open_interest || openInterest > 0);

  return {
    tradeable,
    liquidity_score: Math.round(liquidityScore),
    quality,
    description: thresholds.description,

    // Detailed metrics
    bid,
    ask,
    mid: spreadAnalysis.mid,
    spread: spreadAnalysis.spread,
    spread_pct: spreadAnalysis.spread_pct,
    volume,
    open_interest: openInterest,

    // Volume/OI analysis
    volume_oi_ratio: openInterest > 0 ? parseFloat((volume / openInterest).toFixed(3)) : 0,
    volume_oi_interpretation: openInterest > 0 && volume > openInterest ?
      'High volume relative to OI - unusual activity' :
      'Normal volume',

    warnings,
    recommendation: tradeable ?
      spreadAnalysis.recommendation :
      'Avoid - insufficient liquidity',

    // Thresholds used
    thresholds_met: {
      spread: spreadAnalysis.spread_pct <= thresholds.max_spread_pct,
      volume: volume >= thresholds.min_volume,
      open_interest: openInterest >= thresholds.min_open_interest
    }
  };
}

/**
 * Filter array of options by liquidity
 * @param {Array} options - Array of option objects
 * @param {object} config - Filter configuration
 * @returns {object} Filtered options and statistics
 */
export function filterOptionsByLiquidity(options = [], config = {}) {
  const {
    min_quality = 'FAIR', // EXCELLENT, GOOD, FAIR
    min_liquidity_score = 50,
    return_rejected = false
  } = config;

  const qualityOrder = { EXCELLENT: 3, GOOD: 2, FAIR: 1, POOR: 0 };
  const minQualityLevel = qualityOrder[min_quality] || 1;

  const filtered = [];
  const rejected = [];
  const statistics = {
    total_analyzed: options.length,
    passed: 0,
    rejected_count: 0,
    rejection_reasons: {}
  };

  options.forEach(option => {
    const liquidityAnalysis = analyzeOptionLiquidity(option, config);

    // Add liquidity analysis to option
    const enhancedOption = {
      ...option,
      liquidity: liquidityAnalysis
    };

    if (liquidityAnalysis.tradeable &&
        qualityOrder[liquidityAnalysis.quality] >= minQualityLevel &&
        liquidityAnalysis.liquidity_score >= min_liquidity_score) {
      filtered.push(enhancedOption);
      statistics.passed++;
    } else {
      rejected.push({
        ...enhancedOption,
        rejection_reason: !liquidityAnalysis.tradeable ? 'Not tradeable' :
                         qualityOrder[liquidityAnalysis.quality] < minQualityLevel ? `Quality ${liquidityAnalysis.quality} below ${min_quality}` :
                         `Liquidity score ${liquidityAnalysis.liquidity_score} below ${min_liquidity_score}`
      });
      statistics.rejected_count++;

      // Track rejection reasons
      const reason = rejected[rejected.length - 1].rejection_reason;
      statistics.rejection_reasons[reason] = (statistics.rejection_reasons[reason] || 0) + 1;
    }
  });

  // Sort filtered options by liquidity score (best first)
  filtered.sort((a, b) => b.liquidity.liquidity_score - a.liquidity.liquidity_score);

  return {
    filtered_options: filtered,
    rejected_options: return_rejected ? rejected : undefined,
    statistics: {
      ...statistics,
      pass_rate: options.length > 0 ?
        parseFloat(((statistics.passed / options.length) * 100).toFixed(1)) : 0,
      avg_liquidity_score_passed: filtered.length > 0 ?
        Math.round(filtered.reduce((sum, opt) => sum + opt.liquidity.liquidity_score, 0) / filtered.length) : 0
    },
    summary: `${statistics.passed} of ${options.length} options passed liquidity filter (${statistics.pass_rate}%)`
  };
}

/**
 * Assess overall market depth for a symbol
 * @param {Array} optionChain - Full option chain for a symbol
 * @returns {object} Market depth analysis
 */
export function assessMarketDepth(optionChain = []) {
  if (!optionChain || optionChain.length === 0) {
    return {
      total_contracts: 0,
      tradeable_contracts: 0,
      market_depth: 'POOR',
      recommendation: 'Insufficient data'
    };
  }

  const liquidityResults = filterOptionsByLiquidity(optionChain, {
    min_quality: 'FAIR',
    min_liquidity_score: 40
  });

  const tradeableCount = liquidityResults.filtered_options.length;
  const totalCount = optionChain.length;
  const tradeablePct = (tradeableCount / totalCount) * 100;

  // Calculate average metrics for tradeable options
  const avgMetrics = {
    volume: 0,
    open_interest: 0,
    spread_pct: 0
  };

  if (tradeableCount > 0) {
    liquidityResults.filtered_options.forEach(opt => {
      avgMetrics.volume += opt.volume || 0;
      avgMetrics.open_interest += opt.open_interest || 0;
      avgMetrics.spread_pct += opt.liquidity.spread_pct || 0;
    });

    avgMetrics.volume = Math.round(avgMetrics.volume / tradeableCount);
    avgMetrics.open_interest = Math.round(avgMetrics.open_interest / tradeableCount);
    avgMetrics.spread_pct = parseFloat((avgMetrics.spread_pct / tradeableCount).toFixed(2));
  }

  // Determine overall market depth
  let marketDepth, recommendation;
  if (tradeablePct >= 70 && avgMetrics.volume >= 200 && avgMetrics.spread_pct < 5) {
    marketDepth = 'EXCELLENT';
    recommendation = 'Very liquid market - easy to enter/exit positions';
  } else if (tradeablePct >= 50 && avgMetrics.volume >= 100) {
    marketDepth = 'GOOD';
    recommendation = 'Good liquidity - use limit orders for best fills';
  } else if (tradeablePct >= 30) {
    marketDepth = 'FAIR';
    recommendation = 'Moderate liquidity - carefully select strikes';
  } else {
    marketDepth = 'POOR';
    recommendation = 'Poor liquidity - consider more liquid alternatives';
  }

  return {
    total_contracts: totalCount,
    tradeable_contracts: tradeableCount,
    tradeable_pct: parseFloat(tradeablePct.toFixed(1)),
    market_depth: marketDepth,
    avg_metrics: avgMetrics,
    quality_distribution: {
      excellent: liquidityResults.filtered_options.filter(o => o.liquidity.quality === 'EXCELLENT').length,
      good: liquidityResults.filtered_options.filter(o => o.liquidity.quality === 'GOOD').length,
      fair: liquidityResults.filtered_options.filter(o => o.liquidity.quality === 'FAIR').length
    },
    recommendation
  };
}

export default {
  LIQUIDITY_THRESHOLDS,
  analyzeOptionLiquidity,
  filterOptionsByLiquidity,
  assessMarketDepth
};
