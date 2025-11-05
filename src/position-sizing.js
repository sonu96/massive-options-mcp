// Position sizing and risk management module
// Calculates optimal position sizes based on account size and risk parameters

import { adjustStrategyForCosts, calculateTrueExpectedValue } from './transaction-costs.js';

/**
 * Calculate position size for a strategy
 * @param {Object} strategy - Strategy object with max_risk
 * @param {number} accountSize - Total account size
 * @param {Object} riskConfig - Risk configuration
 * @param {boolean} includeCosts - Whether to include transaction costs (default: true)
 * @returns {Object} Position sizing recommendation
 */
export function calculatePositionSize(strategy, accountSize, riskConfig = {}, includeCosts = true) {
  const {
    max_risk_pct = 0.02, // Default 2% risk per trade
    min_reward_ratio = 2.0,
    min_prob_profit = 0.5,
    max_concentration = 0.40, // Max 40% in any position
    contract_multiplier = 100 // Standard options contract size
  } = riskConfig;

  // Adjust strategy for transaction costs if enabled
  let adjustedStrategy = strategy;
  let transactionCosts = null;

  if (includeCosts) {
    const numLegs = strategy.legs?.length || 2; // Default to 2 legs
    adjustedStrategy = adjustStrategyForCosts(strategy, 1, numLegs);
    transactionCosts = adjustedStrategy.transaction_costs;
  }

  // Validate strategy meets minimum criteria (using adjusted values)
  if (adjustedStrategy.risk_reward_ratio < min_reward_ratio) {
    return {
      recommended_contracts: 0,
      reason: `Risk/reward ratio ${adjustedStrategy.risk_reward_ratio.toFixed(2)} below minimum ${min_reward_ratio} ${includeCosts ? '(after transaction costs)' : ''}`,
      rejected: true,
      transaction_costs: transactionCosts
    };
  }

  if (strategy.probability_profit < min_prob_profit) {
    return {
      recommended_contracts: 0,
      reason: `Probability ${strategy.probability_profit} below minimum ${min_prob_profit}`,
      rejected: true,
      transaction_costs: transactionCosts
    };
  }

  // Calculate max risk amount in dollars
  const maxRiskDollars = accountSize * max_risk_pct;

  // Calculate max position size based on concentration limit
  const maxPositionDollars = accountSize * max_concentration;

  // Calculate contracts based on risk per contract (using adjusted max_loss)
  const riskPerContract = adjustedStrategy.max_loss * contract_multiplier;
  const contractsBasedOnRisk = Math.floor(maxRiskDollars / riskPerContract);

  // Calculate contracts based on concentration limit
  const totalCostPerContract = Math.abs(strategy.net_debit || strategy.net_credit) * contract_multiplier;
  const contractsBasedOnConcentration = Math.floor(maxPositionDollars / totalCostPerContract);

  // Use the more conservative limit
  const recommendedContracts = Math.min(contractsBasedOnRisk, contractsBasedOnConcentration);

  // Ensure at least 1 contract if strategy qualifies
  const finalContracts = Math.max(1, recommendedContracts);

  // Calculate actual dollar amounts (using adjusted values)
  const totalRisk = finalContracts * riskPerContract;
  const totalCost = finalContracts * totalCostPerContract;
  const potentialProfit = finalContracts * adjustedStrategy.max_profit * contract_multiplier;

  // Calculate total transaction costs for the position
  const totalTransactionCosts = includeCosts ? transactionCosts * finalContracts : 0;

  // Calculate true expected value with costs
  let trueEV = null;
  if (includeCosts) {
    const numLegs = strategy.legs?.length || 2;
    trueEV = calculateTrueExpectedValue(
      potentialProfit - totalRisk, // Theoretical EV
      strategy.probability_profit,
      adjustedStrategy.max_profit * contract_multiplier,
      adjustedStrategy.max_loss * contract_multiplier,
      finalContracts,
      numLegs
    );
  }

  // Calculate Kelly criterion (using adjusted risk/reward)
  const kellyFraction = calculateKellyCriterion(
    strategy.probability_profit,
    adjustedStrategy.risk_reward_ratio
  );

  return {
    recommended_contracts: finalContracts,
    total_cost: parseFloat(totalCost.toFixed(2)),
    total_risk: parseFloat(totalRisk.toFixed(2)),
    potential_profit: parseFloat(potentialProfit.toFixed(2)),
    risk_pct: parseFloat((totalRisk / accountSize * 100).toFixed(2)),
    position_pct: parseFloat((totalCost / accountSize * 100).toFixed(2)),
    kelly_fraction: parseFloat(kellyFraction.toFixed(3)),
    kelly_contracts: Math.max(1, Math.floor(accountSize * kellyFraction / totalCostPerContract)),
    rejected: false,
    limits_applied: {
      risk_based: contractsBasedOnRisk,
      concentration_based: contractsBasedOnConcentration,
      limiting_factor: contractsBasedOnRisk < contractsBasedOnConcentration ? 'risk' : 'concentration'
    },
    // Transaction cost details
    transaction_costs_included: includeCosts,
    transaction_costs_per_contract: transactionCosts,
    total_transaction_costs: parseFloat(totalTransactionCosts.toFixed(2)),
    true_expected_value: trueEV,
    // Show both original and adjusted values
    original_max_profit: strategy.max_profit ? parseFloat((strategy.max_profit * finalContracts * contract_multiplier).toFixed(2)) : null,
    original_max_loss: strategy.max_loss ? parseFloat((strategy.max_loss * finalContracts * contract_multiplier).toFixed(2)) : null,
    profit_after_costs: includeCosts ? potentialProfit : null,
    cost_impact_warning: includeCosts && transactionCosts && potentialProfit > 0 ?
      transactionCosts / (potentialProfit / finalContracts / contract_multiplier) > 0.2 ?
        'WARNING: Transaction costs exceed 20% of potential profit' : null : null
  };
}

