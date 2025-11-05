/**
 * Circuit Breakers Module
 *
 * Prevents catastrophic losses by automatically halting trading
 * when predefined risk limits are exceeded.
 *
 * Critical for protecting capital during adverse market conditions.
 */

import fs from 'fs';
import path from 'path';

const BREAKER_STATE_FILE = '.claude/circuit-breakers.json';

/**
 * Default circuit breaker configuration
 */
export const DEFAULT_BREAKERS = {
  max_daily_loss: 500, // Max $500 loss per day
  max_daily_loss_pct: 0.05, // Max 5% account loss per day
  max_position_loss_pct: 0.50, // Auto-close if position down 50%
  max_portfolio_risk_pct: 0.20, // Max 20% of account at risk
  vix_spike_threshold: 40, // Halt if VIX > 40
  correlation_threshold: 0.85, // Warn if positions >85% correlated
  enabled: true
};

/**
 * Load circuit breaker state
 * @returns {object} Breaker state
 */
function loadBreakerState() {
  try {
    if (!fs.existsSync(BREAKER_STATE_FILE)) {
      const initialState = {
        daily_pnl: 0,
        last_reset_date: new Date().toISOString().split('T')[0],
        breakers_tripped: [],
        trades_today: 0
      };
      saveBreakerState(initialState);
      return initialState;
    }

    const data = fs.readFileSync(BREAKER_STATE_FILE, 'utf8');
    const state = JSON.parse(data);

    // Reset daily counters if new day
    const today = new Date().toISOString().split('T')[0];
    if (state.last_reset_date !== today) {
      state.daily_pnl = 0;
      state.trades_today = 0;
      state.breakers_tripped = [];
      state.last_reset_date = today;
      saveBreakerState(state);
    }

    return state;
  } catch (error) {
    console.error('Error loading breaker state:', error.message);
    return {
      daily_pnl: 0,
      last_reset_date: new Date().toISOString().split('T')[0],
      breakers_tripped: [],
      trades_today: 0
    };
  }
}

/**
 * Save circuit breaker state
 * @param {object} state - Breaker state
 */
