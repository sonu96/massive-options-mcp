/**
 * Position Tracking Module
 *
 * Tracks open options positions, monitors P&L, and generates exit signals.
 * Positions are stored in .claude/positions.json for persistence.
 */

import fs from 'fs';
import path from 'path';

const POSITIONS_FILE = '.claude/positions.json';

/**
 * Load positions from file
 * @param {string} filePath - Path to positions file (optional)
 * @returns {Array} Array of positions
 */
export function loadPositions(filePath = POSITIONS_FILE) {
  try {
    if (!fs.existsSync(filePath)) {
      // Create empty positions file
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(filePath, JSON.stringify({ positions: [], watchlist: [] }, null, 2));
      return [];
    }

    const data = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(data);
    return parsed.positions || [];
  } catch (error) {
    console.error('Error loading positions:', error.message);
    return [];
  }
}

/**
 * Save positions to file
 * @param {Array} positions - Array of positions
 * @param {string} filePath - Path to positions file (optional)
 */
export function savePositions(positions, filePath = POSITIONS_FILE) {
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Load existing data to preserve watchlist
    let existingData = { positions: [], watchlist: [] };
    if (fs.existsSync(filePath)) {
      existingData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }

    existingData.positions = positions;
    fs.writeFileSync(filePath, JSON.stringify(existingData, null, 2));
  } catch (error) {
    console.error('Error saving positions:', error.message);
    throw error;
  }
}

/**
 * Add a new position
 * @param {object} position - Position details
 * @returns {object} Added position with ID
 */
