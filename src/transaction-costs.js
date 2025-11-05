/**
 * Transaction Cost Modeling
 *
 * Calculates real-world costs of options trading including:
 * - Broker commissions
 * - Bid-ask spread slippage
 * - Market impact
 *
 * Critical for accurate P&L calculations and profitability analysis.
 */

/**
 * Standard transaction cost configuration
 */
export const COST_CONFIG = {
  // Commission per contract (typical retail broker)
  commission_per_contract: 0.65,

  // Regulatory fees per contract (SEC + exchange)
  regulatory_fees: 0.05,

  // Bid-ask spread capture rate (how much of spread you pay)
  // 0.5 = pay halfway between bid and ask (realistic for limit orders)
  // 1.0 = pay full ask when buying, full bid when selling (market orders)
  spread_capture_rate: 0.5,

  // Market impact for large orders (additional slippage %)
  market_impact_threshold: 10, // contracts
  market_impact_rate: 0.02, // 2% additional slippage for large orders
};

/**
 * Calculate entry cost for buying options
 * @param {number} theoreticalPrice - Mid price or theoretical value
 * @param {number} bidPrice - Current bid price
 * @param {number} askPrice - Current ask price
 * @param {number} contracts - Number of contracts
 * @param {object} config - Cost configuration (optional)
 * @returns {object} Entry cost breakdown
 */
export function calculateEntryCost(theoreticalPrice, bidPrice, askPrice, contracts = 1, config = COST_CONFIG) {
  const spread = askPrice - bidPrice;
  const spreadCost = spread * config.spread_capture_rate;

  // Actual entry price (paying closer to ask)
  const entryPrice = bidPrice + spreadCost;

  // Commission and fees
  const commission = contracts * config.commission_per_contract;
  const regulatoryFees = contracts * config.regulatory_fees;

  // Market impact for large orders
  let marketImpact = 0;
  if (contracts >= config.market_impact_threshold) {
    marketImpact = theoreticalPrice * config.market_impact_rate * contracts;
  }

  const totalCost = (entryPrice * contracts * 100) + commission + regulatoryFees + marketImpact;
  const costPerContract = totalCost / contracts;

  return {
    theoretical_price: theoreticalPrice,
    bid: bidPrice,
    ask: askPrice,
    entry_price: parseFloat(entryPrice.toFixed(2)),
    spread: parseFloat(spread.toFixed(2)),
    spread_cost: parseFloat(spreadCost.toFixed(2)),
    commission: parseFloat(commission.toFixed(2)),
    regulatory_fees: parseFloat(regulatoryFees.toFixed(2)),
    market_impact: parseFloat(marketImpact.toFixed(2)),
    total_entry_cost: parseFloat(totalCost.toFixed(2)),
    cost_per_contract: parseFloat(costPerContract.toFixed(2)),
    contracts: contracts
  };
}

/**
 * Calculate exit cost for selling options
 * @param {number} theoreticalPrice - Mid price or theoretical value
 * @param {number} bidPrice - Current bid price
 * @param {number} askPrice - Current ask price
 * @param {number} contracts - Number of contracts
 * @param {object} config - Cost configuration (optional)
 * @returns {object} Exit cost breakdown
 */
export function calculateExitCost(theoreticalPrice, bidPrice, askPrice, contracts = 1, config = COST_CONFIG) {
  const spread = askPrice - bidPrice;
  const spreadCost = spread * config.spread_capture_rate;

  // Actual exit price (receiving closer to bid)
  const exitPrice = askPrice - spreadCost;

  // Commission and fees
  const commission = contracts * config.commission_per_contract;
  const regulatoryFees = contracts * config.regulatory_fees;

  // Market impact for large orders
  let marketImpact = 0;
  if (contracts >= config.market_impact_threshold) {
    marketImpact = theoreticalPrice * config.market_impact_rate * contracts;
  }

  const totalProceeds = (exitPrice * contracts * 100) - commission - regulatoryFees - marketImpact;
  const proceedsPerContract = totalProceeds / contracts;

  return {
    theoretical_price: theoreticalPrice,
    bid: bidPrice,
    ask: askPrice,
    exit_price: parseFloat(exitPrice.toFixed(2)),
    spread: parseFloat(spread.toFixed(2)),
    spread_cost: parseFloat(spreadCost.toFixed(2)),
    commission: parseFloat(commission.toFixed(2)),
    regulatory_fees: parseFloat(regulatoryFees.toFixed(2)),
    market_impact: parseFloat(marketImpact.toFixed(2)),
    total_proceeds: parseFloat(totalProceeds.toFixed(2)),
    proceeds_per_contract: parseFloat(proceedsPerContract.toFixed(2)),
    contracts: contracts
  };
}

