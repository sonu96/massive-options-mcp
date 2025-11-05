/**
 * Stress Testing Module
 *
 * Simulates portfolio performance under various market scenarios
 * to understand worst-case outcomes before they happen.
 */

import { calculateScenarioPnL } from './portfolio-greeks.js';

/**
 * Predefined stress test scenarios
 */
export const STRESS_SCENARIOS = {
  MARKET_CRASH_MILD: {
    name: 'Market Crash (Mild)',
    price_move_pct: -0.05, // -5%
    iv_change_pts: 10, // +10% IV
    days_forward: 0,
    description: 'Typical correction with moderate volatility spike'
  },
  MARKET_CRASH_SEVERE: {
    name: 'Market Crash (Severe)',
    price_move_pct: -0.15, // -15%
    iv_change_pts: 30, // +30% IV
    days_forward: 0,
    description: 'Major selloff with extreme volatility'
  },
  FLASH_CRASH: {
    name: 'Flash Crash',
    price_move_pct: -0.10, // -10%
    iv_change_pts: 50, // +50% IV (VIX spike)
    days_forward: 0,
    description: 'Sudden dramatic drop with volatility explosion'
  },
  VOLATILITY_CRUSH: {
    name: 'Volatility Crush',
    price_move_pct: 0.02, // +2%
    iv_change_pts: -20, // -20% IV
    days_forward: 1,
    description: 'Post-event IV collapse (e.g., after earnings)'
  },
  SLOW_BLEED: {
    name: 'Slow Bleed',
    price_move_pct: -0.02, // -2%
    iv_change_pts: 0,
    days_forward: 7,
    description: 'Gradual decline with time decay'
  },
  RALLY: {
    name: 'Strong Rally',
    price_move_pct: 0.10, // +10%
    iv_change_pts: -10, // -10% IV
    days_forward: 0,
    description: 'Sharp upward move with reduced volatility'
  },
  SIDEWAYS: {
    name: 'Sideways Grind',
    price_move_pct: 0, // No move
    iv_change_pts: -5, // -5% IV
    days_forward: 14,
    description: 'Range-bound market with declining volatility'
  },
  WHIPSAW: {
    name: 'Whipsaw',
    price_move_pct: 0, // End flat
    iv_change_pts: 15, // +15% IV
    days_forward: 3,
    description: 'High volatility with no directional movement'
  }
};

/**
 * Run stress test on portfolio
 * @param {object} portfolioGreeks - Portfolio Greeks from calculatePortfolioGreeks
 * @param {Array} scenarios - Array of scenario names or custom scenarios
 * @param {object} config - Additional configuration
 * @returns {object} Stress test results
 */
export function runStressTest(portfolioGreeks, scenarios = null, config = {}) {
  const {
    include_custom_scenarios = true,
    sort_by = 'pnl' // Sort by P&L (worst first)
  } = config;

  // Use predefined scenarios if none provided
  const scenariosToTest = scenarios || Object.keys(STRESS_SCENARIOS);

  const results = [];

  scenariosToTest.forEach(scenarioKey => {
    const scenario = typeof scenarioKey === 'string' ?
      STRESS_SCENARIOS[scenarioKey] : scenarioKey;

    if (!scenario) return;

    const pnlResult = calculateScenarioPnL(portfolioGreeks, {
      price_move_pct: scenario.price_move_pct,
      iv_change_pts: scenario.iv_change_pts,
      days_forward: scenario.days_forward
    });

    results.push({
      scenario: scenario.name || scenarioKey,
      description: scenario.description,
      parameters: {
        price_move: `${(scenario.price_move_pct * 100).toFixed(1)}%`,
        iv_change: `${scenario.iv_change_pts > 0 ? '+' : ''}${scenario.iv_change_pts}pts`,
        time_period: `${scenario.days_forward} days`
      },
      estimated_pnl: pnlResult.total_estimated_pnl,
      pnl_breakdown: pnlResult.pnl_breakdown,
      severity: categorizeSeverity(pnlResult.total_estimated_pnl, portfolioGreeks)
    });
  });

  // Sort by P&L (worst case first)
  if (sort_by === 'pnl') {
    results.sort((a, b) => a.estimated_pnl - b.estimated_pnl);
  }

  // Find worst case
  const worstCase = results[0];
  const bestCase = results[results.length - 1];

  return {
    total_scenarios_tested: results.length,
    worst_case: {
      scenario: worstCase.scenario,
      estimated_loss: worstCase.estimated_pnl,
      description: worstCase.description
    },
    best_case: {
      scenario: bestCase.scenario,
      estimated_gain: bestCase.estimated_pnl,
      description: bestCase.description
    },
    scenarios: results,
    summary: generateStressSummary(results, portfolioGreeks),
    recommendations: generateStressRecommendations(results, portfolioGreeks)
  };
}

