/**
 * Pre-Trade Validator
 *
 * Comprehensive validation system for options trades before entry.
 * Combines probability analysis, market conditions, and risk metrics
 * to provide a go/no-go decision with detailed reasoning.
 *
 * This system would have prevented the ORCL loss by flagging:
 * - 75%+ probability of touching strikes
 * - 98% IV (extreme danger)
 * - Strikes within daily ATR range
 */

import { OptionsProbabilityCalculator } from './probability-calculator.js';
import { RealTimeOptionsMonitor } from './real-time-monitor.js';
import { calculateIVRank } from './volatility-analysis.js';

/**
 * Pre-Trade Validator Class
 */
export class PreTradeValidator {
  constructor(massiveClient) {
    this.client = massiveClient;
    this.probCalc = new OptionsProbabilityCalculator(massiveClient);
    this.monitor = new RealTimeOptionsMonitor(massiveClient);
  }

  /**
   * Validate an options trade before entry
   *
   * @param {string} symbol - Underlying symbol
   * @param {string} strategyType - Type of strategy ('iron_condor', 'strangle', 'call_credit_spread', etc.)
   * @param {Object} strikes - Strike prices for the strategy
   * @param {string} expiration - Expiration date (YYYY-MM-DD)
   * @param {Object} options - Additional options
   * @returns {Object} Complete validation report
   */
  async validateTrade(symbol, strategyType, strikes, expiration, options = {}) {
    try {
      const validationChecks = [];

      // Step 1: Get comprehensive market picture
      const marketData = await this.monitor.getCompleteMarketPicture(symbol);

      // Step 2: Calculate probabilities for each strike
      const probabilities = {};

      if (strikes.short_call) {
        probabilities.short_call = await this.probCalc.calculateProbabilities(
          symbol,
          strikes.short_call,
          expiration,
          'call'
        );
      }

      if (strikes.short_put) {
        probabilities.short_put = await this.probCalc.calculateProbabilities(
          symbol,
          strikes.short_put,
          expiration,
          'put'
        );
      }

      if (strikes.long_call) {
        probabilities.long_call = await this.probCalc.calculateProbabilities(
          symbol,
          strikes.long_call,
          expiration,
          'call'
        );
      }

      if (strikes.long_put) {
        probabilities.long_put = await this.probCalc.calculateProbabilities(
          symbol,
          strikes.long_put,
          expiration,
          'put'
        );
      }

      const currentPrice = marketData.underlying.price;

      // Step 3: Run comprehensive validation checks

      // ===== CHECK 1: Strike Buffer Analysis =====
      if (strikes.short_call) {
        const callBuffer = ((strikes.short_call - currentPrice) / currentPrice) * 100;
        const status = callBuffer >= 3 ? 'PASS'
          : callBuffer >= 2 ? 'WARNING'
            : 'FAIL';

        validationChecks.push({
          name: 'Short Call Buffer',
          status: status,
          severity: status === 'FAIL' ? 'CRITICAL' : status === 'WARNING' ? 'HIGH' : 'INFO',
          value: callBuffer,
          threshold: 3.0,
          details: {
            current_price: currentPrice,
            strike: strikes.short_call,
            buffer_pct: callBuffer,
            message: status === 'FAIL'
              ? `⛔ SHORT CALL TOO CLOSE - Only ${callBuffer.toFixed(2)}% buffer`
              : status === 'WARNING'
                ? `⚠️ Short call buffer marginal - ${callBuffer.toFixed(2)}%`
                : `✓ Adequate buffer - ${callBuffer.toFixed(2)}%`
          }
        });
      }

      if (strikes.short_put) {
        const putBuffer = ((currentPrice - strikes.short_put) / currentPrice) * 100;
        const status = putBuffer >= 3 ? 'PASS'
          : putBuffer >= 2 ? 'WARNING'
            : 'FAIL';

        validationChecks.push({
          name: 'Short Put Buffer',
          status: status,
          severity: status === 'FAIL' ? 'CRITICAL' : status === 'WARNING' ? 'HIGH' : 'INFO',
          value: putBuffer,
          threshold: 3.0,
          details: {
            current_price: currentPrice,
            strike: strikes.short_put,
            buffer_pct: putBuffer,
            message: status === 'FAIL'
              ? `⛔ SHORT PUT TOO CLOSE - Only ${putBuffer.toFixed(2)}% buffer`
              : status === 'WARNING'
                ? `⚠️ Short put buffer marginal - ${putBuffer.toFixed(2)}%`
                : `✓ Adequate buffer - ${putBuffer.toFixed(2)}%`
          }
        });
      }

      // ===== CHECK 2: Probability of Touch =====
      if (probabilities.short_call) {
        const probTouch = probabilities.short_call.prob_touch;
        const status = probTouch < 0.50 ? 'PASS'
          : probTouch < 0.65 ? 'WARNING'
            : 'FAIL';

        validationChecks.push({
          name: 'Short Call - Probability of Touch',
          status: status,
          severity: status === 'FAIL' ? 'CRITICAL' : status === 'WARNING' ? 'HIGH' : 'INFO',
          value: probTouch,
          threshold: 0.50,
          details: {
            prob_touch_pct: (probTouch * 100).toFixed(1),
            prob_itm_pct: (probabilities.short_call.prob_itm * 100).toFixed(1),
            message: status === 'FAIL'
              ? `⛔ EXTREME RISK - ${(probTouch * 100).toFixed(1)}% chance of touching short call`
              : status === 'WARNING'
                ? `⚠️ High probability of touch - ${(probTouch * 100).toFixed(1)}%`
                : `✓ Acceptable probability - ${(probTouch * 100).toFixed(1)}%`
          }
        });
      }

      if (probabilities.short_put) {
        const probTouch = probabilities.short_put.prob_touch;
        const status = probTouch < 0.50 ? 'PASS'
          : probTouch < 0.65 ? 'WARNING'
            : 'FAIL';

        validationChecks.push({
          name: 'Short Put - Probability of Touch',
          status: status,
          severity: status === 'FAIL' ? 'CRITICAL' : status === 'WARNING' ? 'HIGH' : 'INFO',
          value: probTouch,
          threshold: 0.50,
          details: {
            prob_touch_pct: (probTouch * 100).toFixed(1),
            prob_itm_pct: (probabilities.short_put.prob_itm * 100).toFixed(1),
            message: status === 'FAIL'
              ? `⛔ EXTREME RISK - ${(probTouch * 100).toFixed(1)}% chance of touching short put`
              : status === 'WARNING'
                ? `⚠️ High probability of touch - ${(probTouch * 100).toFixed(1)}%`
                : `✓ Acceptable probability - ${(probTouch * 100).toFixed(1)}%`
          }
        });
      }

      // ===== CHECK 3: ATR Distance =====
      if (probabilities.short_call) {
        const atrDist = probabilities.short_call.distance_in_atr;
        const status = atrDist >= 2.0 ? 'PASS'
          : atrDist >= 1.5 ? 'WARNING'
            : 'FAIL';

        validationChecks.push({
          name: 'Short Call - ATR Distance',
          status: status,
          severity: status === 'FAIL' ? 'CRITICAL' : status === 'WARNING' ? 'HIGH' : 'INFO',
          value: atrDist,
          threshold: 2.0,
          details: {
            atr_distance: atrDist.toFixed(2),
            atr_value: probabilities.short_call.atr_14d.toFixed(2),
            message: status === 'FAIL'
              ? `⛔ WITHIN DAILY RANGE - Strike only ${atrDist.toFixed(2)} ATR away`
              : status === 'WARNING'
                ? `⚠️ Close to daily range - ${atrDist.toFixed(2)} ATR away`
                : `✓ Outside normal range - ${atrDist.toFixed(2)} ATR away`
          }
        });
      }

      if (probabilities.short_put) {
        const atrDist = probabilities.short_put.distance_in_atr;
        const status = atrDist >= 2.0 ? 'PASS'
          : atrDist >= 1.5 ? 'WARNING'
            : 'FAIL';

        validationChecks.push({
          name: 'Short Put - ATR Distance',
          status: status,
          severity: status === 'FAIL' ? 'CRITICAL' : status === 'WARNING' ? 'HIGH' : 'INFO',
          value: atrDist,
          threshold: 2.0,
          details: {
            atr_distance: atrDist.toFixed(2),
            atr_value: probabilities.short_put.atr_14d.toFixed(2),
            message: status === 'FAIL'
              ? `⛔ WITHIN DAILY RANGE - Strike only ${atrDist.toFixed(2)} ATR away`
              : status === 'WARNING'
                ? `⚠️ Close to daily range - ${atrDist.toFixed(2)} ATR away`
                : `✓ Outside normal range - ${atrDist.toFixed(2)} ATR away`
          }
        });
      }

      // ===== CHECK 4: Implied Volatility Level =====
      const avgIV = probabilities.short_call
        ? probabilities.short_call.implied_volatility
        : probabilities.short_put.implied_volatility;

      const ivPct = avgIV * 100;
      const ivStatus = ivPct < 50 ? 'PASS'
        : ivPct < 75 ? 'WARNING'
          : 'FAIL';

      validationChecks.push({
        name: 'Implied Volatility Level',
        status: ivStatus,
        severity: ivStatus === 'FAIL' ? 'CRITICAL' : ivStatus === 'WARNING' ? 'HIGH' : 'INFO',
        value: avgIV,
        threshold: 0.50,
        details: {
          iv_pct: ivPct.toFixed(1),
          message: ivStatus === 'FAIL'
            ? `⛔ EXTREME VOLATILITY - IV at ${ivPct.toFixed(1)}% - DO NOT SELL OPTIONS`
            : ivStatus === 'WARNING'
              ? `⚠️ Elevated volatility - IV at ${ivPct.toFixed(1)}%`
              : `✓ Normal volatility - IV at ${ivPct.toFixed(1)}%`
        }
      });

      // ===== CHECK 5: IV vs Historical Volatility =====
      const hv = probabilities.short_call?.historical_volatility || probabilities.short_put?.historical_volatility;
      if (hv && hv > 0) {
        const ivHvRatio = avgIV / hv;
        const ratioStatus = ivHvRatio < 1.5 ? 'PASS'
          : ivHvRatio < 2.0 ? 'WARNING'
            : 'FAIL';

        validationChecks.push({
          name: 'IV vs Historical Volatility',
          status: ratioStatus,
          severity: ratioStatus === 'FAIL' ? 'CRITICAL' : ratioStatus === 'WARNING' ? 'HIGH' : 'INFO',
          value: ivHvRatio,
          threshold: 1.5,
          details: {
            iv: (avgIV * 100).toFixed(1),
            hv: (hv * 100).toFixed(1),
            ratio: ivHvRatio.toFixed(2),
            message: ratioStatus === 'FAIL'
              ? `⛔ IV EXTREMELY ELEVATED - ${ivHvRatio.toFixed(2)}x historical volatility`
              : ratioStatus === 'WARNING'
                ? `⚠️ IV elevated vs history - ${ivHvRatio.toFixed(2)}x HV`
                : `✓ IV reasonable vs history - ${ivHvRatio.toFixed(2)}x HV`
          }
        });
      }

      // ===== CHECK 6: Market Environment (VIX) =====
      const vix = marketData.market.vix;
      const vixStatus = vix < 20 ? 'PASS'
        : vix < 25 ? 'WARNING'
          : 'FAIL';

      validationChecks.push({
        name: 'Market Volatility (VIX)',
        status: vixStatus,
        severity: vixStatus === 'FAIL' ? 'CRITICAL' : vixStatus === 'WARNING' ? 'HIGH' : 'INFO',
        value: vix,
        threshold: 20,
        details: {
          vix_level: vix.toFixed(2),
          vix_interpretation: marketData.market.vix_level,
          message: vixStatus === 'FAIL'
            ? `⛔ MARKET FEAR ELEVATED - VIX at ${vix.toFixed(2)}`
            : vixStatus === 'WARNING'
              ? `⚠️ Market volatility elevated - VIX at ${vix.toFixed(2)}`
              : `✓ Normal market volatility - VIX at ${vix.toFixed(2)}`
        }
      });

      // ===== CHECK 7: Market Direction =====
      const spyChange = marketData.market.spy_change_percent;
      const directionStatus = Math.abs(spyChange) < 1.0 ? 'PASS'
        : Math.abs(spyChange) < 1.5 ? 'WARNING'
          : 'FAIL';

      validationChecks.push({
        name: 'Market Direction (SPY)',
        status: directionStatus,
        severity: directionStatus === 'FAIL' ? 'HIGH' : directionStatus === 'WARNING' ? 'MEDIUM' : 'INFO',
        value: spyChange,
        threshold: 1.0,
        details: {
          spy_change_pct: spyChange.toFixed(2),
          market_strength: marketData.market.market_strength,
          message: directionStatus === 'FAIL'
            ? `⚠️ Strong market movement - SPY ${spyChange > 0 ? '+' : ''}${spyChange.toFixed(2)}%`
            : directionStatus === 'WARNING'
              ? `⚠️ Market moving - SPY ${spyChange > 0 ? '+' : ''}${spyChange.toFixed(2)}%`
              : `✓ Market stable - SPY ${spyChange > 0 ? '+' : ''}${spyChange.toFixed(2)}%`
        }
      });

      // ===== CHECK 8: Liquidity (Bid-Ask Spread) =====
      if (probabilities.short_call && probabilities.short_call.bid > 0) {
        const spread = probabilities.short_call.bid_ask_spread;
        const mid = probabilities.short_call.mid;
        const spreadPct = mid > 0 ? (spread / mid) * 100 : 0;

        const liquidityStatus = spreadPct < 10 ? 'PASS'
          : spreadPct < 20 ? 'WARNING'
            : 'FAIL';

        validationChecks.push({
          name: 'Liquidity - Bid/Ask Spread',
          status: liquidityStatus,
          severity: liquidityStatus === 'FAIL' ? 'HIGH' : liquidityStatus === 'WARNING' ? 'MEDIUM' : 'INFO',
          value: spreadPct,
          threshold: 10,
          details: {
            spread_pct: spreadPct.toFixed(1),
            bid: probabilities.short_call.bid.toFixed(2),
            ask: probabilities.short_call.ask.toFixed(2),
            volume: probabilities.short_call.volume,
            open_interest: probabilities.short_call.open_interest,
            message: liquidityStatus === 'FAIL'
              ? `⛔ POOR LIQUIDITY - ${spreadPct.toFixed(1)}% spread, difficult to exit`
              : liquidityStatus === 'WARNING'
                ? `⚠️ Wide spread - ${spreadPct.toFixed(1)}%`
                : `✓ Good liquidity - ${spreadPct.toFixed(1)}% spread`
          }
        });
      }

      // ===== CHECK 9: Days to Expiration =====
      const dte = probabilities.short_call?.days_to_expiration || probabilities.short_put?.days_to_expiration;
      const dteStatus = dte >= 7 ? 'PASS'
        : dte >= 3 ? 'WARNING'
          : 'FAIL';

      validationChecks.push({
        name: 'Days to Expiration',
        status: dteStatus,
        severity: dteStatus === 'FAIL' ? 'HIGH' : dteStatus === 'WARNING' ? 'MEDIUM' : 'INFO',
        value: dte,
        threshold: 7,
        details: {
          dte: dte,
          expiration: expiration,
          message: dteStatus === 'FAIL'
            ? `⚠️ Very short dated - only ${dte} days, high gamma risk`
            : dteStatus === 'WARNING'
              ? `⚠️ Short expiration - ${dte} days`
              : `✓ Adequate time - ${dte} days to expiration`
        }
      });

      // ===== FINAL VERDICT =====
      const failures = validationChecks.filter(c => c.status === 'FAIL');
      const warnings = validationChecks.filter(c => c.status === 'WARNING');
      const criticalFailures = failures.filter(c => c.severity === 'CRITICAL');

      const overallStatus = criticalFailures.length > 0 ? 'REJECTED'
        : failures.length > 0 ? 'HIGH_RISK'
          : warnings.length > 2 ? 'MODERATE_RISK'
            : warnings.length > 0 ? 'LOW_RISK'
              : 'APPROVED';

      return {
        timestamp: new Date().toISOString(),
        symbol: symbol,
        strategy: strategyType,
        expiration: expiration,
        strikes: strikes,

        overall_status: overallStatus,

        summary: {
          total_checks: validationChecks.length,
          passed: validationChecks.filter(c => c.status === 'PASS').length,
          warnings: warnings.length,
          failures: failures.length,
          critical_failures: criticalFailures.length
        },

        checks: validationChecks,
        probabilities: probabilities,
        market_data: marketData,

        recommendation: this.generateRecommendation(overallStatus, failures, warnings, validationChecks, probabilities)
      };
    } catch (error) {
      throw new Error(`Trade validation failed: ${error.message}`);
    }
  }

