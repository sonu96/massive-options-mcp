/**
 * Portfolio Greek Aggregation
 *
 * Aggregates Greeks (delta, gamma, theta, vega) across all positions
 * to provide portfolio-level risk visibility.
 *
 * Critical for preventing hidden exposure accumulation.
 */

/**
 * Calculate portfolio-level Greeks from multiple positions
 * @param {Array} positions - Array of positions with option legs
 * @param {object} config - Configuration options
 * @returns {object} Portfolio Greeks and risk analysis
 */
export function calculatePortfolioGreeks(positions = [], config = {}) {
  const {
    contract_multiplier = 100,
    // Risk limits (optional)
    max_delta = 1000,
    max_gamma = 50,
    max_theta = null, // null = no limit
    max_vega = 1000
  } = config;

  if (!positions || positions.length === 0) {
    return {
      total_positions: 0,
      net_delta: 0,
      net_gamma: 0,
      net_theta: 0,
      net_vega: 0,
      net_rho: 0,
      directional_bias: 'neutral',
      volatility_bias: 'neutral',
      time_decay_bias: 'neutral',
      warnings: [],
      interpretation: 'No positions in portfolio'
    };
  }

  let netDelta = 0;
  let netGamma = 0;
  let netTheta = 0;
  let netVega = 0;
  let netRho = 0;

  const warnings = [];
  const positionBreakdown = [];

  // Aggregate Greeks across all positions
  positions.forEach((position, index) => {
    const positionGreeks = {
      position_id: position.id || `position_${index + 1}`,
      symbol: position.symbol,
      strategy: position.strategy || position.type,
      delta: 0,
      gamma: 0,
      theta: 0,
      vega: 0,
      rho: 0
    };

    // Process each leg of the position
    if (position.legs && Array.isArray(position.legs)) {
      position.legs.forEach(leg => {
        const contracts = position.contracts || leg.contracts || 1;
        const multiplier = contracts * contract_multiplier;

        // Determine if we're long or short this leg
        const sign = (leg.action === 'buy' || leg.position === 'long') ? 1 : -1;

        // Aggregate Greeks
        if (leg.greeks) {
          const delta = (leg.greeks.delta || 0) * sign * multiplier;
          const gamma = (leg.greeks.gamma || 0) * sign * multiplier;
          const theta = (leg.greeks.theta || 0) * sign * multiplier;
          const vega = (leg.greeks.vega || 0) * sign * multiplier;
          const rho = (leg.greeks.rho || 0) * sign * multiplier;

          netDelta += delta;
          netGamma += gamma;
          netTheta += theta;
          netVega += vega;
          netRho += rho;

          positionGreeks.delta += delta;
          positionGreeks.gamma += gamma;
          positionGreeks.theta += theta;
          positionGreeks.vega += vega;
          positionGreeks.rho += rho;
        }
      });
    }

    positionBreakdown.push({
      ...positionGreeks,
      delta: parseFloat(positionGreeks.delta.toFixed(2)),
      gamma: parseFloat(positionGreeks.gamma.toFixed(4)),
      theta: parseFloat(positionGreeks.theta.toFixed(2)),
      vega: parseFloat(positionGreeks.vega.toFixed(2)),
      rho: parseFloat(positionGreeks.rho.toFixed(2))
    });
  });

  // Check against limits and generate warnings
  if (Math.abs(netDelta) > max_delta) {
    warnings.push(`⚠️  Net delta ${netDelta.toFixed(0)} exceeds limit of ±${max_delta}`);
  }

  if (Math.abs(netGamma) > max_gamma) {
    warnings.push(`⚠️  Net gamma ${netGamma.toFixed(2)} exceeds limit of ±${max_gamma}`);
  }

  if (max_theta !== null && netTheta < max_theta) {
    warnings.push(`⚠️  Net theta ${netTheta.toFixed(2)} below limit of ${max_theta}`);
  }

  if (Math.abs(netVega) > max_vega) {
    warnings.push(`⚠️  Net vega ${netVega.toFixed(0)} exceeds limit of ±${max_vega}`);
  }

  // Determine directional bias
  let directionalBias;
  if (netDelta > 100) {
    directionalBias = 'bullish';
  } else if (netDelta < -100) {
    directionalBias = 'bearish';
  } else {
    directionalBias = 'neutral';
  }

  // Determine volatility bias
  let volatilityBias;
  if (netVega > 100) {
    volatilityBias = 'long_volatility';
  } else if (netVega < -100) {
    volatilityBias = 'short_volatility';
  } else {
    volatilityBias = 'neutral';
  }

  // Determine time decay bias
  let timeDecayBias;
  if (netTheta > 10) {
    timeDecayBias = 'earning_theta';
  } else if (netTheta < -10) {
    timeDecayBias = 'losing_theta';
  } else {
    timeDecayBias = 'neutral';
  }

  // Generate interpretation
  const interpretation = generateInterpretation({
    netDelta,
    netGamma,
    netTheta,
    netVega,
    directionalBias,
    volatilityBias,
    timeDecayBias
  });

  return {
    total_positions: positions.length,
    net_delta: parseFloat(netDelta.toFixed(2)),
    net_gamma: parseFloat(netGamma.toFixed(4)),
    net_theta: parseFloat(netTheta.toFixed(2)),
    net_vega: parseFloat(netVega.toFixed(2)),
    net_rho: parseFloat(netRho.toFixed(2)),

    // Interpretations
    directional_bias: directionalBias,
    volatility_bias: volatilityBias,
    time_decay_bias: timeDecayBias,

    // Daily metrics
    daily_theta_pnl: parseFloat(netTheta.toFixed(2)),
    daily_theta_interpretation: netTheta > 0 ?
      `Earning $${netTheta.toFixed(2)}/day from time decay` :
      `Losing $${Math.abs(netTheta).toFixed(2)}/day to time decay`,

    // Risk metrics
    delta_dollars: parseFloat(netDelta.toFixed(2)),
    delta_equivalent_shares: Math.round(netDelta / 100),
    gamma_risk: Math.abs(netGamma) > 10 ?
      'High - Delta will change significantly with price moves' :
      'Low - Delta relatively stable',
    vega_risk_per_point: parseFloat(netVega.toFixed(2)),

    warnings,
    interpretation,
    position_breakdown: positionBreakdown,

    // Limits check
    within_limits: warnings.length === 0,
    limits: {
      max_delta,
      max_gamma,
      max_theta,
      max_vega
    }
  };
}

