// Market structure analysis module
// Provides insights into option market positioning and sentiment

/**
 * Analyze put/call ratios across different metrics
 * @param {Object} chainData - Option chain data with calls and puts
 * @returns {Object} Put/call ratio analysis
 */
export function analyzePutCallRatios(chainData) {
  const analysis = {
    volume: {
      ratio: 0,
      callVolume: 0,
      putVolume: 0,
      interpretation: ''
    },
    openInterest: {
      ratio: 0,
      callOI: 0,
      putOI: 0,
      interpretation: ''
    },
    premium: {
      ratio: 0,
      callPremium: 0,
      putPremium: 0,
      interpretation: ''
    }
  };
  
  // Calculate totals across all strikes and expirations
  let totalCallVolume = 0;
  let totalPutVolume = 0;
  let totalCallOI = 0;
  let totalPutOI = 0;
  let totalCallPremium = 0;
  let totalPutPremium = 0;
  
  Object.values(chainData).forEach(expiration => {
    // Process calls
    expiration.calls?.forEach(call => {
      totalCallVolume += call.price?.volume || 0;
      totalCallOI += call.price?.open_interest || 0;
      totalCallPremium += (call.price?.last || 0) * (call.price?.volume || 0);
    });
    
    // Process puts
    expiration.puts?.forEach(put => {
      totalPutVolume += put.price?.volume || 0;
      totalPutOI += put.price?.open_interest || 0;
      totalPutPremium += (put.price?.last || 0) * (put.price?.volume || 0);
    });
  });
  
  // Volume P/C ratio
  analysis.volume.callVolume = totalCallVolume;
  analysis.volume.putVolume = totalPutVolume;
  analysis.volume.ratio = totalCallVolume > 0 ? 
    parseFloat((totalPutVolume / totalCallVolume).toFixed(3)) : 0;
  analysis.volume.interpretation = interpretPCRatio(analysis.volume.ratio, 'volume');
  
  // Open Interest P/C ratio
  analysis.openInterest.callOI = totalCallOI;
  analysis.openInterest.putOI = totalPutOI;
  analysis.openInterest.ratio = totalCallOI > 0 ? 
    parseFloat((totalPutOI / totalCallOI).toFixed(3)) : 0;
  analysis.openInterest.interpretation = interpretPCRatio(analysis.openInterest.ratio, 'oi');
  
  // Premium P/C ratio (dollar-weighted)
  analysis.premium.callPremium = parseFloat(totalCallPremium.toFixed(2));
  analysis.premium.putPremium = parseFloat(totalPutPremium.toFixed(2));
  analysis.premium.ratio = totalCallPremium > 0 ? 
    parseFloat((totalPutPremium / totalCallPremium).toFixed(3)) : 0;
  analysis.premium.interpretation = interpretPCRatio(analysis.premium.ratio, 'premium');
  
  return analysis;
}

/**
 * Analyze option flow and positioning
 * @param {Array} recentTrades - Recent option trades data
 * @returns {Object} Flow analysis
 */