  /**
   * Generate comprehensive recommendation
   *
   * @param {string} overallStatus - Overall validation status
   * @param {Array} failures - Failed checks
   * @param {Array} warnings - Warning checks
   * @param {Array} allChecks - All validation checks
   * @param {Object} probabilities - Probability analysis
   * @returns {Object} Recommendation
   */
  generateRecommendation(overallStatus, failures, warnings, allChecks, probabilities) {
    if (overallStatus === 'REJECTED') {
      return {
        action: 'DO NOT ENTER TRADE',
        confidence: 'HIGH',
        reason: 'Critical validation failures detected - trade has extreme risk',
        critical_issues: failures.filter(f => f.severity === 'CRITICAL').map(f => ({
          check: f.name,
          problem: f.details.message,
          value: f.value
        })),
        advice: [
          '🚫 This trade setup has fundamental problems',
          '🚫 Do not proceed with this trade',
          '💡 Consider different strikes further OTM',
          '💡 Wait for volatility to decrease',
          '💡 Look for better market conditions'
        ]
      };
    }

    if (overallStatus === 'HIGH_RISK') {
      return {
        action: 'AVOID TRADE',
        confidence: 'MEDIUM-HIGH',
        reason: 'Multiple significant risk factors present',
        issues: failures.map(f => ({
          check: f.name,
          problem: f.details.message,
          value: f.value
        })),
        advice: [
          '⚠️ This trade has substantial risks',
          '⚠️ Consider skipping this opportunity',
          '💡 If proceeding, significantly reduce position size',
          '💡 Set very tight stop losses',
          '💡 Be prepared to exit quickly'
        ]
      };
    }

    if (overallStatus === 'MODERATE_RISK') {
      return {
        action: 'PROCEED WITH CAUTION',
        confidence: 'MEDIUM',
        reason: 'Trade has acceptable risk but requires monitoring',
        considerations: warnings.map(w => ({
          check: w.name,
          consideration: w.details.message,
          value: w.value
        })),
        advice: [
          '✓ Trade is viable but monitor closely',
          '⚠️ Set up alerts at strike levels',
          '💡 Consider 50-75% of normal position size',
          '💡 Review position daily',
          '💡 Have exit plan ready'
        ],
        key_metrics: this.extractKeyMetrics(probabilities)
      };
    }

    if (overallStatus === 'LOW_RISK') {
      return {
        action: 'APPROVED - Minor Cautions',
        confidence: 'MEDIUM-HIGH',
        reason: 'Trade passes validation with minor concerns',
        minor_issues: warnings.map(w => w.details.message),
        advice: [
          '✓ Trade setup looks good',
          '✓ A few minor points to watch',
          '💡 Normal position sizing appropriate',
          '💡 Monitor as usual',
          '💡 Set standard alerts'
        ],
        key_metrics: this.extractKeyMetrics(probabilities)
      };
    }

    // APPROVED
    return {
      action: 'APPROVED - GREEN LIGHT',
      confidence: 'HIGH',
      reason: 'All validation checks passed - trade setup is solid',
      advice: [
        '✅ Excellent trade setup',
        '✅ All risk metrics within acceptable ranges',
        '✅ Proceed with normal position sizing',
        '💡 Set standard alerts and monitoring',
        '💡 Stick to your plan'
      ],
      key_metrics: this.extractKeyMetrics(probabilities)
    };
  }

  /**
   * Extract key probability metrics for recommendation
   *
   * @param {Object} probabilities - Probability calculations
   * @returns {Object} Key metrics
   */
  extractKeyMetrics(probabilities) {
    const metrics = {};

    if (probabilities.short_call) {
      metrics.short_call = {
        prob_touch: `${(probabilities.short_call.prob_touch * 100).toFixed(1)}%`,
        distance_atr: `${probabilities.short_call.distance_in_atr.toFixed(2)} ATR`,
        expected_move: `±$${probabilities.short_call.expected_move.toFixed(2)}`
      };
    }

    if (probabilities.short_put) {
      metrics.short_put = {
        prob_touch: `${(probabilities.short_put.prob_touch * 100).toFixed(1)}%`,
        distance_atr: `${probabilities.short_put.distance_in_atr.toFixed(2)} ATR`,
        expected_move: `±$${probabilities.short_put.expected_move.toFixed(2)}`
      };
    }

    return metrics;
  }
}