/**
 * Generate human-readable interpretation of portfolio Greeks
 * @param {object} greeks - Portfolio Greeks
 * @returns {string} Interpretation
 */
function generateInterpretation(greeks) {
  const { netDelta, netGamma, netTheta, netVega, directionalBias, volatilityBias } = greeks;

  const parts = [];

  // Delta interpretation
  if (Math.abs(netDelta) < 50) {
    parts.push('Portfolio is delta-neutral (no directional bias)');
  } else if (netDelta > 0) {
    parts.push(`Portfolio is net long ${Math.round(netDelta / 100)} shares (bullish bias)`);
  } else {
    parts.push(`Portfolio is net short ${Math.round(Math.abs(netDelta) / 100)} shares (bearish bias)`);
  }

  // Theta interpretation
  if (netTheta > 10) {
    parts.push(`Earning $${netTheta.toFixed(0)}/day from time decay (good for theta sellers)`);
  } else if (netTheta < -10) {
    parts.push(`Losing $${Math.abs(netTheta).toFixed(0)}/day to time decay (need price movement)`);
  }

  // Vega interpretation
  if (Math.abs(netVega) > 100) {
    if (netVega > 0) {
      parts.push(`Long volatility: profit if IV increases by $${(netVega / 100).toFixed(0)} per 1% IV rise`);
    } else {
      parts.push(`Short volatility: profit if IV decreases by $${(Math.abs(netVega) / 100).toFixed(0)} per 1% IV drop`);
    }
  }

  // Gamma interpretation
  if (Math.abs(netGamma) > 5) {
    if (netGamma > 0) {
      parts.push('Positive gamma: Delta becomes more directional with price moves (accelerating profits)');
    } else {
      parts.push('Negative gamma: Delta becomes more directional against you (accelerating losses)');
    }
  }

  return parts.join('. ');
}

/**
 * Calculate expected P&L from various market scenarios
 * @param {object} portfolioGreeks - Portfolio Greeks from calculatePortfolioGreeks
 * @param {object} scenarios - Market scenarios to test
 * @returns {object} P&L for each scenario
 */
