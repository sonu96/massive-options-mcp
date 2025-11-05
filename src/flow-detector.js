/**
 * Smart Money / Flow Detection Module
 *
 * Detects institutional activity and unusual options flow
 * to identify where "smart money" is positioning.
 */

/**
 * Analyze unusual options activity
 * @param {Array} options - Array of option contracts with volume/OI data
 * @param {object} config - Detection configuration
 * @returns {object} Unusual activity analysis
 */
export function detectUnusualActivity(options = [], config = {}) {
  const {
    volume_multiplier = 3, // Volume must be 3x average to flag
    min_volume = 100, // Minimum absolute volume
    min_premium = 50000, // Minimum $50K premium spent
    oi_ratio_threshold = 2 // Volume/OI ratio threshold
  } = config;

  const unusual = [];

  options.forEach(option => {
    const volume = option.volume || option.day_volume || 0;
    const openInterest = option.open_interest || option.oi || 0;
    const avgVolume = option.avg_volume || (openInterest * 0.1); // Estimate if not provided
    const price = option.last_price || option.mark || 0;

    // Skip if insufficient data
    if (volume === 0 || price === 0) return;

    // Calculate metrics
    const volumeRatio = avgVolume > 0 ? volume / avgVolume : 0;
    const volumeOIRatio = openInterest > 0 ? volume / openInterest : 0;
    const premiumSpent = volume * price * 100; // Contract multiplier

    // Detect unusual activity
    const isUnusual = {
      high_volume: volume >= min_volume && volumeRatio >= volume_multiplier,
      high_premium: premiumSpent >= min_premium,
      high_oi_ratio: volumeOIRatio >= oi_ratio_threshold,
      sweeps: volume > 1000 && volumeOIRatio > 5 // Potential sweep
    };

    if (Object.values(isUnusual).some(v => v)) {
      unusual.push({
        ...option,
        unusual_flags: isUnusual,
        metrics: {
          volume,
          volume_ratio: parseFloat(volumeRatio.toFixed(2)),
          volume_oi_ratio: parseFloat(volumeOIRatio.toFixed(2)),
          premium_spent: parseFloat(premiumSpent.toFixed(0)),
          avg_volume: Math.round(avgVolume)
        },
        signal: analyzeFlowSignal(option, isUnusual, premiumSpent),
        conviction: calculateConviction(isUnusual, premiumSpent, volumeRatio)
      });
    }
  });

  // Sort by conviction (highest first)
  unusual.sort((a, b) => b.conviction - a.conviction);

  return {
    total_analyzed: options.length,
    unusual_detected: unusual.length,
    unusual_contracts: unusual,
    summary: generateFlowSummary(unusual),
    top_3: unusual.slice(0, 3).map(u => ({
      symbol: u.symbol,
      strike: u.strike_price,
      type: u.contract_type,
      signal: u.signal,
      conviction: u.conviction,
      premium: u.metrics.premium_spent
    }))
  };
}

/**
 * Analyze flow signal (bullish/bearish/neutral)
 * @param {object} option - Option contract
 * @param {object} flags - Unusual activity flags
 * @param {number} premiumSpent - Premium spent
 * @returns {object} Flow signal
 */
function analyzeFlowSignal(option, flags, premiumSpent) {
  const isCall = option.contract_type === 'call';
  const isPut = option.contract_type === 'put';

  let direction = 'NEUTRAL';
  let confidence = 'LOW';
  let interpretation = '';

  // High premium spent indicates conviction
  if (premiumSpent > 100000) {
    confidence = 'HIGH';
  } else if (premiumSpent > 50000) {
    confidence = 'MEDIUM';
  }

  // Sweeps indicate urgent buying
  if (flags.sweeps) {
    confidence = 'HIGH';
    if (isCall) {
      direction = 'BULLISH';
      interpretation = 'Aggressive call buying (sweep) - strong bullish bet';
    } else if (isPut) {
      direction = 'BEARISH';
      interpretation = 'Aggressive put buying (sweep) - strong bearish bet';
    }
  } else {
    // Regular unusual activity
    if (isCall && flags.high_volume) {
      direction = 'BULLISH';
      interpretation = 'Heavy call buying - institutions positioning for upside';
    } else if (isPut && flags.high_volume) {
      direction = 'BEARISH';
      interpretation = 'Heavy put buying - institutions hedging or betting downside';
    }
  }

  return {
    direction,
    confidence,
    interpretation
  };
}

/**
 * Calculate conviction score (0-100)
 * @param {object} flags - Unusual flags
 * @param {number} premium - Premium spent
 * @param {number} volumeRatio - Volume ratio vs average
 * @returns {number} Conviction score
 */
function calculateConviction(flags, premium, volumeRatio) {
  let score = 0;

  // Premium weight (40 points max)
  if (premium > 500000) score += 40;
  else if (premium > 250000) score += 30;
  else if (premium > 100000) score += 20;
  else if (premium > 50000) score += 10;

  // Volume ratio weight (30 points max)
  if (volumeRatio > 10) score += 30;
  else if (volumeRatio > 5) score += 20;
  else if (volumeRatio > 3) score += 10;

  // Sweep detection (30 points)
  if (flags.sweeps) score += 30;

  return Math.min(100, score);
}

/**
 * Generate flow summary
 * @param {Array} unusual - Unusual contracts
 * @returns {string} Summary
 */