export function analyzeOptionFlow(recentTrades) {
  if (!recentTrades || recentTrades.length === 0) {
    return {
      netFlow: 'N/A',
      bullishFlow: 0,
      bearishFlow: 0,
      largeBlockTrades: [],
      interpretation: 'Insufficient trade data'
    };
  }
  
  let bullishFlow = 0;
  let bearishFlow = 0;
  const largeBlockTrades = [];
  const blockThreshold = 100; // contracts
  
  recentTrades.forEach(trade => {
    const dollarValue = trade.price * trade.size * 100; // size * 100 shares per contract
    
    // Classify flow based on trade type and price action
    if (trade.type === 'call') {
      if (trade.side === 'buy' || trade.price > trade.bid) {
        bullishFlow += dollarValue;
      } else {
        bearishFlow += dollarValue; // Sold calls
      }
    } else if (trade.type === 'put') {
      if (trade.side === 'buy' || trade.price > trade.bid) {
        bearishFlow += dollarValue;
      } else {
        bullishFlow += dollarValue; // Sold puts
      }
    }
    
    // Track large block trades
    if (trade.size >= blockThreshold) {
      largeBlockTrades.push({
        type: trade.type,
        strike: trade.strike,
        size: trade.size,
        price: trade.price,
        dollarValue: dollarValue,
        time: trade.timestamp
      });
    }
  });
  
  const netFlow = bullishFlow - bearishFlow;
  const totalFlow = bullishFlow + bearishFlow;
  const flowRatio = totalFlow > 0 ? netFlow / totalFlow : 0;
  
  let interpretation;
  if (flowRatio > 0.2) {
    interpretation = 'Strong bullish flow - institutional buying detected';
  } else if (flowRatio > 0) {
    interpretation = 'Moderate bullish flow';
  } else if (flowRatio > -0.2) {
    interpretation = 'Moderate bearish flow';
  } else {
    interpretation = 'Strong bearish flow - institutional hedging or bearish bets';
  }
  
  return {
    netFlow: parseFloat(netFlow.toFixed(2)),
    bullishFlow: parseFloat(bullishFlow.toFixed(2)),
    bearishFlow: parseFloat(bearishFlow.toFixed(2)),
    flowRatio: parseFloat(flowRatio.toFixed(3)),
    largeBlockTrades: largeBlockTrades.slice(0, 10), // Top 10
    interpretation: interpretation
  };
}

/**
 * Analyze gamma exposure (GEX) and dealer positioning
 * @param {Object} chainData - Option chain with Greeks
 * @param {number} spotPrice - Current underlying price
 * @returns {Object} Gamma exposure analysis
 */
export function analyzeGammaExposure(chainData, spotPrice) {
  const strikes = [];
  const netGammaByStrike = {};
  let totalGEX = 0;
  let callGEX = 0;
  let putGEX = 0;
  
  // Calculate net gamma exposure by strike
  Object.values(chainData).forEach(expiration => {
    // Process calls
    expiration.calls?.forEach(call => {
      const strike = call.strike;
      const gamma = call.greeks?.gamma || 0;
      const oi = call.price?.open_interest || 0;
      const callGamma = gamma * oi * 100 * spotPrice * spotPrice * 0.01; // GEX calculation
      
      if (!netGammaByStrike[strike]) {
        netGammaByStrike[strike] = 0;
        strikes.push(strike);
      }
      netGammaByStrike[strike] += callGamma;
      callGEX += callGamma;
      totalGEX += callGamma;
    });
    
    // Process puts (negative gamma for dealers when customers are long)
    expiration.puts?.forEach(put => {
      const strike = put.strike;
      const gamma = put.greeks?.gamma || 0;
      const oi = put.price?.open_interest || 0;
      const putGamma = -gamma * oi * 100 * spotPrice * spotPrice * 0.01;
      
      if (!netGammaByStrike[strike]) {
        netGammaByStrike[strike] = 0;
        strikes.push(strike);
      }
      netGammaByStrike[strike] += putGamma;
      putGEX += Math.abs(putGamma);
      totalGEX += putGamma;
    });
  });
  
  // Sort strikes
  strikes.sort((a, b) => a - b);
  
  // Find key levels
  let maxGammaStrike = null;
  let maxGamma = 0;
  let zeroGammaStrike = null;
  let minDiffFromZero = Infinity;
  
  strikes.forEach(strike => {
    const gamma = netGammaByStrike[strike];
    if (Math.abs(gamma) > maxGamma) {
      maxGamma = Math.abs(gamma);
      maxGammaStrike = strike;
    }
    
    // Find strike closest to zero gamma (flip point)
    if (Math.abs(gamma) < minDiffFromZero) {
      minDiffFromZero = Math.abs(gamma);
      zeroGammaStrike = strike;
    }
  });
  
  // Determine market regime
  let regime, interpretation;
  if (totalGEX > 0) {
    regime = 'Positive Gamma';
    interpretation = 'Dealers are long gamma - expect mean reversion and volatility suppression';
  } else {
    regime = 'Negative Gamma';
    interpretation = 'Dealers are short gamma - expect higher volatility and trending moves';
  }
  
  // Add support/resistance interpretation
  if (maxGammaStrike) {
    interpretation += `. Key gamma level at ${maxGammaStrike} likely to act as magnet`;
  }
  
  return {
    totalGEX: parseFloat(totalGEX.toFixed(2)),
    callGEX: parseFloat(callGEX.toFixed(2)),
    putGEX: parseFloat(putGEX.toFixed(2)),
    regime: regime,
    maxGammaStrike: maxGammaStrike,
    zeroGammaStrike: zeroGammaStrike,
    gammaProfile: strikes.slice(0, 20).map(strike => ({
      strike: strike,
      netGamma: parseFloat(netGammaByStrike[strike].toFixed(2))
    })),
    interpretation: interpretation
  };
}

