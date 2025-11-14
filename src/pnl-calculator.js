// P&L calculator module for options strategies
// Calculates profit/loss scenarios at different price points and times

/**
 * Calculate P&L for a spread at expiration
 * @param {Object} strategy - Strategy object with legs
 * @param {number} underlyingPrice - Price of underlying at expiration
 * @param {number} contracts - Number of contracts
 * @returns {Object} P&L details
 */
export function calculateSpreadPnL(strategy, underlyingPrice, contracts = 1) {
  const multiplier = 100; // Standard options contract
  let totalPnL = 0;

  const legPnLs = strategy.legs.map(leg => {
    let legValue = 0;

    if (leg.type === 'call') {
      // Call value at expiration
      legValue = Math.max(0, underlyingPrice - leg.strike);
    } else if (leg.type === 'put') {
      // Put value at expiration
      legValue = Math.max(0, leg.strike - underlyingPrice);
    }

    // Calculate P&L based on action
    let legPnL;
    if (leg.action === 'buy') {
      legPnL = (legValue - leg.price) * multiplier * contracts;
    } else if (leg.action === 'sell') {
      legPnL = (leg.price - legValue) * multiplier * contracts;
    }

    totalPnL += legPnL;

    return {
      leg: `${leg.action} ${leg.type} ${leg.strike}`,
      value_at_price: parseFloat(legValue.toFixed(2)),
      entry_price: leg.price,
      pnl: parseFloat(legPnL.toFixed(2))
    };
  });

  return {
    underlying_price: underlyingPrice,
    total_pnl: parseFloat(totalPnL.toFixed(2)),
    leg_details: legPnLs,
    return_pct: strategy.max_risk ?
      parseFloat((totalPnL / (strategy.max_risk * multiplier * contracts) * 100).toFixed(2)) : 0
  };
}

/**
 * Generate P&L scenarios at multiple price levels
 * @param {Object} strategy - Strategy object
 * @param {number} contracts - Number of contracts
 * @param {Object} options - Configuration options
 * @returns {Array} Array of P&L scenarios
 */
export function generatePnLScenarios(strategy, contracts = 1, options = {}) {
  const {
    currentPrice = strategy.underlying_price,
    priceRange = 0.20, // +/- 20% by default
    numPoints = 11
  } = options;

  const scenarios = [];
  const minPrice = currentPrice * (1 - priceRange);
  const maxPrice = currentPrice * (1 + priceRange);
  const step = (maxPrice - minPrice) / (numPoints - 1);

  for (let i = 0; i < numPoints; i++) {
    const price = minPrice + (step * i);
    const pnl = calculateSpreadPnL(strategy, price, contracts);

    scenarios.push({
      price: parseFloat(price.toFixed(2)),
      price_change_pct: parseFloat(((price - currentPrice) / currentPrice * 100).toFixed(2)),
      pnl: pnl.total_pnl,
      return_pct: pnl.return_pct
    });
  }

  return scenarios;
}

/**
 * Calculate breakeven prices for a strategy
 * @param {Object} strategy - Strategy object
 * @returns {Object} Breakeven analysis
 */
export function calculateBreakevens(strategy) {
  const result = {
    type: strategy.type,
    breakevens: []
  };

  switch (strategy.type) {
    case 'bull_call_spread':
    case 'bear_put_spread':
      // Single breakeven for vertical spreads
      result.breakevens.push({
        price: strategy.breakeven,
        description: `Breakeven at ${strategy.breakeven}`
      });
      break;

    case 'iron_condor':
      // Two breakevens for iron condors
      result.breakevens.push({
        price: strategy.breakeven_lower,
        description: `Lower breakeven at ${strategy.breakeven_lower}`
      });
      result.breakevens.push({
        price: strategy.breakeven_upper,
        description: `Upper breakeven at ${strategy.breakeven_upper}`
      });
      result.profit_range = strategy.profit_range;
      break;

    case 'calendar_spread':
      // Calendar spreads are complex, breakeven is near the strike
      result.breakevens.push({
        price: strategy.strike,
        description: `Max profit near ${strategy.strike} at near expiration`
      });
      break;

    default:
      result.breakevens.push({
        price: null,
        description: 'Breakeven calculation not available for this strategy type'
      });
  }

  return result;
}

/**
 * Calculate time decay (theta) impact on strategy
 * @param {Object} strategy - Strategy with Greeks
 * @param {number} days - Number of days forward
 * @param {number} contracts - Number of contracts
 * @returns {Object} Time decay analysis
 */
export function calculateTimeDecay(strategy, days = 7, contracts = 1) {
  const multiplier = 100;

  // Calculate net theta (how much strategy gains/loses per day)
  const netTheta = strategy.legs.reduce((sum, leg) => {
    const theta = leg.theta || 0; // Use actual theta value, fallback to 0 if missing
    if (leg.action === 'buy') {
      return sum + theta;
    } else {
      return sum - theta;
    }
  }, 0);

  const dailyDecay = netTheta * multiplier * contracts;
  const totalDecay = dailyDecay * days;

  return {
    net_theta: parseFloat(netTheta.toFixed(4)),
    daily_decay_per_contract: parseFloat((netTheta * multiplier).toFixed(2)),
    daily_decay_total: parseFloat(dailyDecay.toFixed(2)),
    decay_over_period: parseFloat(totalDecay.toFixed(2)),
    days: days,
    interpretation: dailyDecay > 0 ?
      `Strategy benefits from time decay (+$${dailyDecay.toFixed(2)}/day)` :
      `Strategy loses to time decay ($${dailyDecay.toFixed(2)}/day)`
  };
}