function saveBreakerState(state) {
  try {
    const dir = path.dirname(BREAKER_STATE_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(BREAKER_STATE_FILE, JSON.stringify(state, null, 2));
  } catch (error) {
    console.error('Error saving breaker state:', error.message);
  }
}

/**
 * Check if circuit breakers should trip
 * @param {object} context - Trading context (account size, current positions, market data)
 * @param {object} config - Circuit breaker configuration
 * @returns {object} Breaker check result
 */
export function checkCircuitBreakers(context, config = DEFAULT_BREAKERS) {
  if (!config.enabled) {
    return {
      trading_allowed: true,
      breakers_tripped: [],
      warnings: [],
      message: 'Circuit breakers disabled'
    };
  }

  const state = loadBreakerState();
  const breakers_tripped = [];
  const warnings = [];

  const {
    account_size,
    daily_pnl = state.daily_pnl,
    portfolio_risk,
    vix_level,
    positions = []
  } = context;

  // Check 1: Daily loss limit (absolute)
  if (daily_pnl < -config.max_daily_loss) {
    breakers_tripped.push({
      type: 'MAX_DAILY_LOSS',
      severity: 'CRITICAL',
      message: `Daily loss $${Math.abs(daily_pnl).toFixed(2)} exceeds limit of $${config.max_daily_loss}`,
      action: 'HALT_ALL_TRADING',
      triggered_at: new Date().toISOString()
    });
  }

  // Check 2: Daily loss limit (percentage)
  if (account_size && daily_pnl / account_size < -config.max_daily_loss_pct) {
    const lossPct = Math.abs(daily_pnl / account_size * 100);
    breakers_tripped.push({
      type: 'MAX_DAILY_LOSS_PCT',
      severity: 'CRITICAL',
      message: `Daily loss ${lossPct.toFixed(2)}% exceeds limit of ${config.max_daily_loss_pct * 100}%`,
      action: 'HALT_ALL_TRADING',
      triggered_at: new Date().toISOString()
    });
  }

  // Check 3: Portfolio risk limit
  if (portfolio_risk && account_size) {
    const riskPct = portfolio_risk / account_size;
    if (riskPct > config.max_portfolio_risk_pct) {
      breakers_tripped.push({
        type: 'MAX_PORTFOLIO_RISK',
        severity: 'HIGH',
        message: `Portfolio risk ${(riskPct * 100).toFixed(1)}% exceeds limit of ${config.max_portfolio_risk_pct * 100}%`,
        action: 'NO_NEW_POSITIONS',
        triggered_at: new Date().toISOString()
      });
    }
  }

  // Check 4: VIX spike (extreme volatility)
  if (vix_level && vix_level > config.vix_spike_threshold) {
    breakers_tripped.push({
      type: 'VIX_SPIKE',
      severity: 'HIGH',
      message: `VIX at ${vix_level.toFixed(1)} exceeds threshold of ${config.vix_spike_threshold}`,
      action: 'REDUCE_EXPOSURE',
      triggered_at: new Date().toISOString()
    });
  }

  // Check 5: Individual position losses
  if (positions && positions.length > 0) {
    positions.forEach(pos => {
      if (pos.pnl && pos.pnl.profit_pct <= -config.max_position_loss_pct * 100) {
        warnings.push({
          type: 'POSITION_STOP_LOSS',
          severity: 'HIGH',
          position_id: pos.id,
          symbol: pos.symbol,
          message: `Position ${pos.symbol} down ${Math.abs(pos.pnl.profit_pct).toFixed(1)}%`,
          action: 'CLOSE_POSITION',
          loss: pos.pnl.unrealized_pnl
        });
      }
    });
  }

  // Warnings (not full breakers)
  if (daily_pnl < -config.max_daily_loss * 0.7) {
    warnings.push({
      type: 'APPROACHING_DAILY_LIMIT',
      severity: 'MEDIUM',
      message: `Daily P&L $${daily_pnl.toFixed(2)} approaching limit of -$${config.max_daily_loss}`,
      action: 'MONITOR_CLOSELY'
    });
  }

  // Update state
  state.daily_pnl = daily_pnl;
  if (breakers_tripped.length > 0) {
    state.breakers_tripped = [...state.breakers_tripped, ...breakers_tripped];
  }
  saveBreakerState(state);

  const trading_allowed = breakers_tripped.length === 0 ||
    !breakers_tripped.some(b => b.action === 'HALT_ALL_TRADING');

  return {
    trading_allowed,
    new_positions_allowed: !breakers_tripped.some(b =>
      b.action === 'HALT_ALL_TRADING' || b.action === 'NO_NEW_POSITIONS'
    ),
    breakers_tripped,
    warnings,
    state,
    message: breakers_tripped.length > 0 ?
      `⚠️  ${breakers_tripped.length} circuit breaker(s) tripped` :
      warnings.length > 0 ?
        `⚠️  ${warnings.length} warning(s)` :
        '✅ All systems normal',
    recommendation: breakers_tripped.length > 0 ?
      'STOP TRADING - Review positions and reset breakers manually' :
      warnings.length > 0 ?
        'CAUTION - Monitor positions closely' :
        'Continue trading within risk limits'
  };
}

/**
 * Record a trade for daily tracking
 * @param {number} pnl - Trade P&L
 */
export function recordTrade(pnl) {
  const state = loadBreakerState();
  state.daily_pnl += pnl;
  state.trades_today += 1;
  saveBreakerState(state);
}

/**
 * Manually reset circuit breakers (use with caution)
 * @param {string} resetCode - Confirmation code
 * @returns {object} Reset result
 */
export function resetCircuitBreakers(resetCode) {
  if (resetCode !== 'RESET_CONFIRMED') {
    return {
      success: false,
      message: 'Invalid reset code. Use "RESET_CONFIRMED" to proceed.'
    };
  }

  const state = loadBreakerState();
  state.breakers_tripped = [];
  saveBreakerState(state);

  return {
    success: true,
    message: 'Circuit breakers reset. Trading resumed.',
    warning: 'Use caution - address root cause before continuing'
  };
}

/**
 * Get current breaker status
 * @returns {object} Current status
 */
export function getBreakerStatus() {
  const state = loadBreakerState();
  const isTrading = state.breakers_tripped.length === 0;

  return {
    status: isTrading ? 'ACTIVE' : 'TRIPPED',
    daily_pnl: state.daily_pnl,
    trades_today: state.trades_today,
    last_reset: state.last_reset_date,
    breakers_tripped: state.breakers_tripped,
    trading_allowed: isTrading
  };
}

export default {
  DEFAULT_BREAKERS,
  checkCircuitBreakers,
  recordTrade,
  resetCircuitBreakers,
  getBreakerStatus
};