/**
 * Validate and sanitize risk configuration parameters
 * @param {Object} riskConfig - User-provided risk configuration
 * @returns {Object} Validated and sanitized risk configuration
 */
export function validateRiskParameters(riskConfig = {}) {
  const validated = {};

  // Max risk per trade (0.5% to 10%)
  const maxRiskPct = riskConfig.max_risk_pct || 0.02;
  validated.max_risk_pct = Math.max(0.005, Math.min(0.10, maxRiskPct));
  if (maxRiskPct !== validated.max_risk_pct) {
    validated.warnings = validated.warnings || [];
    validated.warnings.push(`max_risk_pct adjusted to ${validated.max_risk_pct} (must be 0.5-10%)`);
  }

  // Minimum reward ratio (1.0 to 10.0)
  // Lowered default from 2.0 to 1.5 - more realistic for high-priced stocks
  const minRewardRatio = riskConfig.min_reward_ratio || 1.5;
  validated.min_reward_ratio = Math.max(1.0, Math.min(10.0, minRewardRatio));
  if (minRewardRatio !== validated.min_reward_ratio) {
    validated.warnings = validated.warnings || [];
    validated.warnings.push(`min_reward_ratio adjusted to ${validated.min_reward_ratio} (must be 1-10)`);
  }

  // Minimum probability of profit (0.3 to 0.95)
  // Lowered default from 0.5 to 0.45 - 45% win rate is still profitable with good R:R
  const minProbProfit = riskConfig.min_prob_profit || 0.45;
  validated.min_prob_profit = Math.max(0.3, Math.min(0.95, minProbProfit));
  if (minProbProfit !== validated.min_prob_profit) {
    validated.warnings = validated.warnings || [];
    validated.warnings.push(`min_prob_profit adjusted to ${validated.min_prob_profit} (must be 0.3-0.95)`);
  }

  // Max concentration (5% to 50%)
  const maxConcentration = riskConfig.max_concentration || 0.40;
  validated.max_concentration = Math.max(0.05, Math.min(0.50, maxConcentration));
  if (maxConcentration !== validated.max_concentration) {
    validated.warnings = validated.warnings || [];
    validated.warnings.push(`max_concentration adjusted to ${validated.max_concentration} (must be 5-50%)`);
  }

  // Contract multiplier (usually 100)
  validated.contract_multiplier = riskConfig.contract_multiplier || 100;

  return validated;
}

