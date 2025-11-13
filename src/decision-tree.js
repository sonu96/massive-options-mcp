/**
 * Options Decision Tree
 *
 * Real-time decision support for entry, hold, and exit decisions.
 * Based on lessons learned from actual trading losses (e.g., ORCL).
 */

import { OptionsProbabilityCalculator } from './probability-calculator.js';
import { RealTimeOptionsMonitor } from './real-time-monitor.js';
import { PreTradeValidator } from './pre-trade-validator.js';

/**
 * Track price history for breach analysis
 */
class PriceHistory {
  constructor() {
    this.history = [];
    this.maxHistory = 100; // Keep last 100 price points
  }

  addPrice(price, timestamp = new Date()) {
    this.history.push({ price, timestamp });
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }
  }

  getTimeAtLevel(targetPrice, tolerancePct = 0.5) {
    const tolerance = targetPrice * (tolerancePct / 100);
    const atLevel = this.history.filter(h =>
      Math.abs(h.price - targetPrice) <= tolerance
    );

    if (atLevel.length === 0) return 0;

    // Calculate time span in minutes
    const firstTouch = atLevel[0].timestamp;
    const lastTouch = atLevel[atLevel.length - 1].timestamp;
    const minutes = (lastTouch - firstTouch) / (1000 * 60);

    return minutes;
  }

  isFirstTouch(targetPrice, tolerancePct = 0.5) {
    const tolerance = targetPrice * (tolerancePct / 100);
    const recent = this.history.slice(-5); // Last 5 prices

    // Check if just touched for the first time
    const currentAtLevel = recent.length > 0 &&
      Math.abs(recent[recent.length - 1].price - targetPrice) <= tolerance;
    const previousNotAtLevel = recent.slice(0, -1).every(h =>
      Math.abs(h.price - targetPrice) > tolerance
    );

    return currentAtLevel && previousNotAtLevel;
  }

  hasBouncedOff(targetPrice, tolerancePct = 0.5) {
    const tolerance = targetPrice * (tolerancePct / 100);
    const recent = this.history.slice(-10); // Last 10 prices

    if (recent.length < 3) return false;

    // Look for pattern: approached level, touched it, moved away
    const touchedLevel = recent.some(h =>
      Math.abs(h.price - targetPrice) <= tolerance
    );

    const currentPrice = recent[recent.length - 1].price;
    const movedAway = Math.abs(currentPrice - targetPrice) > tolerance * 2;

    return touchedLevel && movedAway;
  }

  getTrend(periods = 5) {
    if (this.history.length < periods) return 'UNKNOWN';

    const recent = this.history.slice(-periods);
    const first = recent[0].price;
    const last = recent[recent.length - 1].price;
    const change = ((last - first) / first) * 100;

    if (change > 0.5) return 'UPTREND';
    if (change < -0.5) return 'DOWNTREND';
    return 'SIDEWAYS';
  }
}

/**
 * Options Decision Tree Class
 */
export class OptionsDecisionTree {
  constructor(massiveClient) {
    this.client = massiveClient;
    this.validator = new PreTradeValidator(massiveClient);
    this.probCalc = new OptionsProbabilityCalculator(massiveClient);
    this.monitor = new RealTimeOptionsMonitor(massiveClient);
    this.priceHistory = new PriceHistory();
  }

