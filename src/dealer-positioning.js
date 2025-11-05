// Dealer positioning analysis module
// Calculates dealer gamma exposure (GEX) and vega exposure (VEX) matrices

/**
 * Calculate dealer gamma exposure for a single option
 * @param {Object} option - Option data with greeks and OI
 * @param {number} spotPrice - Current underlying price
 * @param {string} optionType - 'call' or 'put'
 * @returns {number} Dealer GEX value
 */
export function calculateDealerGEX(option, spotPrice, optionType) {
  const gamma = option.greeks?.gamma || 0;
  const oi = option.price?.open_interest || 0;

  if (gamma === 0 || oi === 0) return 0;

  // Dealer GEX calculation
  // Assumption: Dealers are net short options (selling to retail)
  // For calls: dealers short calls = negative gamma
  // For puts: dealers short puts = positive gamma (puts have negative gamma)

  const contractMultiplier = 100;
  const gexScaling = 0.01; // Convert to dollars

  if (optionType === 'call') {
    // Dealers short calls = negative gamma for dealers
    return -1 * gamma * oi * contractMultiplier * spotPrice * spotPrice * gexScaling;
  } else {
    // Dealers short puts = positive gamma for dealers (because put gamma is negative)
    // Put gamma is already negative, so -(-gamma) = positive
    return gamma * oi * contractMultiplier * spotPrice * spotPrice * gexScaling;
  }
}

/**
 * Calculate dealer vega exposure for a single option
 * @param {Object} option - Option data with greeks and OI
 * @param {string} optionType - 'call' or 'put'
 * @returns {number} Dealer VEX value
 */
export function calculateDealerVEX(option, optionType) {
  const vega = option.greeks?.vega || 0;
  const oi = option.price?.open_interest || 0;

  if (vega === 0 || oi === 0) return 0;

  const contractMultiplier = 100;

  // Dealers short options = negative vega exposure
  return -1 * vega * oi * contractMultiplier;
}

/**
 * Generate dealer positioning matrix across strikes and expirations
 * @param {Object} chainData - Option chain data organized by expiration
 * @param {number} spotPrice - Current underlying price
 * @param {Object} options - Configuration options
 * @returns {Object} Dealer positioning matrix with GEX and VEX
 */
export function generateDealerMatrix(chainData, spotPrice, options = {}) {
  const {
    strikeMin = null,
    strikeMax = null,
    includeVEX = false
  } = options;

  const gexMatrix = {};
  const vexMatrix = {};
  const strikeSet = new Set();

  // Process each expiration
  Object.keys(chainData).forEach(expiration => {
    const expData = chainData[expiration];
    gexMatrix[expiration] = {};
    if (includeVEX) vexMatrix[expiration] = {};

    // Process calls
    expData.calls?.forEach(call => {
      const strike = call.strike;

      // Filter by strike range if specified
      if (strikeMin !== null && strike < strikeMin) return;
      if (strikeMax !== null && strike > strikeMax) return;

      strikeSet.add(strike);

      const gex = calculateDealerGEX(call, spotPrice, 'call');
      gexMatrix[expiration][strike] = (gexMatrix[expiration][strike] || 0) + gex;

      if (includeVEX) {
        const vex = calculateDealerVEX(call, 'call');
        vexMatrix[expiration][strike] = (vexMatrix[expiration][strike] || 0) + vex;
      }
    });

    // Process puts
    expData.puts?.forEach(put => {
      const strike = put.strike;

      // Filter by strike range if specified
      if (strikeMin !== null && strike < strikeMin) return;
      if (strikeMax !== null && strike > strikeMax) return;

      strikeSet.add(strike);

      const gex = calculateDealerGEX(put, spotPrice, 'put');
      gexMatrix[expiration][strike] = (gexMatrix[expiration][strike] || 0) + gex;

      if (includeVEX) {
        const vex = calculateDealerVEX(put, 'put');
        vexMatrix[expiration][strike] = (vexMatrix[expiration][strike] || 0) + vex;
      }
    });
  });

  return {
    gexMatrix,
    vexMatrix: includeVEX ? vexMatrix : null,
    strikes: Array.from(strikeSet).sort((a, b) => a - b)
  };
}

