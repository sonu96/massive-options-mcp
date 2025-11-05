// Strategy builder module for options spread strategies
// Generates and ranks various multi-leg option strategies

/**
 * Generate bull call spread strategies
 * Buy lower strike call, sell higher strike call
 * @param {Array} callOptions - Array of call option contracts with pricing
 * @param {number} underlyingPrice - Current stock price
 * @param {Array} targetStrikes - Optional specific strikes to use
 * @returns {Array} Array of bull call spread strategies
 */
export function generateBullCallSpreads(callOptions, underlyingPrice, targetStrikes = null) {
  const strategies = [];

  // Filter to valid options with pricing
  const validCalls = callOptions.filter(opt =>
    opt.price?.last > 0 &&
    opt.strike &&
    opt.expiration &&
    opt.greeks?.delta
  ).sort((a, b) => a.strike - b.strike);

  if (validCalls.length < 2) {
    return strategies;
  }

  // If target strikes specified, use those
  if (targetStrikes && targetStrikes.length >= 2) {
    for (let i = 0; i < targetStrikes.length - 1; i++) {
      const longStrike = targetStrikes[i];
      const shortStrike = targetStrikes[i + 1];

      const longLeg = validCalls.find(c => c.strike === longStrike);
      const shortLeg = validCalls.find(c => c.strike === shortStrike);

      if (longLeg && shortLeg) {
        const spread = buildBullCallSpread(longLeg, shortLeg, underlyingPrice);
        if (spread) strategies.push(spread);
      }
    }
  } else {
    // Auto-generate spreads from ATM and OTM strikes
    const atmIndex = validCalls.findIndex(c => c.strike >= underlyingPrice);

    // Generate spreads within reasonable range (ATM to 20% OTM)
    for (let i = Math.max(0, atmIndex - 2); i < validCalls.length - 1; i++) {
      const longLeg = validCalls[i];

      // Only consider strikes within 20% of current price
      if (longLeg.strike > underlyingPrice * 1.2) break;

      // Find potential short legs (5-25% above long strike)
      for (let j = i + 1; j < validCalls.length; j++) {
        const shortLeg = validCalls[j];
        const strikeSpread = shortLeg.strike - longLeg.strike;
        const spreadPct = strikeSpread / longLeg.strike;

        // Spread width between 5-25% of long strike
        if (spreadPct < 0.05) continue;
        if (spreadPct > 0.25) break;

        const spread = buildBullCallSpread(longLeg, shortLeg, underlyingPrice);
        if (spread) strategies.push(spread);
      }
    }
  }

  return strategies;
}

/**
 * Generate bear put spread strategies
 * Buy higher strike put, sell lower strike put
 * @param {Array} putOptions - Array of put option contracts with pricing
 * @param {number} underlyingPrice - Current stock price
 * @param {Array} targetStrikes - Optional specific strikes to use
 * @returns {Array} Array of bear put spread strategies
 */
export function generateBearPutSpreads(putOptions, underlyingPrice, targetStrikes = null) {
  const strategies = [];

  // Filter to valid options with pricing
  const validPuts = putOptions.filter(opt =>
    opt.price?.last > 0 &&
    opt.strike &&
    opt.expiration &&
    opt.greeks?.delta
  ).sort((a, b) => b.strike - a.strike); // Sort descending for puts

  if (validPuts.length < 2) {
    return strategies;
  }

  // If target strikes specified, use those
  if (targetStrikes && targetStrikes.length >= 2) {
    for (let i = 0; i < targetStrikes.length - 1; i++) {
      const longStrike = targetStrikes[i + 1]; // Higher strike for puts
      const shortStrike = targetStrikes[i];

      const longLeg = validPuts.find(p => p.strike === longStrike);
      const shortLeg = validPuts.find(p => p.strike === shortStrike);

      if (longLeg && shortLeg) {
        const spread = buildBearPutSpread(longLeg, shortLeg, underlyingPrice);
        if (spread) strategies.push(spread);
      }
    }
  } else {
    // Auto-generate spreads from ATM and OTM strikes
    const atmIndex = validPuts.findIndex(p => p.strike <= underlyingPrice);

    // Generate spreads within reasonable range (80% OTM to ATM)
    for (let i = Math.max(0, atmIndex - 2); i < validPuts.length - 1; i++) {
      const longLeg = validPuts[i];

      // Only consider strikes within 20% below current price
      if (longLeg.strike < underlyingPrice * 0.8) break;

      // Find potential short legs (5-25% below long strike)
      for (let j = i + 1; j < validPuts.length; j++) {
        const shortLeg = validPuts[j];
        const strikeSpread = longLeg.strike - shortLeg.strike;
        const spreadPct = strikeSpread / longLeg.strike;

        // Spread width between 5-25% of long strike
        if (spreadPct < 0.05) continue;
        if (spreadPct > 0.25) break;

        const spread = buildBearPutSpread(longLeg, shortLeg, underlyingPrice);
        if (spread) strategies.push(spread);
      }
    }
  }

  return strategies;
}