/**
 * Calculate max pain (strike where most options expire worthless)
 * @param {Object} chainData - Option chain data
 * @param {number} spotPrice - Current underlying price
 * @returns {Object} Max pain analysis
 */
export function calculateMaxPain(chainData, spotPrice) {
  const strikePains = {};
  const strikes = new Set();
  
  // Collect all unique strikes
  Object.values(chainData).forEach(expiration => {
    expiration.calls?.forEach(call => strikes.add(call.strike));
    expiration.puts?.forEach(put => strikes.add(put.strike));
  });
  
  const strikeArray = Array.from(strikes).sort((a, b) => a - b);
  
  // Calculate pain at each strike
  strikeArray.forEach(testStrike => {
    let totalPain = 0;
    
    Object.values(chainData).forEach(expiration => {
      // Calculate call pain
      expiration.calls?.forEach(call => {
        const oi = call.price?.open_interest || 0;
        const pain = Math.max(0, testStrike - call.strike) * oi * 100;
        totalPain += pain;
      });
      
      // Calculate put pain
      expiration.puts?.forEach(put => {
        const oi = put.price?.open_interest || 0;
        const pain = Math.max(0, put.strike - testStrike) * oi * 100;
        totalPain += pain;
      });
    });
    
    strikePains[testStrike] = totalPain;
  });
  
  // Find strike with minimum pain
  let maxPainStrike = null;
  let minPain = Infinity;
  
  for (const [strike, pain] of Object.entries(strikePains)) {
    if (pain < minPain) {
      minPain = pain;
      maxPainStrike = parseFloat(strike);
    }
  }
  
  // Calculate pain distribution
  const painDistribution = strikeArray
    .filter(strike => Math.abs(strike - maxPainStrike) <= maxPainStrike * 0.1) // Within 10%
    .map(strike => ({
      strike: strike,
      pain: parseFloat((strikePains[strike] / 1000000).toFixed(2)), // In millions
      percentFromMax: parseFloat(((strike - maxPainStrike) / maxPainStrike * 100).toFixed(2))
    }));
  
  // Interpretation
  const percentFromSpot = ((maxPainStrike - spotPrice) / spotPrice) * 100;
  let interpretation;
  
  if (Math.abs(percentFromSpot) < 1) {
    interpretation = 'Max pain is very close to current price - neutral positioning';
  } else if (percentFromSpot > 3) {
    interpretation = 'Max pain significantly above spot - potential upward pressure';
  } else if (percentFromSpot < -3) {
    interpretation = 'Max pain significantly below spot - potential downward pressure';
  } else {
    interpretation = 'Max pain moderately displaced from spot - some directional pressure';
  }
  
  return {
    maxPainStrike: maxPainStrike,
    currentSpot: spotPrice,
    percentFromSpot: parseFloat(percentFromSpot.toFixed(2)),
    totalPainAtMax: parseFloat((minPain / 1000000).toFixed(2)), // In millions
    painDistribution: painDistribution,
    interpretation: interpretation
  };
}

/**
 * Analyze open interest distribution
 * @param {Object} chainData - Option chain data
 * @param {number} spotPrice - Current underlying price
 * @returns {Object} OI distribution analysis
 */