/**
 * Identify key levels from GEX matrix
 * @param {Object} gexMatrix - GEX values by expiration and strike
 * @param {Array} strikes - All strikes in the matrix
 * @param {number} spotPrice - Current underlying price
 * @returns {Object} Key levels and interpretations
 */
export function identifyKeyLevels(gexMatrix, strikes, spotPrice) {
  let maxPositiveGEX = { value: -Infinity, strike: null, expiration: null };
  let maxNegativeGEX = { value: Infinity, strike: null, expiration: null };
  let totalGEX = 0;
  const allValues = [];

  // Find max positive and negative GEX across all strikes/expirations
  Object.entries(gexMatrix).forEach(([expiration, strikes]) => {
    Object.entries(strikes).forEach(([strike, gex]) => {
      const strikeNum = parseFloat(strike);
      totalGEX += gex;
      allValues.push({ strike: strikeNum, expiration, gex });

      if (gex > maxPositiveGEX.value) {
        maxPositiveGEX = { value: gex, strike: strikeNum, expiration };
      }

      if (gex < maxNegativeGEX.value) {
        maxNegativeGEX = { value: gex, strike: strikeNum, expiration };
      }
    });
  });

  // Find zero gamma strike (flip point)
  let zeroGammaStrike = null;
  let minAbsGEX = Infinity;

  // Aggregate GEX by strike across all expirations
  const gexByStrike = {};
  allValues.forEach(({ strike, gex }) => {
    gexByStrike[strike] = (gexByStrike[strike] || 0) + gex;
  });

  Object.entries(gexByStrike).forEach(([strike, gex]) => {
    if (Math.abs(gex) < minAbsGEX) {
      minAbsGEX = Math.abs(gex);
      zeroGammaStrike = parseFloat(strike);
    }
  });

  // Determine gamma regime
  let regime;
  if (totalGEX > 1000000) {
    regime = 'Positive Gamma - Dealers long gamma, will dampen volatility';
  } else if (totalGEX < -1000000) {
    regime = 'Negative Gamma - Dealers short gamma, will amplify moves';
  } else {
    regime = 'Mixed Gamma - Check individual strike levels';
  }

  // Find support and resistance levels
  const supportLevels = allValues
    .filter(v => v.gex < -5000000 && v.strike < spotPrice)
    .sort((a, b) => a.gex - b.gex)
    .slice(0, 3)
    .map(v => v.strike);

  const resistanceLevels = allValues
    .filter(v => v.gex > 5000000 && v.strike > spotPrice)
    .sort((a, b) => b.gex - a.gex)
    .slice(0, 3)
    .map(v => v.strike);

  // Find magnet levels (high positive GEX near current price)
  const magnetLevels = allValues
    .filter(v => v.gex > 10000000 && Math.abs(v.strike - spotPrice) / spotPrice < 0.05)
    .sort((a, b) => b.gex - a.gex)
    .slice(0, 3)
    .map(v => ({ strike: v.strike, gex: v.gex, expiration: v.expiration }));

  return {
    maxPositiveGEX,
    maxNegativeGEX,
    zeroGammaStrike,
    totalGEX,
    regime,
    supportLevels,
    resistanceLevels,
    magnetLevels,
    gexByStrike
  };
}

/**
 * Generate expiration-level summaries
 * @param {Object} gexMatrix - GEX matrix
 * @param {Object} chainData - Original chain data
 * @param {number} spotPrice - Current price
 * @returns {Object} Summary for each expiration
 */
export function generateExpirationSummaries(gexMatrix, chainData, spotPrice) {
  const summaries = {};

  Object.keys(gexMatrix).forEach(expiration => {
    const strikes = gexMatrix[expiration];
    let totalGEX = 0;
    let callGEX = 0;
    let putGEX = 0;

    // Calculate totals for this expiration
    const expData = chainData[expiration];

    expData.calls?.forEach(call => {
      const gex = calculateDealerGEX(call, spotPrice, 'call');
      callGEX += gex;
      totalGEX += gex;
    });

    expData.puts?.forEach(put => {
      const gex = calculateDealerGEX(put, spotPrice, 'put');
      putGEX += gex;
      totalGEX += gex;
    });

    // Determine regime for this expiration
    let regime, interpretation;
    if (totalGEX > 1000000) {
      regime = 'Positive';
      interpretation = 'Dealers long gamma - expect range-bound price action and volatility suppression';
    } else if (totalGEX < -1000000) {
      regime = 'Negative';
      interpretation = 'Dealers short gamma - expect trending moves and volatility expansion';
    } else {
      regime = 'Neutral';
      interpretation = 'Balanced gamma - no strong dealer hedging pressure';
    }

    summaries[expiration] = {
      totalGEX: parseFloat(totalGEX.toFixed(2)),
      callGEX: parseFloat(callGEX.toFixed(2)),
      putGEX: parseFloat(putGEX.toFixed(2)),
      regime,
      interpretation
    };
  });

  return summaries;
}

