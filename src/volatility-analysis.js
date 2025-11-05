// Volatility analysis module
// Provides advanced volatility analytics for options trading

/**
 * Calculate volatility smile/skew metrics
 * @param {Array} strikes - Array of strike prices
 * @param {Array} ivs - Array of implied volatilities (corresponding to strikes)
 * @param {number} atmStrike - At-the-money strike price
 * @returns {Object} Volatility smile metrics
 */
export function analyzeVolatilitySmile(strikes, ivs, atmStrike) {
  if (strikes.length !== ivs.length || strikes.length < 3) {
    throw new Error('Invalid data: need at least 3 strike/IV pairs');
  }
  
  // Find ATM IV
  const atmIndex = strikes.reduce((closest, strike, i) => 
    Math.abs(strike - atmStrike) < Math.abs(strikes[closest] - atmStrike) ? i : closest, 0);
  const atmIV = ivs[atmIndex];
  
  // Separate OTM puts and calls
  const putData = [];
  const callData = [];
  
  strikes.forEach((strike, i) => {
    if (strike < atmStrike) {
      putData.push({ strike, iv: ivs[i], moneyness: strike / atmStrike });
    } else if (strike > atmStrike) {
      callData.push({ strike, iv: ivs[i], moneyness: strike / atmStrike });
    }
  });
  
  // Calculate skew (difference between 25-delta put and call IVs)
  const skew25Delta = calculateSkewAtDelta(putData, callData, 0.25);
  const skew10Delta = calculateSkewAtDelta(putData, callData, 0.10);
  
  // Calculate smile steepness
  const smileSteepness = calculateSmileSteepness(strikes, ivs, atmStrike);
  
  // Detect smile pattern
  const pattern = detectSmilePattern(strikes, ivs, atmStrike);
  
  return {
    atmIV: parseFloat(atmIV.toFixed(4)),
    atmStrike: atmStrike,
    skew: {
      delta25: parseFloat(skew25Delta.toFixed(4)),
      delta10: parseFloat(skew10Delta.toFixed(4))
    },
    smileSteepness: parseFloat(smileSteepness.toFixed(4)),
    pattern: pattern,
    interpretation: interpretVolatilitySmile(pattern, skew25Delta, smileSteepness)
  };
}

/**
 * Analyze volatility term structure
 * @param {Array} expirations - Array of expiration dates
 * @param {Array} atmIVs - Array of ATM implied volatilities
 * @returns {Object} Term structure analysis
 */
export function analyzeTermStructure(expirations, atmIVs) {
  if (expirations.length !== atmIVs.length || expirations.length < 2) {
    throw new Error('Invalid data: need at least 2 expiration/IV pairs');
  }
  
  // Convert dates to days to expiration
  const today = new Date();
  const dtes = expirations.map(exp => 
    Math.max(0, Math.floor((new Date(exp) - today) / (1000 * 60 * 60 * 24)))
  );
  
  // Sort by DTE
  const sorted = dtes.map((dte, i) => ({ dte, iv: atmIVs[i] }))
    .sort((a, b) => a.dte - b.dte);
  
  // Calculate term structure slope
  const shortTerm = sorted.filter(d => d.dte <= 30);
  const mediumTerm = sorted.filter(d => d.dte > 30 && d.dte <= 90);
  const longTerm = sorted.filter(d => d.dte > 90);
  
  const avgShortIV = shortTerm.length > 0 ? 
    shortTerm.reduce((sum, d) => sum + d.iv, 0) / shortTerm.length : null;
  const avgMediumIV = mediumTerm.length > 0 ?
    mediumTerm.reduce((sum, d) => sum + d.iv, 0) / mediumTerm.length : null;
  const avgLongIV = longTerm.length > 0 ?
    longTerm.reduce((sum, d) => sum + d.iv, 0) / longTerm.length : null;
  
  // Determine term structure shape
  let shape = 'flat';
  let interpretation = 'Stable volatility expectations across time';
  
  if (avgShortIV && avgLongIV) {
    const slope = (avgLongIV - avgShortIV) / avgShortIV;
    
    if (slope > 0.05) {
      shape = 'contango';
      interpretation = 'Market expects higher volatility in the future';
    } else if (slope < -0.05) {
      shape = 'backwardation';
      interpretation = 'Near-term event risk or elevated short-term volatility';
    } else {
      shape = 'flat';
      interpretation = 'Stable volatility expectations across time';
    }
  }
  
  // Calculate volatility cone percentiles
  const currentIVs = sorted.map(d => d.iv);
  const ivPercentiles = calculatePercentiles(currentIVs);
  
  return {
    shape: shape,
    interpretation: interpretation,
    shortTermIV: avgShortIV ? parseFloat(avgShortIV.toFixed(4)) : null,
    mediumTermIV: avgMediumIV ? parseFloat(avgMediumIV.toFixed(4)) : null,
    longTermIV: avgLongIV ? parseFloat(avgLongIV.toFixed(4)) : null,
    volatilityRange: {
      min: parseFloat(Math.min(...currentIVs).toFixed(4)),
      max: parseFloat(Math.max(...currentIVs).toFixed(4)),
      percentile25: parseFloat(ivPercentiles.p25.toFixed(4)),
      percentile50: parseFloat(ivPercentiles.p50.toFixed(4)),
      percentile75: parseFloat(ivPercentiles.p75.toFixed(4))
    },
    expirationData: sorted.map(d => ({
      dte: d.dte,
      iv: parseFloat(d.iv.toFixed(4))
    }))
  };
}