/**
 * Generate allocation report across multiple strategies
 * @param {Array} strategies - Array of strategies with position sizing
 * @param {number} accountSize - Total account size
 * @returns {Object} Portfolio allocation report
 */
export function generateAllocationReport(strategies, accountSize) {
  if (!strategies || strategies.length === 0) {
    return {
      total_strategies: 0,
      total_capital_allocated: 0,
      total_risk: 0,
      total_potential_profit: 0,
      allocation_pct: 0,
      risk_pct: 0,
      strategies: []
    };
  }

  // Calculate totals
  const totalCapital = strategies.reduce((sum, s) =>
    sum + (s.position_sizing?.total_cost || 0), 0);
  const totalRisk = strategies.reduce((sum, s) =>
    sum + (s.position_sizing?.total_risk || 0), 0);
  const totalPotentialProfit = strategies.reduce((sum, s) =>
    sum + (s.position_sizing?.potential_profit || 0), 0);

  // Calculate expected value
  const expectedValue = strategies.reduce((sum, s) => {
    const profit = s.position_sizing?.potential_profit || 0;
    const risk = s.position_sizing?.total_risk || 0;
    const prob = s.probability_profit || 0.5;
    return sum + (profit * prob - risk * (1 - prob));
  }, 0);

  // Group by strategy type
  const byType = {};
  strategies.forEach(s => {
    const type = s.type || 'unknown';
    if (!byType[type]) {
      byType[type] = {
        count: 0,
        capital: 0,
        risk: 0,
        potential_profit: 0
      };
    }
    byType[type].count++;
    byType[type].capital += s.position_sizing?.total_cost || 0;
    byType[type].risk += s.position_sizing?.total_risk || 0;
    byType[type].potential_profit += s.position_sizing?.potential_profit || 0;
  });

  // Group by expiration
  const byExpiration = {};
  strategies.forEach(s => {
    const exp = s.expiration || 'unknown';
    if (!byExpiration[exp]) {
      byExpiration[exp] = {
        count: 0,
        capital: 0,
        risk: 0,
        potential_profit: 0
      };
    }
    byExpiration[exp].count++;
    byExpiration[exp].capital += s.position_sizing?.total_cost || 0;
    byExpiration[exp].risk += s.position_sizing?.total_risk || 0;
    byExpiration[exp].potential_profit += s.position_sizing?.potential_profit || 0;
  });

  return {
    total_strategies: strategies.length,
    account_size: accountSize,
    total_capital_allocated: parseFloat(totalCapital.toFixed(2)),
    total_risk: parseFloat(totalRisk.toFixed(2)),
    total_potential_profit: parseFloat(totalPotentialProfit.toFixed(2)),
    expected_value: parseFloat(expectedValue.toFixed(2)),
    allocation_pct: parseFloat((totalCapital / accountSize * 100).toFixed(2)),
    risk_pct: parseFloat((totalRisk / accountSize * 100).toFixed(2)),
    portfolio_reward_ratio: parseFloat((totalPotentialProfit / totalRisk).toFixed(2)),
    diversification: {
      by_strategy_type: Object.entries(byType).map(([type, data]) => ({
        type,
        count: data.count,
        capital: parseFloat(data.capital.toFixed(2)),
        risk: parseFloat(data.risk.toFixed(2)),
        capital_pct: parseFloat((data.capital / totalCapital * 100).toFixed(2))
      })),
      by_expiration: Object.entries(byExpiration).map(([exp, data]) => ({
        expiration: exp,
        count: data.count,
        capital: parseFloat(data.capital.toFixed(2)),
        risk: parseFloat(data.risk.toFixed(2)),
        capital_pct: parseFloat((data.capital / totalCapital * 100).toFixed(2))
      }))
    },
    strategies: strategies.map(s => ({
      strategy_name: s.strategy_name || s.type,
      type: s.type,
      expiration: s.expiration,
      contracts: s.position_sizing?.recommended_contracts || 0,
      cost: s.position_sizing?.total_cost || 0,
      risk: s.position_sizing?.total_risk || 0,
      potential_profit: s.position_sizing?.potential_profit || 0,
      allocation_pct: parseFloat((s.position_sizing?.total_cost / totalCapital * 100).toFixed(2))
    }))
  };
}