export function calculateScenarioPnL(portfolioGreeks, scenarios = {}) {
  const {
    price_move_pct = 0, // % move in underlying (e.g., 0.05 = 5% up)
    iv_change_pts = 0, // Change in IV in percentage points (e.g., 10 = +10%)
    days_forward = 0 // Number of days forward
  } = scenarios;

  const { net_delta, net_gamma, net_theta, net_vega } = portfolioGreeks;

  // Simplified scenario P&L (not accounting for second-order effects)
  // This is an approximation

  // Delta P&L (first-order)
  const deltaPnL = net_delta * price_move_pct;

  // Gamma P&L (second-order, approximation)
  const gammaPnL = 0.5 * net_gamma * (price_move_pct ** 2) * 100;

  // Theta P&L
  const thetaPnL = net_theta * days_forward;

  // Vega P&L
  const vegaPnL = net_vega * (iv_change_pts / 100);

  const totalPnL = deltaPnL + gammaPnL + thetaPnL + vegaPnL;

  return {
    scenarios: {
      price_move_pct: `${(price_move_pct * 100).toFixed(1)}%`,
      iv_change_pts: `${iv_change_pts > 0 ? '+' : ''}${iv_change_pts}pts`,
      days_forward
    },
    pnl_breakdown: {
      delta_pnl: parseFloat(deltaPnL.toFixed(2)),
      gamma_pnl: parseFloat(gammaPnL.toFixed(2)),
      theta_pnl: parseFloat(thetaPnL.toFixed(2)),
      vega_pnl: parseFloat(vegaPnL.toFixed(2))
    },
    total_estimated_pnl: parseFloat(totalPnL.toFixed(2)),
    interpretation: totalPnL > 0 ?
      `Portfolio would gain approximately $${totalPnL.toFixed(2)} under this scenario` :
      `Portfolio would lose approximately $${Math.abs(totalPnL).toFixed(2)} under this scenario`,
    note: 'This is a simplified approximation. Actual P&L will vary based on option specifics.'
  };
}

/**
 * Generate portfolio risk warnings based on Greeks
 * @param {object} portfolioGreeks - Portfolio Greeks
 * @param {object} marketData - Current market conditions (optional)
 * @returns {array} Array of risk warnings
 */
export function generatePortfolioRiskWarnings(portfolioGreeks, marketData = {}) {
  const warnings = [];
  const { net_delta, net_gamma, net_theta, net_vega } = portfolioGreeks;
  const { vix_level, market_trend } = marketData;

  // High delta exposure warning
  if (Math.abs(net_delta) > 500) {
    warnings.push({
      severity: 'HIGH',
      type: 'DELTA_RISK',
      message: `High directional exposure: ${Math.round(Math.abs(net_delta) / 100)} share equivalent`,
      recommendation: 'Consider hedging with opposite delta position or reducing exposure'
    });
  }

  // Negative gamma in volatile markets
  if (net_gamma < -10 && vix_level && vix_level > 25) {
    warnings.push({
      severity: 'CRITICAL',
      type: 'GAMMA_RISK',
      message: 'Negative gamma during high volatility - risk of accelerating losses',
      recommendation: 'Reduce short option positions or add long options for gamma protection'
    });
  }

  // Theta bleeding in ranging markets
  if (net_theta < -50) {
    warnings.push({
      severity: 'MEDIUM',
      type: 'THETA_DECAY',
      message: `Losing $${Math.abs(net_theta).toFixed(0)}/day to time decay`,
      recommendation: 'Need directional move soon or consider closing long option positions'
    });
  }

  // Vega exposure warnings
  if (Math.abs(net_vega) > 500) {
    const vegaDirection = net_vega > 0 ? 'long' : 'short';
    warnings.push({
      severity: 'MEDIUM',
      type: 'VEGA_RISK',
      message: `High vega exposure (${vegaDirection} volatility): $${Math.abs(net_vega).toFixed(0)} per 1% IV move`,
      recommendation: vegaDirection === 'long' ?
        'Portfolio benefits from IV increase but hurt by IV crush' :
        'Portfolio benefits from IV decrease but hurt by volatility spikes'
    });
  }

  // Conflicting exposures
  if (net_delta > 200 && net_theta < -30) {
    warnings.push({
      severity: 'LOW',
      type: 'CONFLICTING_EXPOSURE',
      message: 'Bullish directional bet (positive delta) but losing theta - need upward move',
      recommendation: 'Monitor closely - time is working against this position'
    });
  }

  return warnings;
}

export default {
  calculatePortfolioGreeks,
  calculateScenarioPnL,
  generatePortfolioRiskWarnings
};