export function addPosition(position) {
  const positions = loadPositions();

  const newPosition = {
    id: `pos_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    ...position,
    entry_date: position.entry_date || new Date().toISOString().split('T')[0],
    status: 'open',
    created_at: new Date().toISOString()
  };

  positions.push(newPosition);
  savePositions(positions);

  return newPosition;
}

/**
 * Update existing position
 * @param {string} positionId - Position ID
 * @param {object} updates - Fields to update
 * @returns {object} Updated position
 */
export function updatePosition(positionId, updates) {
  const positions = loadPositions();
  const index = positions.findIndex(p => p.id === positionId);

  if (index === -1) {
    throw new Error(`Position ${positionId} not found`);
  }

  positions[index] = {
    ...positions[index],
    ...updates,
    updated_at: new Date().toISOString()
  };

  savePositions(positions);
  return positions[index];
}

/**
 * Close a position
 * @param {string} positionId - Position ID
 * @param {object} exitDetails - Exit details (price, date, profit)
 * @returns {object} Closed position
 */
export function closePosition(positionId, exitDetails = {}) {
  return updatePosition(positionId, {
    status: 'closed',
    exit_date: exitDetails.exit_date || new Date().toISOString().split('T')[0],
    exit_price: exitDetails.exit_price,
    exit_profit: exitDetails.exit_profit,
    closed_at: new Date().toISOString()
  });
}

/**
 * Get all open positions
 * @returns {Array} Open positions
 */
export function getOpenPositions() {
  const positions = loadPositions();
  return positions.filter(p => p.status === 'open');
}

/**
 * Get position by ID
 * @param {string} positionId - Position ID
 * @returns {object} Position
 */
export function getPosition(positionId) {
  const positions = loadPositions();
  return positions.find(p => p.id === positionId);
}

/**
 * Delete position
 * @param {string} positionId - Position ID
 */
export function deletePosition(positionId) {
  const positions = loadPositions();
  const filtered = positions.filter(p => p.id !== positionId);
  savePositions(filtered);
}

/**
 * Calculate current P&L for a position
 * @param {object} position - Position object
 * @param {object} currentMarketData - Current market prices
 * @returns {object} P&L analysis
 */
export function calculatePositionPnL(position, currentMarketData) {
  const { entry_price, entry_credit, contracts = 1, strategy } = position;
  const { current_price, current_bid, current_ask } = currentMarketData;

  const contractMultiplier = 100;
  const entryValue = (entry_price || entry_credit) * contracts * contractMultiplier;

  let currentValue, unrealizedPnL;

  // Determine if position was entered for debit or credit
  if (strategy && strategy.includes('credit')) {
    // Credit spread: we received credit, now want to buy it back cheaper
    const exitCost = (current_price || current_ask) * contracts * contractMultiplier;
    unrealizedPnL = entryValue - exitCost;
    currentValue = exitCost;
  } else {
    // Debit spread: we paid debit, now want to sell it for more
    const exitValue = (current_price || current_bid) * contracts * contractMultiplier;
    unrealizedPnL = exitValue - entryValue;
    currentValue = exitValue;
  }

  const profitPct = entryValue !== 0 ? (unrealizedPnL / entryValue) * 100 : 0;

  // Calculate days held
  const entryDate = new Date(position.entry_date);
  const today = new Date();
  const daysHeld = Math.floor((today - entryDate) / (1000 * 60 * 60 * 24));

  return {
    entry_value: parseFloat(entryValue.toFixed(2)),
    current_value: parseFloat(currentValue.toFixed(2)),
    unrealized_pnl: parseFloat(unrealizedPnL.toFixed(2)),
    profit_pct: parseFloat(profitPct.toFixed(2)),
    days_held: daysHeld,
    daily_pnl: daysHeld > 0 ? parseFloat((unrealizedPnL / daysHeld).toFixed(2)) : 0
  };
}

/**
 * Generate exit signals for a position
 * @param {object} position - Position with P&L
 * @param {object} pnlData - Current P&L data
 * @param {object} config - Exit configuration
 * @returns {object} Exit signals
 */
export function generateExitSignals(position, pnlData, config = {}) {
  const {
    profit_target_pct = 50, // Close at 50% of max profit
    stop_loss_pct = 50, // Stop loss at 50% of max loss
    time_stop_dte = 7, // Close at 7 days to expiration
    theta_threshold = 0.10 // Close when capturing 80%+ of theta
  } = config;

  const signals = [];
  let recommendation = 'HOLD';
  let severity = 'INFO';

  // Calculate days to expiration
  const expirationDate = new Date(position.expiration);
  const today = new Date();
  const dte = Math.floor((expirationDate - today) / (1000 * 60 * 60 * 24));

  // Profit target hit
  if (pnlData.profit_pct >= profit_target_pct) {
    signals.push({
      type: 'PROFIT_TARGET',
      message: `Profit target hit: ${pnlData.profit_pct.toFixed(1)}% (target: ${profit_target_pct}%)`,
      action: 'CLOSE_NOW',
      priority: 'HIGH'
    });
    recommendation = 'CLOSE';
    severity = 'SUCCESS';
  }

  // Stop loss triggered
  if (pnlData.profit_pct <= -stop_loss_pct) {
    signals.push({
      type: 'STOP_LOSS',
      message: `Stop loss triggered: ${pnlData.profit_pct.toFixed(1)}% loss (stop: -${stop_loss_pct}%)`,
      action: 'CUT_LOSS',
      priority: 'CRITICAL'
    });
    recommendation = 'CLOSE';
    severity = 'CRITICAL';
  }

  // Time stop
  if (dte <= time_stop_dte && dte > 0) {
    signals.push({
      type: 'TIME_STOP',
      message: `${dte} days to expiration (time stop: ${time_stop_dte} DTE)`,
      action: 'CONSIDER_CLOSING',
      priority: 'MEDIUM'
    });
    if (recommendation === 'HOLD') {
      recommendation = 'CONSIDER_CLOSING';
      severity = 'WARNING';
    }
  }

  // Approaching profit target (within 10%)
  if (pnlData.profit_pct >= profit_target_pct * 0.8 && pnlData.profit_pct < profit_target_pct) {
    signals.push({
      type: 'APPROACHING_TARGET',
      message: `Near profit target: ${pnlData.profit_pct.toFixed(1)}% (target: ${profit_target_pct}%)`,
      action: 'MONITOR_CLOSELY',
      priority: 'LOW'
    });
  }

  // Winning but time running out
  if (pnlData.profit_pct > 20 && dte <= 14) {
    signals.push({
      type: 'SECURE_PROFIT',
      message: `${pnlData.profit_pct.toFixed(1)}% profit with only ${dte} DTE remaining`,
      action: 'CONSIDER_TAKING_PROFIT',
      priority: 'MEDIUM'
    });
  }

  return {
    recommendation,
    severity,
    signals,
    days_to_expiration: dte,
    summary: signals.length > 0 ? signals[0].message : 'Position on track, no action needed'
  };
}

/**
 * Monitor all open positions and generate alerts
 * @param {object} marketDataFetcher - Function to fetch current market data
 * @returns {object} Monitoring report
 */
export async function monitorPositions(marketDataFetcher) {
  const openPositions = getOpenPositions();

  if (openPositions.length === 0) {
    return {
      total_positions: 0,
      alerts: [],
      summary: 'No open positions to monitor'
    };
  }

  const alerts = [];
  const positionReports = [];

  for (const position of openPositions) {
    try {
      // Fetch current market data for this position
      const marketData = await marketDataFetcher(position);

      // Calculate P&L
      const pnl = calculatePositionPnL(position, marketData);

      // Generate exit signals
      const exitSignals = generateExitSignals(position, pnl);

      positionReports.push({
        position_id: position.id,
        symbol: position.symbol,
        strategy: position.strategy,
        pnl,
        exit_signals: exitSignals
      });

      // Create alerts for actionable signals
      if (exitSignals.recommendation !== 'HOLD') {
        alerts.push({
          position_id: position.id,
          symbol: position.symbol,
          severity: exitSignals.severity,
          recommendation: exitSignals.recommendation,
          message: exitSignals.summary,
          pnl: pnl.unrealized_pnl,
          profit_pct: pnl.profit_pct
        });
      }
    } catch (error) {
      console.error(`Error monitoring position ${position.id}:`, error.message);
    }
  }

  // Sort alerts by severity
  const severityOrder = { CRITICAL: 0, SUCCESS: 1, WARNING: 2, INFO: 3 };
  alerts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return {
    total_positions: openPositions.length,
    positions_with_alerts: alerts.length,
    alerts,
    position_reports: positionReports,
    summary: alerts.length > 0 ?
      `${alerts.length} positions need attention` :
      `All ${openPositions.length} positions on track`
  };
}

export default {
  loadPositions,
  savePositions,
  addPosition,
  updatePosition,
  closePosition,
  getOpenPositions,
  getPosition,
  deletePosition,
  calculatePositionPnL,
  generateExitSignals,
  monitorPositions
};