/**
 * Generate trading implications from dealer positioning
 * @param {Object} keyLevels - Identified key levels
 * @param {number} spotPrice - Current price
 * @returns {Object} Trading implications and recommendations
 */
export function generateTradingImplications(keyLevels, spotPrice) {
  const implications = {
    support_levels: keyLevels.supportLevels,
    resistance_levels: keyLevels.resistanceLevels,
    magnet_levels: keyLevels.magnetLevels.map(m => m.strike),
    gamma_regime: keyLevels.regime,
    zero_gamma_strike: keyLevels.zeroGammaStrike
  };

  // Determine expected range
  const nearestSupport = keyLevels.supportLevels[0];
  const nearestResistance = keyLevels.resistanceLevels[0];

  if (nearestSupport && nearestResistance) {
    implications.expected_range = {
      low: nearestSupport,
      high: nearestResistance,
      current: spotPrice
    };
  }

  // Gamma squeeze risk
  const distanceToMaxNegGEX = keyLevels.maxNegativeGEX.strike ?
    Math.abs(spotPrice - keyLevels.maxNegativeGEX.strike) / spotPrice : 1;

  if (distanceToMaxNegGEX < 0.03) {
    implications.gamma_squeeze_risk = 'HIGH - Price very close to large negative GEX zone';
  } else if (distanceToMaxNegGEX < 0.05) {
    implications.gamma_squeeze_risk = 'MODERATE - Watch for breaks toward negative GEX levels';
  } else {
    implications.gamma_squeeze_risk = 'LOW - Price well away from negative GEX zones';
  }

  // Strategy recommendations
  implications.strategy_recommendations = [];

  if (keyLevels.totalGEX > 5000000) {
    implications.strategy_recommendations.push({
      type: 'Premium Selling',
      reason: 'High positive GEX suggests range-bound action',
      strategies: ['Iron Condor', 'Credit Spreads', 'Covered Calls']
    });
  }

  if (keyLevels.totalGEX < -5000000) {
    implications.strategy_recommendations.push({
      type: 'Directional',
      reason: 'Negative GEX suggests trending behavior',
      strategies: ['Debit Spreads', 'Long Options', 'Butterflies']
    });
  }

  if (keyLevels.magnetLevels.length > 0) {
    implications.strategy_recommendations.push({
      type: 'Mean Reversion',
      reason: `Strong magnet at ${keyLevels.magnetLevels[0].strike}`,
      strategies: ['Sell premium around magnet levels', 'Calendar spreads']
    });
  }

  // Volatility outlook
  if (keyLevels.totalGEX > 0) {
    implications.volatility_outlook = 'SUPPRESSED - Dealers hedging dampens moves';
  } else {
    implications.volatility_outlook = 'ELEVATED - Dealer hedging amplifies moves';
  }

  return implications;
}

/**
 * Format matrix for display (convert to structured format)
 * @param {Object} gexMatrix - Raw GEX matrix
 * @param {Array} strikes - All strikes
 * @returns {Array} Formatted matrix rows
 */
export function formatMatrixForDisplay(gexMatrix, strikes) {
  const expirations = Object.keys(gexMatrix).sort();
  const rows = [];

  strikes.forEach(strike => {
    const row = {
      strike: strike,
      values: {}
    };

    expirations.forEach(exp => {
      const value = gexMatrix[exp][strike] || 0;
      row.values[exp] = parseFloat(value.toFixed(2));
    });

    rows.push(row);
  });

  return rows;
}