/**
 * Calculate Kelly Criterion for optimal position sizing
 * @param {number} winProb - Probability of winning (0-1)
 * @param {number} winLossRatio - Ratio of win amount to loss amount
 * @returns {number} Kelly fraction (0-1)
 */
export function calculateKellyCriterion(winProb, winLossRatio) {
  if (winProb <= 0 || winProb >= 1 || winLossRatio <= 0) {
    return 0;
  }

  // Kelly formula: f = (bp - q) / b
  // where b = win/loss ratio, p = win probability, q = loss probability
  const b = winLossRatio;
  const p = winProb;
  const q = 1 - p;

  const kelly = (b * p - q) / b;

  // Use fractional Kelly (1/4 Kelly) for more conservative sizing
  const fractionalKelly = kelly * 0.25;

  // Ensure result is between 0 and 1
  return Math.max(0, Math.min(1, fractionalKelly));
}

/**
 * Analyze portfolio risk metrics
 * @param {Array} positions - Array of current positions with sizing
 * @param {number} accountSize - Total account size
 * @returns {Object} Risk analysis
 */
export function analyzePortfolioRisk(positions, accountSize) {
  if (!positions || positions.length === 0) {
    return {
      total_positions: 0,
      total_risk: 0,
      max_correlated_risk: 0,
      diversification_score: 0,
      risk_warnings: []
    };
  }

  const warnings = [];
  let totalRisk = 0;
  const riskByExpiration = {};

  // Calculate risks
  positions.forEach(pos => {
    const risk = pos.position_sizing?.total_risk || 0;
    totalRisk += risk;

    const exp = pos.expiration || 'unknown';
    riskByExpiration[exp] = (riskByExpiration[exp] || 0) + risk;
  });

  // Check concentration risk
  const maxExpirationRisk = Math.max(...Object.values(riskByExpiration));
  const concentrationRatio = maxExpirationRisk / totalRisk;

  if (concentrationRatio > 0.5) {
    warnings.push(`High concentration: ${(concentrationRatio * 100).toFixed(1)}% of risk in single expiration`);
  }

  if (totalRisk / accountSize > 0.20) {
    warnings.push(`Total portfolio risk ${(totalRisk / accountSize * 100).toFixed(1)}% exceeds recommended 20%`);
  }

  // Calculate diversification score (0-100)
  const numExpirations = Object.keys(riskByExpiration).length;
  const numStrategies = new Set(positions.map(p => p.type)).size;
  const diversificationScore = Math.min(100,
    (numExpirations * 20) + (numStrategies * 20) + ((1 - concentrationRatio) * 60)
  );

  return {
    total_positions: positions.length,
    total_risk: parseFloat(totalRisk.toFixed(2)),
    total_risk_pct: parseFloat((totalRisk / accountSize * 100).toFixed(2)),
    max_correlated_risk: parseFloat(maxExpirationRisk.toFixed(2)),
    concentration_ratio: parseFloat(concentrationRatio.toFixed(2)),
    diversification_score: parseFloat(diversificationScore.toFixed(1)),
    unique_expirations: numExpirations,
    unique_strategies: numStrategies,
    risk_by_expiration: Object.entries(riskByExpiration).map(([exp, risk]) => ({
      expiration: exp,
      risk: parseFloat(risk.toFixed(2)),
      risk_pct: parseFloat((risk / totalRisk * 100).toFixed(2))
    })),
    risk_warnings: warnings
  };
}