/**
 * Generate iron condor strategies
 * Sell OTM call spread + sell OTM put spread
 * @param {Array} callOptions - Array of call option contracts
 * @param {Array} putOptions - Array of put option contracts
 * @param {number} underlyingPrice - Current stock price
 * @returns {Array} Array of iron condor strategies
 */
export function generateIronCondors(callOptions, putOptions, underlyingPrice) {
  const strategies = [];

  const validCalls = callOptions.filter(opt =>
    opt.price?.last > 0 && opt.strike > underlyingPrice
  ).sort((a, b) => a.strike - b.strike);

  const validPuts = putOptions.filter(opt =>
    opt.price?.last > 0 && opt.strike < underlyingPrice
  ).sort((a, b) => b.strike - a.strike);

  if (validCalls.length < 2 || validPuts.length < 2) {
    return strategies;
  }

  // Generate iron condors with symmetric wings
  for (let i = 0; i < validCalls.length - 1 && i < 5; i++) {
    const shortCall = validCalls[i];
    const longCall = validCalls[i + 1];

    for (let j = 0; j < validPuts.length - 1 && j < 5; j++) {
      const shortPut = validPuts[j];
      const longPut = validPuts[j + 1];

      // Check if wings are relatively symmetric
      const callSpread = longCall.strike - shortCall.strike;
      const putSpread = shortPut.strike - longPut.strike;

      if (Math.abs(callSpread - putSpread) / callSpread > 0.3) continue;

      const condor = buildIronCondor(longPut, shortPut, shortCall, longCall, underlyingPrice);
      if (condor) strategies.push(condor);
    }
  }

  return strategies.slice(0, 10); // Limit to top 10
}

/**
 * Generate calendar spread strategies
 * Sell near-term, buy longer-term at same strike
 * @param {Object} optionsByExpiration - Options grouped by expiration
 * @param {number} underlyingPrice - Current stock price
 * @param {string} optionType - 'call' or 'put'
 * @returns {Array} Array of calendar spread strategies
 */
export function generateCalendarSpreads(optionsByExpiration, underlyingPrice, optionType = 'call') {
  const strategies = [];

  const expirations = Object.keys(optionsByExpiration).sort();
  if (expirations.length < 2) return strategies;

  // Use first two expirations (near-term and next-term)
  for (let i = 0; i < expirations.length - 1 && i < 3; i++) {
    const nearExp = expirations[i];
    const farExp = expirations[i + 1];

    const nearOptions = optionType === 'call' ?
      optionsByExpiration[nearExp].calls :
      optionsByExpiration[nearExp].puts;
    const farOptions = optionType === 'call' ?
      optionsByExpiration[farExp].calls :
      optionsByExpiration[farExp].puts;

    // Find ATM strikes
    nearOptions.filter(opt =>
      Math.abs(opt.strike - underlyingPrice) / underlyingPrice < 0.05 &&
      opt.price?.last > 0
    ).forEach(nearOpt => {
      const farOpt = farOptions.find(f =>
        f.strike === nearOpt.strike && f.price?.last > 0
      );

      if (farOpt) {
        const calendar = buildCalendarSpread(nearOpt, farOpt, underlyingPrice, optionType);
        if (calendar) strategies.push(calendar);
      }
    });
  }

  return strategies;
}

/**
 * Rank strategies by multiple criteria
 * @param {Array} strategies - Array of strategy objects
 * @param {Object} preferences - User preferences for ranking
 * @returns {Array} Sorted array of strategies with scores
 */