/**
 * Categorize P&L severity
 * @param {number} pnl - Estimated P&L
 * @param {object} portfolioGreeks - Portfolio Greeks
 * @returns {string} Severity level
 */
function categorizeSeverity(pnl, portfolioGreeks) {
  // Estimate rough portfolio value from Greeks (approximation)
  const estimatedValue = Math.abs(portfolioGreeks.net_delta) * 10 || 1000;

  const lossPct = pnl / estimatedValue;

  if (lossPct < -0.20) return 'CATASTROPHIC';
  if (lossPct < -0.10) return 'SEVERE';
  if (lossPct < -0.05) return 'MODERATE';
  if (lossPct < 0) return 'MINOR';
  if (lossPct > 0.10) return 'HIGHLY_POSITIVE';
  if (lossPct > 0.05) return 'POSITIVE';
  return 'NEUTRAL';
}

/**
 * Generate stress test summary
 * @param {Array} results - Stress test results
 * @param {object} portfolioGreeks - Portfolio Greeks
 * @returns {string} Summary
 */
function generateStressSummary(results, portfolioGreeks) {
  const catastrophicScenarios = results.filter(r => r.severity === 'CATASTROPHIC' || r.severity === 'SEVERE');
  const positiveScenarios = results.filter(r => r.estimated_pnl > 0);

  const parts = [];

  parts.push(`Tested ${results.length} market scenarios`);

  if (catastrophicScenarios.length > 0) {
    parts.push(`${catastrophicScenarios.length} scenarios result in severe losses`);
  }

  parts.push(`${positiveScenarios.length} scenarios are profitable`);

  const avgPnL = results.reduce((sum, r) => sum + r.estimated_pnl, 0) / results.length;
  parts.push(`Average outcome: ${avgPnL > 0 ? '+' : ''}$${avgPnL.toFixed(0)}`);

  return parts.join('. ');
}

/**
 * Generate recommendations based on stress test
 * @param {Array} results - Stress test results
 * @param {object} portfolioGreeks - Portfolio Greeks
 * @returns {Array} Recommendations
 */
function generateStressRecommendations(results, portfolioGreeks) {
  const recommendations = [];
  const worstCase = results[0];

  // Check for catastrophic downside
  if (worstCase.severity === 'CATASTROPHIC' || worstCase.severity === 'SEVERE') {
    recommendations.push({
      priority: 'HIGH',
      type: 'HEDGE_DOWNSIDE',
      message: `Worst case (${worstCase.scenario}) shows ${worstCase.estimated_pnl.toFixed(0)} loss`,
      action: 'Consider protective puts or reducing position sizes'
    });
  }

  // Check for high gamma risk
  if (Math.abs(portfolioGreeks.net_gamma) > 10) {
    const gammaDirection = portfolioGreeks.net_gamma > 0 ? 'positive' : 'negative';
    recommendations.push({
      priority: 'MEDIUM',
      type: 'GAMMA_RISK',
      message: `High ${gammaDirection} gamma means accelerated P&L changes`,
      action: gammaDirection === 'negative' ?
        'Consider adding long options for gamma protection' :
        'Positive gamma benefits from volatility - can keep as-is'
    });
  }

  // Check for theta dependency
  const slowBleed = results.find(r => r.scenario === 'Slow Bleed');
  if (slowBleed && slowBleed.estimated_pnl < -100) {
    recommendations.push({
      priority: 'MEDIUM',
      type: 'TIME_DECAY_RISK',
      message: 'Portfolio loses significantly in sideways market',
      action: 'Need directional movement soon or consider closing long options'
    });
  }

  // Check for volatility crush vulnerability
  const volCrush = results.find(r => r.scenario === 'Volatility Crush');
  if (volCrush && volCrush.estimated_pnl < -200) {
    recommendations.push({
      priority: 'MEDIUM',
      type: 'VEGA_RISK',
      message: 'Vulnerable to IV collapse',
      action: 'Avoid holding through events (earnings, FOMC) that could crush IV'
    });
  }

  // Positive recommendation if portfolio is well-balanced
  const severeCount = results.filter(r =>
    r.severity === 'CATASTROPHIC' || r.severity === 'SEVERE'
  ).length;

  if (severeCount === 0) {
    recommendations.push({
      priority: 'LOW',
      type: 'WELL_POSITIONED',
      message: 'Portfolio shows resilience across scenarios',
      action: 'Current positioning appears balanced'
    });
  }

  return recommendations;
}