export function analyzeOIDistribution(chainData, spotPrice) {
  const callWalls = [];
  const putWalls = [];
  let totalCallOI = 0;
  let totalPutOI = 0;
  
  // Aggregate OI by strike across all expirations
  const callOIByStrike = {};
  const putOIByStrike = {};
  
  Object.values(chainData).forEach(expiration => {
    expiration.calls?.forEach(call => {
      const strike = call.strike;
      const oi = call.price?.open_interest || 0;
      callOIByStrike[strike] = (callOIByStrike[strike] || 0) + oi;
      totalCallOI += oi;
    });
    
    expiration.puts?.forEach(put => {
      const strike = put.strike;
      const oi = put.price?.open_interest || 0;
      putOIByStrike[strike] = (putOIByStrike[strike] || 0) + oi;
      totalPutOI += oi;
    });
  });
  
  // Find significant OI concentrations (walls)
  const callStrikes = Object.entries(callOIByStrike)
    .map(([strike, oi]) => ({ strike: parseFloat(strike), oi }))
    .sort((a, b) => b.oi - a.oi);
    
  const putStrikes = Object.entries(putOIByStrike)
    .map(([strike, oi]) => ({ strike: parseFloat(strike), oi }))
    .sort((a, b) => b.oi - a.oi);
  
  // Identify top 5 call and put walls
  callWalls.push(...callStrikes.slice(0, 5));
  putWalls.push(...putStrikes.slice(0, 5));
  
  // Find nearest significant levels
  const nearestCallWall = callWalls
    .filter(w => w.strike > spotPrice)
    .sort((a, b) => a.strike - b.strike)[0];
    
  const nearestPutWall = putWalls
    .filter(w => w.strike < spotPrice)
    .sort((a, b) => b.strike - a.strike)[0];
  
  // Calculate support/resistance strength
  const resistanceStrength = nearestCallWall ? 
    (nearestCallWall.oi / totalCallOI * 100) : 0;
  const supportStrength = nearestPutWall ? 
    (nearestPutWall.oi / totalPutOI * 100) : 0;
  
  // Interpretation
  let interpretation = '';
  if (nearestCallWall && resistanceStrength > 10) {
    interpretation += `Strong resistance at ${nearestCallWall.strike} (${resistanceStrength.toFixed(1)}% of call OI). `;
  }
  if (nearestPutWall && supportStrength > 10) {
    interpretation += `Strong support at ${nearestPutWall.strike} (${supportStrength.toFixed(1)}% of put OI). `;
  }
  
  const range = nearestCallWall && nearestPutWall ? 
    nearestCallWall.strike - nearestPutWall.strike : 0;
  if (range > 0) {
    interpretation += `Expected range: ${nearestPutWall.strike}-${nearestCallWall.strike}`;
  }
  
  return {
    callWalls: callWalls.map(w => ({
      strike: w.strike,
      openInterest: w.oi,
      percentOfTotal: parseFloat((w.oi / totalCallOI * 100).toFixed(2))
    })),
    putWalls: putWalls.map(w => ({
      strike: w.strike,
      openInterest: w.oi,
      percentOfTotal: parseFloat((w.oi / totalPutOI * 100).toFixed(2))
    })),
    nearestResistance: nearestCallWall?.strike || null,
    nearestSupport: nearestPutWall?.strike || null,
    expectedRange: {
      low: nearestPutWall?.strike || null,
      high: nearestCallWall?.strike || null,
      width: range
    },
    interpretation: interpretation || 'No significant OI concentrations found'
  };
}

// Helper function to interpret P/C ratios
function interpretPCRatio(ratio, type) {
  if (type === 'volume') {
    if (ratio > 1.2) return 'Very bearish sentiment - high put buying';
    if (ratio > 0.8) return 'Moderately bearish sentiment';
    if (ratio < 0.5) return 'Bullish sentiment - high call buying';
    return 'Neutral sentiment';
  } else if (type === 'oi') {
    if (ratio > 1.5) return 'Bearish positioning - high put open interest';
    if (ratio > 1.0) return 'Slightly bearish positioning';
    if (ratio < 0.7) return 'Bullish positioning - high call open interest';
    return 'Balanced positioning';
  } else if (type === 'premium') {
    if (ratio > 1.3) return 'Premium flowing into puts - defensive positioning';
    if (ratio > 0.9) return 'Balanced premium flow';
    return 'Premium flowing into calls - aggressive positioning';
  }
  return 'Normal';
}