function generateFlowSummary(unusual) {
  if (unusual.length === 0) {
    return 'No unusual options activity detected';
  }

  const callFlow = unusual.filter(u => u.contract_type === 'call');
  const putFlow = unusual.filter(u => u.contract_type === 'put');

  const totalCallPremium = callFlow.reduce((sum, u) => sum + u.metrics.premium_spent, 0);
  const totalPutPremium = putFlow.reduce((sum, u) => sum + u.metrics.premium_spent, 0);

  const parts = [`Detected ${unusual.length} unusual contracts`];

  if (callFlow.length > 0) {
    parts.push(`${callFlow.length} calls ($${(totalCallPremium / 1000).toFixed(0)}K premium)`);
  }

  if (putFlow.length > 0) {
    parts.push(`${putFlow.length} puts ($${(totalPutPremium / 1000).toFixed(0)}K premium)`);
  }

  // Net sentiment
  if (totalCallPremium > totalPutPremium * 2) {
    parts.push('- Net BULLISH flow');
  } else if (totalPutPremium > totalCallPremium * 2) {
    parts.push('- Net BEARISH flow');
  } else {
    parts.push('- Mixed sentiment');
  }

  return parts.join('. ');
}

/**
 * Detect block trades (large institutional orders)
 * @param {Array} trades - Recent trades data
 * @param {object} config - Detection configuration
 * @returns {Array} Detected block trades
 */
export function detectBlockTrades(trades = [], config = {}) {
  const {
    min_size = 50, // Minimum 50 contracts
    min_premium = 25000 // Minimum $25K
  } = config;

  const blocks = trades.filter(trade => {
    const size = trade.size || trade.volume || 0;
    const price = trade.price || 0;
    const premium = size * price * 100;

    return size >= min_size && premium >= min_premium;
  });

  return blocks.map(trade => ({
    ...trade,
    premium: (trade.size * trade.price * 100).toFixed(0),
    type: trade.size > 100 ? 'LARGE_BLOCK' : 'BLOCK',
    timestamp: trade.timestamp || trade.time
  }));
}

/**
 * Analyze put/call flow imbalance
 * @param {Array} calls - Call options
 * @param {Array} puts - Put options
 * @returns {object} Flow imbalance analysis
 */
export function analyzePutCallFlow(calls = [], puts = []) {
  const callVolume = calls.reduce((sum, c) => sum + (c.volume || 0), 0);
  const putVolume = puts.reduce((sum, p) => sum + (p.volume || 0), 0);

  const callPremium = calls.reduce((sum, c) =>
    sum + ((c.volume || 0) * (c.last_price || c.mark || 0) * 100), 0
  );
  const putPremium = puts.reduce((sum, p) =>
    sum + ((p.volume || 0) * (p.last_price || p.mark || 0) * 100), 0
  );

  const volumeRatio = putVolume > 0 ? callVolume / putVolume : 0;
  const premiumRatio = putPremium > 0 ? callPremium / putPremium : 0;

  let sentiment, interpretation;

  if (premiumRatio > 2) {
    sentiment = 'STRONGLY_BULLISH';
    interpretation = 'Heavy call buying - institutions betting on upside';
  } else if (premiumRatio > 1.2) {
    sentiment = 'BULLISH';
    interpretation = 'More call premium than puts - moderately bullish';
  } else if (premiumRatio < 0.5) {
    sentiment = 'STRONGLY_BEARISH';
    interpretation = 'Heavy put buying - institutions hedging or betting downside';
  } else if (premiumRatio < 0.8) {
    sentiment = 'BEARISH';
    interpretation = 'More put premium than calls - moderately bearish';
  } else {
    sentiment = 'NEUTRAL';
    interpretation = 'Balanced call/put flow - no clear direction';
  }

  return {
    call_volume: callVolume,
    put_volume: putVolume,
    call_premium: parseFloat(callPremium.toFixed(0)),
    put_premium: parseFloat(putPremium.toFixed(0)),
    volume_ratio: parseFloat(volumeRatio.toFixed(2)),
    premium_ratio: parseFloat(premiumRatio.toFixed(2)),
    sentiment,
    interpretation
  };
}

/**
 * Track smart money over time (persistence)
 * @param {Array} historicalFlow - Historical unusual activity
 * @param {number} days - Number of days to analyze
 * @returns {object} Persistence analysis
 */
export function analyzeFlowPersistence(historicalFlow = [], days = 5) {
  if (historicalFlow.length === 0) {
    return {
      persistent_strikes: [],
      summary: 'Insufficient historical data'
    };
  }

  // Group by strike and direction
  const strikeActivity = {};

  historicalFlow.forEach(flow => {
    const key = `${flow.strike_price}_${flow.signal.direction}`;
    if (!strikeActivity[key]) {
      strikeActivity[key] = {
        strike: flow.strike_price,
        direction: flow.signal.direction,
        occurrences: 0,
        total_premium: 0,
        dates: []
      };
    }

    strikeActivity[key].occurrences += 1;
    strikeActivity[key].total_premium += flow.metrics.premium_spent;
    strikeActivity[key].dates.push(flow.date || new Date().toISOString());
  });

  // Find persistent flows (multiple days)
  const persistent = Object.values(strikeActivity)
    .filter(activity => activity.occurrences >= 2)
    .sort((a, b) => b.total_premium - a.total_premium);

  return {
    persistent_strikes: persistent,
    summary: persistent.length > 0 ?
      `Found ${persistent.length} strikes with persistent smart money flow` :
      'No persistent flow patterns detected',
    interpretation: persistent.length > 0 ?
      `${persistent[0].direction} flow concentrated at $${persistent[0].strike} strike` :
      null
  };
}

export default {
  detectUnusualActivity,
  detectBlockTrades,
  analyzePutCallFlow,
  analyzeFlowPersistence
};