/**
 * Calculate expected value of strategy
 * @param {Object} strategy - Strategy object with probability
 * @param {number} contracts - Number of contracts
 * @returns {Object} Expected value analysis
 */
export function calculateExpectedValue(strategy, contracts = 1) {
  const multiplier = 100;
  const probProfit = strategy.probability_profit || 0.5;
  const probLoss = 1 - probProfit;

  const maxProfit = strategy.max_profit * multiplier * contracts;
  const maxLoss = strategy.max_risk * multiplier * contracts;

  const expectedValue = (maxProfit * probProfit) - (maxLoss * probLoss);
  const expectedReturn = maxLoss > 0 ? (expectedValue / maxLoss) * 100 : 0;

  return {
    probability_profit: probProfit,
    probability_loss: probLoss,
    max_profit: parseFloat(maxProfit.toFixed(2)),
    max_loss: parseFloat(maxLoss.toFixed(2)),
    expected_value: parseFloat(expectedValue.toFixed(2)),
    expected_return_pct: parseFloat(expectedReturn.toFixed(2)),
    interpretation: expectedValue > 0 ?
      `Positive expected value of $${expectedValue.toFixed(2)}` :
      `Negative expected value of $${Math.abs(expectedValue).toFixed(2)}`
  };
}

/**
 * Generate comprehensive P&L report for a strategy
 * @param {Object} strategy - Strategy object
 * @param {number} contracts - Number of contracts
 * @param {Object} options - Additional options
 * @returns {Object} Comprehensive P&L report
 */
export function generateComprehensivePnLReport(strategy, contracts = 1, options = {}) {
  const {
    currentPrice = strategy.underlying_price,
    targetPrices = null,
    daysToExpiry = 30
  } = options;

  // Calculate breakevens
  const breakevens = calculateBreakevens(strategy);

  // Generate P&L scenarios
  const scenarios = generatePnLScenarios(strategy, contracts, {
    currentPrice,
    priceRange: 0.25,
    numPoints: 13
  });

  // Calculate P&L at specific target prices if provided
  let targetAnalysis = null;
  if (targetPrices && Array.isArray(targetPrices)) {
    targetAnalysis = targetPrices.map(price => {
      const pnl = calculateSpreadPnL(strategy, price, contracts);
      return {
        target_price: price,
        ...pnl
      };
    });
  }

  // Calculate expected value
  const expectedValue = calculateExpectedValue(strategy, contracts);

  // Calculate time decay
  const timeDecay = calculateTimeDecay(strategy, Math.min(daysToExpiry, 30), contracts);

  // Identify key price levels
  const keyLevels = identifyKeyPriceLevels(strategy, scenarios, currentPrice);

  return {
    strategy_name: strategy.strategy_name || strategy.type,
    strategy_type: strategy.type,
    contracts: contracts,
    current_price: currentPrice,
    expiration: strategy.expiration,

    risk_reward: {
      max_profit: strategy.max_profit * 100 * contracts,
      max_risk: strategy.max_risk * 100 * contracts,
      ratio: strategy.risk_reward
    },

    breakeven_analysis: breakevens,

    expected_value: expectedValue,

    time_decay: timeDecay,

    price_scenarios: scenarios,

    target_price_analysis: targetAnalysis,

    key_price_levels: keyLevels,

    summary: {
      recommendation: generateRecommendation(strategy, expectedValue, currentPrice),
      optimal_exit_price: findOptimalExit(scenarios),
      stop_loss_price: findStopLoss(strategy, currentPrice)
    }
  };
}

/**
 * Identify key price levels from P&L scenarios
 * @param {Object} strategy - Strategy object
 * @param {Array} scenarios - P&L scenarios
 * @param {number} currentPrice - Current underlying price
 * @returns {Object} Key price levels
 */
function identifyKeyPriceLevels(strategy, scenarios, currentPrice) {
  // Find max profit price
  const maxProfitScenario = scenarios.reduce((max, s) =>
    s.pnl > max.pnl ? s : max, scenarios[0]);

  // Find max loss price
  const maxLossScenario = scenarios.reduce((min, s) =>
    s.pnl < min.pnl ? s : min, scenarios[0]);

  // Find at-the-money scenario
  const atmScenario = scenarios.reduce((closest, s) =>
    Math.abs(s.price - currentPrice) < Math.abs(closest.price - currentPrice) ? s : closest,
    scenarios[0]
  );

  return {
    current_price: {
      price: currentPrice,
      pnl_at_current: atmScenario.pnl
    },
    max_profit_price: {
      price: maxProfitScenario.price,
      pnl: maxProfitScenario.pnl,
      move_required_pct: maxProfitScenario.price_change_pct
    },
    max_loss_price: {
      price: maxLossScenario.price,
      pnl: maxLossScenario.pnl,
      move_required_pct: maxLossScenario.price_change_pct
    }
  };
}