export function rankStrategies(strategies, preferences = {}) {
  const {
    minRewardRatio = 2.0,
    minProbProfit = 0.5,
    maxRisk = Infinity,
    preferenceType = 'balanced' // 'aggressive', 'balanced', 'conservative'
  } = preferences;

  // Filter out strategies that don't meet minimum criteria
  const qualified = strategies.filter(s =>
    s.risk_reward >= minRewardRatio &&
    s.probability_profit >= minProbProfit &&
    s.max_risk <= maxRisk
  );

  // Calculate composite score for each strategy
  qualified.forEach(strategy => {
    let score = 0;

    // Risk/reward component (40%)
    score += (strategy.risk_reward / 5) * 40;

    // Probability component (30%)
    score += strategy.probability_profit * 30;

    // Expected value component (20%)
    const expectedValue = (strategy.max_profit * strategy.probability_profit) -
                          (strategy.max_risk * (1 - strategy.probability_profit));
    score += (expectedValue / strategy.max_risk) * 20;

    // Volume/liquidity component (10%)
    const avgVolume = (strategy.legs.reduce((sum, leg) =>
      sum + (leg.volume || 0), 0) / strategy.legs.length);
    const volumeScore = Math.min(avgVolume / 1000, 1);
    score += volumeScore * 10;

    // Adjust based on preference type
    if (preferenceType === 'aggressive') {
      score += (strategy.max_profit / strategy.max_risk - 2) * 5;
    } else if (preferenceType === 'conservative') {
      score += strategy.probability_profit * 10;
    }

    strategy.score = parseFloat(score.toFixed(2));
  });

  // Sort by score descending
  return qualified.sort((a, b) => b.score - a.score);
}

// Helper functions to build individual strategy objects

function buildBullCallSpread(longLeg, shortLeg, underlyingPrice) {
  const netDebit = longLeg.price.last - shortLeg.price.last;
  if (netDebit <= 0) return null; // Invalid spread

  const maxProfit = (shortLeg.strike - longLeg.strike) - netDebit;
  const maxRisk = netDebit;
  const breakeven = longLeg.strike + netDebit;

  // Estimate probability (simplified using delta)
  const probProfit = Math.abs(shortLeg.greeks?.delta || 0.5);

  return {
    type: 'bull_call_spread',
    strategy_name: `${longLeg.strike}/${shortLeg.strike} Bull Call Spread`,
    expiration: longLeg.expiration,
    underlying_price: underlyingPrice,
    legs: [
      {
        action: 'buy',
        type: 'call',
        strike: longLeg.strike,
        price: longLeg.price.last,
        delta: longLeg.greeks?.delta,
        volume: longLeg.price?.volume,
        open_interest: longLeg.price?.open_interest
      },
      {
        action: 'sell',
        type: 'call',
        strike: shortLeg.strike,
        price: shortLeg.price.last,
        delta: shortLeg.greeks?.delta,
        volume: shortLeg.price?.volume,
        open_interest: shortLeg.price?.open_interest
      }
    ],
    net_debit: parseFloat(netDebit.toFixed(2)),
    max_profit: parseFloat(maxProfit.toFixed(2)),
    max_risk: parseFloat(maxRisk.toFixed(2)),
    risk_reward: parseFloat((maxProfit / maxRisk).toFixed(2)),
    breakeven: parseFloat(breakeven.toFixed(2)),
    probability_profit: parseFloat(probProfit.toFixed(3)),
    distance_to_breakeven: parseFloat(((breakeven - underlyingPrice) / underlyingPrice * 100).toFixed(2))
  };
}

function buildBearPutSpread(longLeg, shortLeg, underlyingPrice) {
  const netDebit = longLeg.price.last - shortLeg.price.last;
  if (netDebit <= 0) return null; // Invalid spread

  const maxProfit = (longLeg.strike - shortLeg.strike) - netDebit;
  const maxRisk = netDebit;
  const breakeven = longLeg.strike - netDebit;

  // Estimate probability (simplified using delta)
  const probProfit = Math.abs(longLeg.greeks?.delta || 0.5);

  return {
    type: 'bear_put_spread',
    strategy_name: `${longLeg.strike}/${shortLeg.strike} Bear Put Spread`,
    expiration: longLeg.expiration,
    underlying_price: underlyingPrice,
    legs: [
      {
        action: 'buy',
        type: 'put',
        strike: longLeg.strike,
        price: longLeg.price.last,
        delta: longLeg.greeks?.delta,
        volume: longLeg.price?.volume,
        open_interest: longLeg.price?.open_interest
      },
      {
        action: 'sell',
        type: 'put',
        strike: shortLeg.strike,
        price: shortLeg.price.last,
        delta: shortLeg.greeks?.delta,
        volume: shortLeg.price?.volume,
        open_interest: shortLeg.price?.open_interest
      }
    ],
    net_debit: parseFloat(netDebit.toFixed(2)),
    max_profit: parseFloat(maxProfit.toFixed(2)),
    max_risk: parseFloat(maxRisk.toFixed(2)),
    risk_reward: parseFloat((maxProfit / maxRisk).toFixed(2)),
    breakeven: parseFloat(breakeven.toFixed(2)),
    probability_profit: parseFloat(probProfit.toFixed(3)),
    distance_to_breakeven: parseFloat(((underlyingPrice - breakeven) / underlyingPrice * 100).toFixed(2))
  };
}