/**
 * Calculate implied volatility rank (IVR)
 * @param {number} currentIV - Current implied volatility
 * @param {Array} historicalIVs - Array of historical IV values (e.g., past 252 days)
 * @returns {Object} IV rank and percentile
 */
export function calculateIVRank(currentIV, historicalIVs) {
  if (!historicalIVs || historicalIVs.length === 0) {
    return {
      rank: null,
      percentile: null,
      interpretation: 'Insufficient historical data'
    };
  }
  
  const sortedIVs = [...historicalIVs].sort((a, b) => a - b);
  const min = sortedIVs[0];
  const max = sortedIVs[sortedIVs.length - 1];
  
  // IV Rank: (Current - Min) / (Max - Min) * 100
  const ivRank = max > min ? ((currentIV - min) / (max - min)) * 100 : 50;
  
  // IV Percentile: Percentage of days with lower IV
  const lowerCount = sortedIVs.filter(iv => iv < currentIV).length;
  const ivPercentile = (lowerCount / sortedIVs.length) * 100;
  
  // Interpretation
  let interpretation;
  if (ivRank > 80) {
    interpretation = 'Very high - Good for selling premium';
  } else if (ivRank > 50) {
    interpretation = 'Above average - Neutral to slight premium selling bias';
  } else if (ivRank > 20) {
    interpretation = 'Below average - Neutral to slight premium buying bias';
  } else {
    interpretation = 'Very low - Good for buying premium';
  }
  
  return {
    rank: parseFloat(ivRank.toFixed(2)),
    percentile: parseFloat(ivPercentile.toFixed(2)),
    historicalMin: parseFloat(min.toFixed(4)),
    historicalMax: parseFloat(max.toFixed(4)),
    current: parseFloat(currentIV.toFixed(4)),
    interpretation: interpretation
  };
}

/**
 * Compare implied volatility to realized volatility
 * @param {number} impliedVol - Current implied volatility
 * @param {Array} priceHistory - Array of historical prices
 * @param {number} lookbackDays - Days to calculate realized vol (default 20)
 * @returns {Object} IV vs RV comparison
 */
export function compareIVtoRV(impliedVol, priceHistory, lookbackDays = 20) {
  if (!priceHistory || priceHistory.length < lookbackDays + 1) {
    return {
      impliedVol: impliedVol,
      realizedVol: null,
      volPremium: null,
      interpretation: 'Insufficient price history'
    };
  }
  
  // Calculate realized volatility (historical volatility)
  const returns = [];
  for (let i = 1; i <= lookbackDays; i++) {
    const ret = Math.log(priceHistory[i] / priceHistory[i - 1]);
    returns.push(ret);
  }
  
  const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
  const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / (returns.length - 1);
  const dailyVol = Math.sqrt(variance);
  const annualizedRV = dailyVol * Math.sqrt(252); // Annualize
  
  // Calculate volatility premium
  const volPremium = impliedVol - annualizedRV;
  const premiumPercent = (volPremium / annualizedRV) * 100;
  
  // Interpretation
  let interpretation;
  if (premiumPercent > 20) {
    interpretation = 'IV significantly higher than RV - Options may be overpriced';
  } else if (premiumPercent > 0) {
    interpretation = 'IV moderately higher than RV - Normal volatility risk premium';
  } else if (premiumPercent > -20) {
    interpretation = 'IV lower than RV - Options may be underpriced';
  } else {
    interpretation = 'IV significantly lower than RV - Strong buy signal for options';
  }
  
  return {
    impliedVol: parseFloat(impliedVol.toFixed(4)),
    realizedVol: parseFloat(annualizedRV.toFixed(4)),
    volPremium: parseFloat(volPremium.toFixed(4)),
    premiumPercent: parseFloat(premiumPercent.toFixed(2)),
    interpretation: interpretation,
    lookbackDays: lookbackDays
  };
}

/**
 * Calculate volatility cone for different time periods
 * @param {Array} priceHistory - Historical price data
 * @returns {Object} Volatility cone data
 */