/**
 * Custom scenario builder
 * @param {string} name - Scenario name
 * @param {object} parameters - Scenario parameters
 * @returns {object} Custom scenario
 */
export function createCustomScenario(name, parameters = {}) {
  return {
    name,
    price_move_pct: parameters.price_move_pct || 0,
    iv_change_pts: parameters.iv_change_pts || 0,
    days_forward: parameters.days_forward || 0,
    description: parameters.description || 'Custom scenario'
  };
}

/**
 * Run Monte Carlo simulation (simplified)
 * @param {object} portfolioGreeks - Portfolio Greeks
 * @param {object} config - Monte Carlo configuration
 * @returns {object} Simulation results
 */
export function runMonteCarloSimulation(portfolioGreeks, config = {}) {
  const {
    num_simulations = 1000,
    days_forward = 30,
    daily_volatility = 0.01, // 1% daily vol
    iv_volatility = 2 // 2% daily IV change
  } = config;

  const results = [];

  for (let i = 0; i < num_simulations; i++) {
    // Random walk price movement
    let cumulativeMove = 0;
    let cumulativeIVChange = 0;

    for (let day = 0; day < days_forward; day++) {
      const randomMove = (Math.random() - 0.5) * 2 * daily_volatility;
      const randomIVChange = (Math.random() - 0.5) * 2 * iv_volatility;
      cumulativeMove += randomMove;
      cumulativeIVChange += randomIVChange;
    }

    const pnl = calculateScenarioPnL(portfolioGreeks, {
      price_move_pct: cumulativeMove,
      iv_change_pts: cumulativeIVChange,
      days_forward
    });

    results.push(pnl.total_estimated_pnl);
  }

  // Calculate statistics
  results.sort((a, b) => a - b);

  const mean = results.reduce((sum, val) => sum + val, 0) / results.length;
  const var95 = results[Math.floor(results.length * 0.05)]; // 5th percentile
  const var99 = results[Math.floor(results.length * 0.01)]; // 1st percentile
  const median = results[Math.floor(results.length * 0.5)];

  return {
    simulations_run: num_simulations,
    time_horizon_days: days_forward,
    statistics: {
      mean_pnl: parseFloat(mean.toFixed(2)),
      median_pnl: parseFloat(median.toFixed(2)),
      best_case: parseFloat(results[results.length - 1].toFixed(2)),
      worst_case: parseFloat(results[0].toFixed(2)),
      var_95: parseFloat(var95.toFixed(2)), // 95% confident won't lose more than this
      var_99: parseFloat(var99.toFixed(2)) // 99% confident won't lose more than this
    },
    distribution: {
      profitable: results.filter(r => r > 0).length,
      breakeven: results.filter(r => Math.abs(r) < 10).length,
      losing: results.filter(r => r < 0).length
    },
    interpretation: `95% confident portfolio won't lose more than $${Math.abs(var95).toFixed(0)} over next ${days_forward} days`
  };
}

export default {
  STRESS_SCENARIOS,
  runStressTest,
  createCustomScenario,
  runMonteCarloSimulation
};