/**
 * Generate trading recommendation
 * @param {Object} strategy - Strategy object
 * @param {Object} expectedValue - EV analysis
 * @param {number} currentPrice - Current price
 * @returns {string} Recommendation
 */
function generateRecommendation(strategy, expectedValue, currentPrice) {
  const recommendations = [];

  if (expectedValue.expected_value > 0 && strategy.risk_reward >= 2) {
    recommendations.push('STRONG BUY - Positive EV with good risk/reward');
  } else if (expectedValue.expected_value > 0) {
    recommendations.push('BUY - Positive expected value');
  } else if (strategy.risk_reward >= 3) {
    recommendations.push('CONSIDER - High risk/reward but check probability assumptions');
  } else {
    recommendations.push('PASS - Negative expected value or poor risk/reward');
  }

  // Add directional guidance
  if (strategy.type === 'bull_call_spread' && strategy.breakeven) {
    const moveNeeded = ((strategy.breakeven - currentPrice) / currentPrice * 100).toFixed(1);
    recommendations.push(`Needs ${moveNeeded}% move to breakeven`);
  } else if (strategy.type === 'bear_put_spread' && strategy.breakeven) {
    const moveNeeded = ((currentPrice - strategy.breakeven) / currentPrice * 100).toFixed(1);
    recommendations.push(`Needs ${moveNeeded}% down move to breakeven`);
  } else if (strategy.type === 'iron_condor') {
    recommendations.push(`Profit if price stays between ${strategy.profit_range}`);
  }

  return recommendations.join('. ');
}

/**
 * Find optimal exit price from scenarios
 * @param {Array} scenarios - P&L scenarios
 * @returns {number} Optimal exit price
 */
function findOptimalExit(scenarios) {
  const maxProfitScenario = scenarios.reduce((max, s) =>
    s.pnl > max.pnl ? s : max, scenarios[0]);
  return maxProfitScenario.price;
}

/**
 * Calculate stop loss price
 * @param {Object} strategy - Strategy object
 * @param {number} currentPrice - Current price
 * @returns {number} Stop loss price
 */
function findStopLoss(strategy, currentPrice) {
  // Stop loss at 50% of max risk or significant technical level
  if (strategy.type === 'bull_call_spread') {
    // Stop if price drops below long strike
    return strategy.legs[0].strike;
  } else if (strategy.type === 'bear_put_spread') {
    // Stop if price rises above long strike
    return strategy.legs[0].strike;
  } else {
    // Generic stop at 50% of range
    return parseFloat((currentPrice * 0.95).toFixed(2));
  }
}

/**
 * Calculate portfolio-level P&L scenarios
 * @param {Array} strategies - Array of strategies with contracts
 * @param {Object} options - Configuration options
 * @returns {Object} Portfolio P&L analysis
 */
export function calculatePortfolioPnL(strategies, options = {}) {
  const {
    currentPrice,
    priceRange = 0.20,
    numPoints = 11
  } = options;

  if (!strategies || strategies.length === 0) {
    return {
      scenarios: [],
      summary: {
        max_profit: 0,
        max_loss: 0,
        total_capital: 0
      }
    };
  }

  // Generate price points
  const basePrice = currentPrice || strategies[0].underlying_price;
  const minPrice = basePrice * (1 - priceRange);
  const maxPrice = basePrice * (1 + priceRange);
  const step = (maxPrice - minPrice) / (numPoints - 1);

  const portfolioScenarios = [];

  for (let i = 0; i < numPoints; i++) {
    const price = minPrice + (step * i);
    let totalPnL = 0;

    strategies.forEach(strategy => {
      const contracts = strategy.position_sizing?.recommended_contracts || 1;
      const pnl = calculateSpreadPnL(strategy, price, contracts);
      totalPnL += pnl.total_pnl;
    });

    portfolioScenarios.push({
      price: parseFloat(price.toFixed(2)),
      price_change_pct: parseFloat(((price - basePrice) / basePrice * 100).toFixed(2)),
      total_pnl: parseFloat(totalPnL.toFixed(2))
    });
  }

  const maxProfit = Math.max(...portfolioScenarios.map(s => s.total_pnl));
  const maxLoss = Math.min(...portfolioScenarios.map(s => s.total_pnl));
  const totalCapital = strategies.reduce((sum, s) =>
    sum + (s.position_sizing?.total_cost || 0), 0);

  return {
    scenarios: portfolioScenarios,
    summary: {
      max_profit: parseFloat(maxProfit.toFixed(2)),
      max_loss: parseFloat(maxLoss.toFixed(2)),
      total_capital: parseFloat(totalCapital.toFixed(2)),
      max_return_pct: totalCapital > 0 ?
        parseFloat((maxProfit / totalCapital * 100).toFixed(2)) : 0,
      max_loss_pct: totalCapital > 0 ?
        parseFloat((maxLoss / totalCapital * 100).toFixed(2)) : 0
    }
  };
}