  /**
   * Evaluate whether to enter a trade
   *
   * @param {string} symbol - Underlying symbol
   * @param {Object} strategy - Strategy details
   * @returns {Object} Entry decision
   */
  async evaluateEntry(symbol, strategy) {
    try {
      // Run full validation
      const validation = await this.validator.validateTrade(
        symbol,
        strategy.type,
        strategy.strikes,
        strategy.expiration,
        strategy.options
      );

      // ENTRY RULES - Hard stops based on validation
      const entryRules = [
        {
          name: 'Critical Validation Failures',
          condition: () => validation.overall_status === 'REJECTED',
          decision: 'NO_ENTRY',
          reason: validation.recommendation.reason,
          confidence: 1.0
        },
        {
          name: 'Extreme Probability of Touch',
          condition: () => {
            const callProb = validation.probabilities.short_call?.prob_touch;
            const putProb = validation.probabilities.short_put?.prob_touch;
            return callProb > 0.75 || putProb > 0.75;
          },
          decision: 'NO_ENTRY',
          reason: 'Strike has >75% chance of being tested - unacceptable risk',
          confidence: 0.95
        },
        {
          name: 'Strike Within ATR',
          condition: () => {
            const callATR = validation.probabilities.short_call?.distance_in_atr;
            const putATR = validation.probabilities.short_put?.distance_in_atr;
            return callATR < 1.5 || putATR < 1.5;
          },
          decision: 'NO_ENTRY',
          reason: 'Strikes within 1.5 ATR - too close to current price',
          confidence: 0.90
        },
        {
          name: 'Extreme Volatility',
          condition: () => {
            const iv = validation.probabilities.short_call?.implied_volatility ||
              validation.probabilities.short_put?.implied_volatility;
            return iv > 0.90;
          },
          decision: 'NO_ENTRY',
          reason: 'IV >90% - EXTREME volatility, do not sell options',
          confidence: 0.95
        },
        {
          name: 'High Risk Status',
          condition: () => validation.overall_status === 'HIGH_RISK',
          decision: 'NO_ENTRY',
          reason: 'Multiple high-risk factors present',
          confidence: 0.85
        },
        {
          name: 'Moderate Risk - Reduce Size',
          condition: () => validation.overall_status === 'MODERATE_RISK',
          decision: 'ENTER_REDUCED',
          reason: 'Some risk factors present - use 50% position size',
          confidence: 0.70,
          position_size_multiplier: 0.5
        },
        {
          name: 'Low Risk - Proceed with Caution',
          condition: () => validation.overall_status === 'LOW_RISK',
          decision: 'ENTER_NORMAL',
          reason: 'Minor concerns but overall acceptable',
          confidence: 0.80,
          position_size_multiplier: 0.75
        }
      ];

      // Evaluate rules in order
      for (const rule of entryRules) {
        if (rule.condition()) {
          return {
            decision: rule.decision,
            symbol: symbol,
            strategy: strategy.type,
            reason: rule.reason,
            confidence: rule.confidence,
            rule_triggered: rule.name,
            position_size_multiplier: rule.position_size_multiplier || 0,
            validation: validation,
            timestamp: new Date().toISOString()
          };
        }
      }

      // Default: APPROVED
      return {
        decision: 'ENTER_NORMAL',
        symbol: symbol,
        strategy: strategy.type,
        reason: 'All validation checks passed - excellent setup',
        confidence: this.calculateEntryConfidence(validation),
        rule_triggered: 'All Clear',
        position_size_multiplier: 1.0,
        validation: validation,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      throw new Error(`Entry evaluation failed: ${error.message}`);
    }
  }

  /**
   * Calculate entry confidence score based on validation
   *
   * @param {Object} validation - Validation results
   * @returns {number} Confidence score (0-1)
   */
  calculateEntryConfidence(validation) {
    const passed = validation.summary.passed;
    const total = validation.summary.total_checks;
    const failures = validation.summary.failures;

    // Start with pass rate
    let confidence = passed / total;

    // Penalize for failures
    confidence -= (failures * 0.1);

    // Bonus for clean sweep
    if (failures === 0 && validation.summary.warnings === 0) {
      confidence += 0.1;
    }

    return Math.max(0, Math.min(1, confidence));
  }

  /**
   * Evaluate whether to hold or exit a position
   *
   * @param {string} symbol - Underlying symbol
   * @param {Object} position - Current position details
   * @param {number} currentPrice - Current underlying price
   * @returns {Object} Hold/exit decision
   */
  async evaluateExit(symbol, position, currentPrice) {
    try {
      // Track price history
      this.priceHistory.addPrice(currentPrice);

      // Get current probabilities
      const [callProb, putProb] = await Promise.all([
        position.short_call
          ? this.probCalc.calculateProbabilities(symbol, position.short_call, position.expiration, 'call')
          : null,
        position.short_put
          ? this.probCalc.calculateProbabilities(symbol, position.short_put, position.expiration, 'put')
          : null
      ]);

      // EXIT RULES - Based on ORCL lessons learned
      const exitRules = [
        // ===== CRITICAL: BREACH IMMINENT =====
        {
          name: 'Short Call - Breach Imminent',
          condition: () => position.short_call && currentPrice >= position.short_call * 0.98,
          decision: 'EXIT_IMMEDIATE',
          reason: `Stock at $${currentPrice.toFixed(2)}, within 2% of short call $${position.short_call} - BREACH IMMINENT`,
          urgency: 'CRITICAL',
          confidence: 1.0
        },
        {
          name: 'Short Put - Breach Imminent',
          condition: () => position.short_put && currentPrice <= position.short_put * 1.02,
          decision: 'EXIT_IMMEDIATE',
          reason: `Stock at $${currentPrice.toFixed(2)}, within 2% of short put $${position.short_put} - BREACH IMMINENT`,
          urgency: 'CRITICAL',
          confidence: 1.0
        },

        // ===== HIGH: SUSTAINED BREACH =====
        {
          name: 'Short Call - Sustained Above Strike',
          condition: () => {
            if (!position.short_call || currentPrice < position.short_call) return false;
            const timeAtLevel = this.priceHistory.getTimeAtLevel(position.short_call, 1.0);
            return timeAtLevel > 30; // More than 30 minutes above strike
          },
          decision: 'EXIT_IMMEDIATE',
          reason: `Stock above short call for ${this.priceHistory.getTimeAtLevel(position.short_call).toFixed(0)} minutes - sustained breach`,
          urgency: 'HIGH',
          confidence: 0.95
        },
        {
          name: 'Short Put - Sustained Below Strike',
          condition: () => {
            if (!position.short_put || currentPrice > position.short_put) return false;
            const timeAtLevel = this.priceHistory.getTimeAtLevel(position.short_put, 1.0);
            return timeAtLevel > 30; // More than 30 minutes below strike
          },
          decision: 'EXIT_IMMEDIATE',
          reason: `Stock below short put for ${this.priceHistory.getTimeAtLevel(position.short_put).toFixed(0)} minutes - sustained breach`,
          urgency: 'HIGH',
          confidence: 0.95
        },

        // ===== MEDIUM: FIRST TOUCH - MONITOR =====
        {
          name: 'Short Call - First Touch (Monitor)',
          condition: () => {
            if (!position.short_call) return false;
            return this.priceHistory.isFirstTouch(position.short_call, 1.0);
          },
          decision: 'MONITOR_CLOSELY',
          reason: 'First touch of short call - watch for bounce or sustained move',
          urgency: 'MEDIUM',
          confidence: 0.70,
          action: 'Set 15-minute timer, exit if no reversal'
        },
        {
          name: 'Short Put - First Touch (Monitor)',
          condition: () => {
            if (!position.short_put) return false;
            return this.priceHistory.isFirstTouch(position.short_put, 1.0);
          },
          decision: 'MONITOR_CLOSELY',
          reason: 'First touch of short put - watch for bounce or sustained move',
          urgency: 'MEDIUM',
          confidence: 0.70,
          action: 'Set 15-minute timer, exit if no reversal'
        },

        // ===== LOW: BOUNCED OFF LEVEL - HOLD =====
        {
          name: 'Bounced Off Short Call',
          condition: () => {
            if (!position.short_call) return false;
            return this.priceHistory.hasBouncedOff(position.short_call, 1.0);
          },
          decision: 'HOLD',
          reason: 'Price tested short call and bounced - technical level holding',
          urgency: 'LOW',
          confidence: 0.75
        },
        {
          name: 'Bounced Off Short Put',
          condition: () => {
            if (!position.short_put) return false;
            return this.priceHistory.hasBouncedOff(position.short_put, 1.0);
          },
          decision: 'HOLD',
          reason: 'Price tested short put and bounced - technical level holding',
          urgency: 'LOW',
          confidence: 0.75
        },

        // ===== PROFIT TARGETS =====
        {
          name: 'Profit Target Reached',
          condition: () => {
            if (!position.entry_credit) return false;
            const currentValue = (callProb?.mid || 0) + (putProb?.mid || 0);
            const profitPct = ((position.entry_credit - currentValue) / position.entry_credit) * 100;
            return profitPct >= 50; // 50% profit target
          },
          decision: 'CONSIDER_EXIT',
          reason: 'Position at 50%+ profit - consider taking gains',
          urgency: 'LOW',
          confidence: 0.60,
          action: 'Close position or adjust to lock in profits'
        },

        // ===== TIME DECAY =====
        {
          name: 'Approaching Expiration',
          condition: () => {
            const dte = callProb?.days_to_expiration || putProb?.days_to_expiration;
            return dte <= 2;
          },
          decision: 'MONITOR_CLOSELY',
          reason: `Only ${callProb?.days_to_expiration || putProb?.days_to_expiration} days to expiration - high gamma risk`,
          urgency: 'HIGH',
          confidence: 0.85,
          action: 'Consider closing to avoid assignment risk'
        }
      ];

      // Evaluate rules in order of priority
      for (const rule of exitRules) {
        if (rule.condition()) {
          return {
            decision: rule.decision,
            symbol: symbol,
            reason: rule.reason,
            urgency: rule.urgency,
            confidence: rule.confidence,
            rule_triggered: rule.name,
            action: rule.action || null,
            current_price: currentPrice,
            position: position,
            probabilities: {
              call: callProb,
              put: putProb
            },
            price_trend: this.priceHistory.getTrend(),
            timestamp: new Date().toISOString()
          };
        }
      }

      // Default: HOLD
      return {
        decision: 'HOLD',
        symbol: symbol,
        reason: 'All systems nominal - position within acceptable parameters',
        urgency: 'LOW',
        confidence: 0.80,
        rule_triggered: 'Normal Monitoring',
        current_price: currentPrice,
        position: position,
        probabilities: {
          call: callProb,
          put: putProb
        },
        price_trend: this.priceHistory.getTrend(),
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      throw new Error(`Exit evaluation failed: ${error.message}`);
    }
  }

  /**
   * Reset price history (e.g., for new position)
   */
  resetPriceHistory() {
    this.priceHistory = new PriceHistory();
  }

  /**
   * Get current price history summary
   * @returns {Object} Price history summary
   */
  getPriceHistorySummary() {
    return {
      points_tracked: this.priceHistory.history.length,
      trend: this.priceHistory.getTrend(),
      latest_price: this.priceHistory.history.length > 0
        ? this.priceHistory.history[this.priceHistory.history.length - 1].price
        : null,
      oldest_price: this.priceHistory.history.length > 0
        ? this.priceHistory.history[0].price
        : null
    };
  }
}