/**
 * Calculate round-trip transaction costs (buy + sell)
 * @param {number} entryPrice - Entry mid price
 * @param {number} entryBid - Entry bid
 * @param {number} entryAsk - Entry ask
 * @param {number} exitPrice - Exit mid price
 * @param {number} exitBid - Exit bid
 * @param {number} exitAsk - Exit ask
 * @param {number} contracts - Number of contracts
 * @param {object} config - Cost configuration (optional)
 * @returns {object} Round-trip cost analysis
 */
export function calculateRoundTripCosts(
  entryPrice, entryBid, entryAsk,
  exitPrice, exitBid, exitAsk,
  contracts = 1,
  config = COST_CONFIG
) {
  const entryCost = calculateEntryCost(entryPrice, entryBid, entryAsk, contracts, config);
  const exitCost = calculateExitCost(exitPrice, exitBid, exitAsk, contracts, config);

  const theoreticalProfit = (exitPrice - entryPrice) * contracts * 100;
  const realProfit = exitCost.total_proceeds - entryCost.total_entry_cost;
  const totalCosts = entryCost.total_entry_cost - (entryPrice * contracts * 100) +
                     (exitPrice * contracts * 100) - exitCost.total_proceeds;

  return {
    entry: entryCost,
    exit: exitCost,
    theoretical_profit: parseFloat(theoreticalProfit.toFixed(2)),
    real_profit: parseFloat(realProfit.toFixed(2)),
    total_transaction_costs: parseFloat(totalCosts.toFixed(2)),
    cost_impact_pct: theoreticalProfit !== 0 ?
      parseFloat(((totalCosts / Math.abs(theoreticalProfit)) * 100).toFixed(2)) : 0,
    interpretation: theoreticalProfit > 0 && realProfit < 0 ?
      'CAUTION: Theoretical profit erased by transaction costs' :
      realProfit > 0 ? 'Profitable after costs' : 'Loss after costs'
  };
}

/**
 * Calculate spread quality score (0-100)
 * Lower is better for trading
 * @param {number} bid - Bid price
 * @param {number} ask - Ask price
 * @returns {object} Spread analysis
 */
export function analyzeBidAskSpread(bid, ask) {
  const mid = (bid + ask) / 2;
  const spread = ask - bid;
  const spreadPct = (spread / mid) * 100;

  let quality, recommendation;
  if (spreadPct < 3) {
    quality = 'EXCELLENT';
    recommendation = 'Very tight spread - good for trading';
  } else if (spreadPct < 7) {
    quality = 'GOOD';
    recommendation = 'Acceptable spread - tradeable';
  } else if (spreadPct < 15) {
    quality = 'FAIR';
    recommendation = 'Wide spread - use limit orders';
  } else {
    quality = 'POOR';
    recommendation = 'Very wide spread - avoid if possible';
  }

  return {
    bid,
    ask,
    mid: parseFloat(mid.toFixed(2)),
    spread: parseFloat(spread.toFixed(2)),
    spread_pct: parseFloat(spreadPct.toFixed(2)),
    quality,
    recommendation,
    tradeable: spreadPct < 15 // Don't trade if spread > 15%
  };
}

/**
 * Adjust strategy P&L for transaction costs
 * @param {object} strategy - Strategy object with max_profit, max_loss
 * @param {number} contracts - Number of contracts
 * @param {number} legs - Number of option legs in strategy
 * @param {object} config - Cost configuration (optional)
 * @returns {object} Adjusted P&L
 */