function buildIronCondor(longPut, shortPut, shortCall, longCall, underlyingPrice) {
  const netCredit = (shortPut.price.last + shortCall.price.last) -
                    (longPut.price.last + longCall.price.last);

  if (netCredit <= 0) return null; // Invalid condor

  const maxRisk = Math.max(
    (shortPut.strike - longPut.strike) - netCredit,
    (longCall.strike - shortCall.strike) - netCredit
  );
  const maxProfit = netCredit;

  // Probability is probability of staying between short strikes
  const probProfit = 1 - (Math.abs(shortCall.greeks?.delta || 0.3) +
                          Math.abs(shortPut.greeks?.delta || 0.3));

  return {
    type: 'iron_condor',
    strategy_name: `${longPut.strike}/${shortPut.strike}/${shortCall.strike}/${longCall.strike} Iron Condor`,
    expiration: longCall.expiration,
    underlying_price: underlyingPrice,
    legs: [
      { action: 'buy', type: 'put', strike: longPut.strike, price: longPut.price.last, delta: longPut.greeks?.delta },
      { action: 'sell', type: 'put', strike: shortPut.strike, price: shortPut.price.last, delta: shortPut.greeks?.delta },
      { action: 'sell', type: 'call', strike: shortCall.strike, price: shortCall.price.last, delta: shortCall.greeks?.delta },
      { action: 'buy', type: 'call', strike: longCall.strike, price: longCall.price.last, delta: longCall.greeks?.delta }
    ],
    net_credit: parseFloat(netCredit.toFixed(2)),
    max_profit: parseFloat(maxProfit.toFixed(2)),
    max_risk: parseFloat(maxRisk.toFixed(2)),
    risk_reward: parseFloat((maxProfit / maxRisk).toFixed(2)),
    breakeven_lower: parseFloat((shortPut.strike - netCredit).toFixed(2)),
    breakeven_upper: parseFloat((shortCall.strike + netCredit).toFixed(2)),
    probability_profit: parseFloat(probProfit.toFixed(3)),
    profit_range: `${shortPut.strike} - ${shortCall.strike}`
  };
}

function buildCalendarSpread(nearLeg, farLeg, underlyingPrice, optionType) {
  const netDebit = farLeg.price.last - nearLeg.price.last;
  if (netDebit <= 0) return null; // Invalid calendar

  // Max profit is hard to calculate without volatility estimates
  // Simplified: assume max profit is ~30% of debit
  const maxProfit = netDebit * 0.3;
  const maxRisk = netDebit;

  return {
    type: 'calendar_spread',
    strategy_name: `${nearLeg.strike} ${optionType.toUpperCase()} Calendar`,
    strike: nearLeg.strike,
    underlying_price: underlyingPrice,
    legs: [
      {
        action: 'sell',
        type: optionType,
        strike: nearLeg.strike,
        expiration: nearLeg.expiration,
        price: nearLeg.price.last,
        days_to_expiry: calculateDTE(nearLeg.expiration)
      },
      {
        action: 'buy',
        type: optionType,
        strike: farLeg.strike,
        expiration: farLeg.expiration,
        price: farLeg.price.last,
        days_to_expiry: calculateDTE(farLeg.expiration)
      }
    ],
    net_debit: parseFloat(netDebit.toFixed(2)),
    max_profit: parseFloat(maxProfit.toFixed(2)),
    max_risk: parseFloat(maxRisk.toFixed(2)),
    risk_reward: parseFloat((maxProfit / maxRisk).toFixed(2)),
    ideal_outcome: `${nearLeg.strike} at near expiration`,
    probability_profit: 0.55 // Calendars typically have good win rates
  };
}

// Helper to calculate days to expiration
function calculateDTE(expirationDate) {
  const expiry = new Date(expirationDate);
  const today = new Date();
  const diffTime = expiry - today;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays > 0 ? diffDays : 0;
}