export function calculateVolatilityCone(priceHistory) {
  const periods = [5, 10, 20, 30, 60, 90];
  const coneData = {};
  
  periods.forEach(period => {
    if (priceHistory.length >= period + 1) {
      const vols = [];
      
      // Calculate rolling volatilities
      for (let i = period; i < priceHistory.length; i++) {
        const periodPrices = priceHistory.slice(i - period, i + 1);
        const returns = [];
        
        for (let j = 1; j < periodPrices.length; j++) {
          returns.push(Math.log(periodPrices[j] / periodPrices[j - 1]));
        }
        
        const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
        const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / (returns.length - 1);
        const annualizedVol = Math.sqrt(variance) * Math.sqrt(252);
        vols.push(annualizedVol);
      }
      
      // Calculate percentiles
      vols.sort((a, b) => a - b);
      coneData[`${period}d`] = {
        min: parseFloat(vols[0].toFixed(4)),
        p10: parseFloat(vols[Math.floor(vols.length * 0.1)].toFixed(4)),
        p25: parseFloat(vols[Math.floor(vols.length * 0.25)].toFixed(4)),
        p50: parseFloat(vols[Math.floor(vols.length * 0.5)].toFixed(4)),
        p75: parseFloat(vols[Math.floor(vols.length * 0.75)].toFixed(4)),
        p90: parseFloat(vols[Math.floor(vols.length * 0.9)].toFixed(4)),
        max: parseFloat(vols[vols.length - 1].toFixed(4)),
        current: parseFloat(vols[vols.length - 1].toFixed(4))
      };
    }
  });
  
  return coneData;
}

// Helper functions

function calculateSkewAtDelta(putData, callData, targetDelta) {
  // Simplified skew calculation
  if (putData.length === 0 || callData.length === 0) return 0;
  
  // Find puts and calls closest to target delta (simplified)
  const putIV = putData[Math.floor(putData.length * targetDelta)]?.iv || 0;
  const callIV = callData[Math.floor(callData.length * targetDelta)]?.iv || 0;
  
  return putIV - callIV;
}

function calculateSmileSteepness(strikes, ivs, atmStrike) {
  // Calculate average IV change per unit of moneyness
  let totalSteepness = 0;
  let count = 0;
  
  for (let i = 1; i < strikes.length; i++) {
    const moneyness1 = strikes[i - 1] / atmStrike;
    const moneyness2 = strikes[i] / atmStrike;
    const ivChange = Math.abs(ivs[i] - ivs[i - 1]);
    const moneynessChange = Math.abs(moneyness2 - moneyness1);
    
    if (moneynessChange > 0) {
      totalSteepness += ivChange / moneynessChange;
      count++;
    }
  }
  
  return count > 0 ? totalSteepness / count : 0;
}

function detectSmilePattern(strikes, ivs, atmStrike) {
  const atmIndex = strikes.reduce((closest, strike, i) => 
    Math.abs(strike - atmStrike) < Math.abs(strikes[closest] - atmStrike) ? i : closest, 0);
  
  // Check if wings are higher than ATM
  const leftWing = ivs.slice(0, atmIndex);
  const rightWing = ivs.slice(atmIndex + 1);
  
  const leftAvg = leftWing.length > 0 ? leftWing.reduce((a, b) => a + b, 0) / leftWing.length : 0;
  const rightAvg = rightWing.length > 0 ? rightWing.reduce((a, b) => a + b, 0) / rightWing.length : 0;
  const atmIV = ivs[atmIndex];
  
  if (leftAvg > atmIV && rightAvg > atmIV) {
    return 'smile';
  } else if (leftAvg > rightAvg) {
    return 'smirk';
  } else if (rightAvg > leftAvg) {
    return 'reverse-smirk';
  } else {
    return 'flat';
  }
}

function interpretVolatilitySmile(pattern, skew, steepness) {
  const interpretations = {
    'smile': 'Both OTM puts and calls have higher IV - indicating tail risk concerns',
    'smirk': 'OTM puts have higher IV - indicating downside protection demand',
    'reverse-smirk': 'OTM calls have higher IV - indicating upside speculation',
    'flat': 'Relatively uniform IV across strikes - low skew environment'
  };
  
  let interpretation = interpretations[pattern] || 'Normal volatility smile';
  
  if (Math.abs(skew) > 0.05) {
    interpretation += `. Significant skew of ${(skew * 100).toFixed(1)}% detected`;
  }
  
  if (steepness > 0.5) {
    interpretation += '. Steep smile indicates high demand for OTM options';
  }
  
  return interpretation;
}

function calculatePercentiles(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    p25: sorted[Math.floor(sorted.length * 0.25)],
    p50: sorted[Math.floor(sorted.length * 0.50)],
    p75: sorted[Math.floor(sorted.length * 0.75)]
  };
}