export function adjustStrategyForCosts(strategy, contracts = 1, legs = 2, config = COST_CONFIG) {
  // Estimate total costs for multi-leg strategy
  // Entry: commission + fees per leg
  const entryCommission = legs * contracts * config.commission_per_contract;
  const entryFees = legs * contracts * config.regulatory_fees;

  // Exit: same costs
  const exitCommission = legs * contracts * config.commission_per_contract;
  const exitFees = legs * contracts * config.regulatory_fees;

  // Estimate spread costs (assume 5% average spread, 50% capture)
  const estimatedSpreadCost = (strategy.max_profit || 0) * 0.025 * legs;

  const totalCosts = entryCommission + entryFees + exitCommission + exitFees + estimatedSpreadCost;

  const adjustedMaxProfit = (strategy.max_profit || 0) - totalCosts;
  const adjustedMaxLoss = (strategy.max_loss || 0) + totalCosts;

  // Recalculate R:R ratio
  const adjustedRR = adjustedMaxLoss !== 0 ?
    parseFloat((adjustedMaxProfit / adjustedMaxLoss).toFixed(2)) : 0;

  return {
    ...strategy,
    original_max_profit: strategy.max_profit,
    original_max_loss: strategy.max_loss,
    original_rr: strategy.risk_reward_ratio,
    max_profit: parseFloat(adjustedMaxProfit.toFixed(2)),
    max_loss: parseFloat(adjustedMaxLoss.toFixed(2)),
    risk_reward_ratio: adjustedRR,
    transaction_costs: parseFloat(totalCosts.toFixed(2)),
    cost_breakdown: {
      entry_commission: parseFloat(entryCommission.toFixed(2)),
      entry_fees: parseFloat(entryFees.toFixed(2)),
      exit_commission: parseFloat(exitCommission.toFixed(2)),
      exit_fees: parseFloat(exitFees.toFixed(2)),
      estimated_spread_cost: parseFloat(estimatedSpreadCost.toFixed(2))
    },
    profit_reduction_pct: strategy.max_profit ?
      parseFloat(((totalCosts / strategy.max_profit) * 100).toFixed(2)) : 0
  };
}

/**
 * Calculate true expected value after costs
 * @param {number} theoreticalEV - Theoretical expected value
 * @param {number} winProbability - Probability of winning (0-1)
 * @param {number} avgWin - Average win amount
 * @param {number} avgLoss - Average loss amount
 * @param {number} contracts - Number of contracts
 * @param {number} legs - Number of legs
 * @param {object} config - Cost configuration
 * @returns {object} True EV analysis
 */
export function calculateTrueExpectedValue(
  theoreticalEV,
  winProbability,
  avgWin,
  avgLoss,
  contracts = 1,
  legs = 2,
  config = COST_CONFIG
) {
  // Estimate total round-trip costs
  const totalCommission = legs * 2 * contracts * config.commission_per_contract;
  const totalFees = legs * 2 * contracts * config.regulatory_fees;
  const estimatedSpreadCost = Math.max(avgWin, Math.abs(avgLoss)) * 0.03 * legs;
  const totalCosts = totalCommission + totalFees + estimatedSpreadCost;

  // Recalculate EV with costs
  const trueEV = (winProbability * (avgWin - totalCosts)) +
                 ((1 - winProbability) * (avgLoss - totalCosts));

  return {
    theoretical_ev: parseFloat(theoreticalEV.toFixed(2)),
    true_ev: parseFloat(trueEV.toFixed(2)),
    transaction_costs: parseFloat(totalCosts.toFixed(2)),
    ev_reduction: parseFloat((theoreticalEV - trueEV).toFixed(2)),
    ev_reduction_pct: theoreticalEV !== 0 ?
      parseFloat((((theoreticalEV - trueEV) / theoreticalEV) * 100).toFixed(2)) : 0,
    recommendation: trueEV > 0 ?
      'Positive expected value after costs' :
      'Negative expected value - avoid this trade'
  };
}

export default {
  COST_CONFIG,
  calculateEntryCost,
  calculateExitCost,
  calculateRoundTripCosts,
  analyzeBidAskSpread,
  adjustStrategyForCosts,
  calculateTrueExpectedValue
};
