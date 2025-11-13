/**
 * Real-Time Options Monitor
 *
 * Provides comprehensive real-time market context for options trading decisions.
 * Monitors underlying price, market conditions, and technical indicators.
 */

/**
 * Calculate VWAP (Volume-Weighted Average Price) from intraday bars
 * @param {Array} bars - Intraday price bars
 * @returns {number} VWAP
 */
function calculateVWAP(bars) {
  if (!bars || bars.length === 0) return 0;

  let totalPV = 0;
  let totalVolume = 0;

  for (const bar of bars) {
    const typicalPrice = (bar.h + bar.l + bar.c) / 3;
    totalPV += typicalPrice * bar.v;
    totalVolume += bar.v;
  }

  return totalVolume > 0 ? totalPV / totalVolume : 0;
}

/**
 * Calculate current price distance from VWAP
 * @param {number} currentPrice - Current price
 * @param {number} vwap - VWAP value
 * @returns {Object} Distance metrics
 */
function calculateVWAPDistance(currentPrice, vwap) {
  const distance = currentPrice - vwap;
  const distancePct = vwap > 0 ? (distance / vwap) * 100 : 0;

  return {
    dollars: distance,
    percent: distancePct,
    above_vwap: distance > 0,
    interpretation: distancePct > 2 ? 'Significantly above VWAP'
      : distancePct < -2 ? 'Significantly below VWAP'
        : 'Near VWAP'
  };
}

/**
 * Calculate intraday range metrics
 * @param {Array} bars - Intraday bars
 * @returns {Object} Range statistics
 */
function calculateIntradayRange(bars) {
  if (!bars || bars.length === 0) {
    return {
      high: 0,
      low: 0,
      range: 0,
      range_pct: 0,
      open: 0
    };
  }

  const high = Math.max(...bars.map(b => b.h));
  const low = Math.min(...bars.map(b => b.l));
  const open = bars[0].o;
  const range = high - low;
  const rangePct = open > 0 ? (range / open) * 100 : 0;

  return {
    high,
    low,
    range,
    range_pct: rangePct,
    open
  };
}

/**
 * Assess market strength based on price action and volume
 * @param {Object} snapshotData - Market snapshot data
 * @returns {string} Market strength assessment
 */
function assessMarketStrength(snapshotData) {
  const changePct = snapshotData.session?.change_percent || 0;
  const volume = snapshotData.session?.volume || 0;

  // Compare to typical volume (simplified - in production, use historical average)
  const isHighVolume = volume > 100000000; // Rough threshold for SPY

  if (changePct > 1.0 && isHighVolume) return 'STRONG_BULLISH';
  if (changePct > 0.5) return 'MODERATE_BULLISH';
  if (changePct > 0) return 'WEAK_BULLISH';
  if (changePct < -1.0 && isHighVolume) return 'STRONG_BEARISH';
  if (changePct < -0.5) return 'MODERATE_BEARISH';
  if (changePct < 0) return 'WEAK_BEARISH';
  return 'NEUTRAL';
}

/**
 * Real-Time Options Monitor Class
 */
export class RealTimeOptionsMonitor {
  constructor(massiveClient) {
    this.client = massiveClient;
  }

  /**
   * Get complete market picture for options trading decision
   *
   * @param {string} symbol - Underlying symbol
   * @param {string} optionContract - Optional specific option contract
   * @returns {Object} Comprehensive market context
   */
  async getCompleteMarketPicture(symbol, optionContract = null) {
    try {
      const today = new Date().toISOString().split('T')[0];

      // Parallel API calls for efficiency
      const [
        underlyingSnapshot,
        intradayBars,
        vixData,
        spyData,
        technicalRSI,
        technicalSMA20,
        technicalSMA50,
        optionSnapshot
      ] = await Promise.all([
        // Underlying stock snapshot
        this.client.getQuote(symbol),

        // Intraday 5-minute bars for VWAP and range
        this.client.getIntradayBars(symbol, 5, 'minute', today).catch(() => []),

        // VIX for market volatility
        this.client.getQuote('VIX').catch(() => null),

        // SPY for market direction
        this.client.getQuote('SPY').catch(() => null),

        // Technical indicators
        this.client.getRSI(symbol, 14).catch(() => null),
        this.client.getSMA(symbol, 20).catch(() => null),
        this.client.getSMA(symbol, 50).catch(() => null),

        // Option contract snapshot if provided
        optionContract
          ? this.client.getSpecificOptionSnapshot(symbol, optionContract).catch(() => null)
          : Promise.resolve(null)
      ]);

      // Calculate intraday metrics
      const vwap = calculateVWAP(intradayBars);
      const range = calculateIntradayRange(intradayBars);
      const currentPrice = underlyingSnapshot?.price || 0;
      const vwapDistance = calculateVWAPDistance(currentPrice, vwap);

      // Market context
      const marketStrength = spyData ? assessMarketStrength(spyData) : 'UNKNOWN';
      const vixLevel = vixData?.price || 0;

      return {
        timestamp: new Date().toISOString(),
        symbol: symbol,

        // Underlying asset data
        underlying: {
          price: currentPrice,
          change: underlyingSnapshot?.change || 0,
          change_percent: underlyingSnapshot?.change_percent || 0,
          volume: underlyingSnapshot?.volume || 0,

          // Intraday data
          intraday: {
            high: range.high,
            low: range.low,
            range: range.range,
            range_pct: range.range_pct,
            open: range.open,
            vwap: vwap,
            distance_from_vwap: vwapDistance,
            bars_count: intradayBars.length
          },

          // Technical indicators
          technicals: {
            rsi: technicalRSI?.values?.[0]?.value || null,
            sma_20: technicalSMA20?.values?.[0]?.value || null,
            sma_50: technicalSMA50?.values?.[0]?.value || null,
            price_vs_sma20: technicalSMA20?.values?.[0]?.value
              ? ((currentPrice - technicalSMA20.values[0].value) / technicalSMA20.values[0].value * 100)
              : null,
            price_vs_sma50: technicalSMA50?.values?.[0]?.value
              ? ((currentPrice - technicalSMA50.values[0].value) / technicalSMA50.values[0].value * 100)
              : null
          }
        },

        // Market conditions
        market: {
          vix: vixLevel,
          vix_level: vixLevel < 15 ? 'LOW'
            : vixLevel < 20 ? 'NORMAL'
              : vixLevel < 30 ? 'ELEVATED'
                : 'HIGH',

          spy_price: spyData?.price || 0,
          spy_change: spyData?.change || 0,
          spy_change_percent: spyData?.change_percent || 0,
          spy_volume: spyData?.volume || 0,

          market_strength: marketStrength,
          market_status: underlyingSnapshot?.market_status || 'unknown',

          risk_environment: this.assessRiskEnvironment(vixLevel, marketStrength)
        },

        // Option-specific data (if contract provided)
        option: optionSnapshot ? {
          strike: optionSnapshot.details?.strike_price,
          expiration: optionSnapshot.details?.expiration_date,
          contract_type: optionSnapshot.details?.contract_type,

          bid: optionSnapshot.last_quote?.bid_price || 0,
          ask: optionSnapshot.last_quote?.ask_price || 0,
          mid: optionSnapshot.last_quote?.mid_price || 0,
          last: optionSnapshot.last_trade?.price || 0,

          implied_volatility: optionSnapshot.implied_volatility || 0,
          greeks: optionSnapshot.greeks || {},

          volume: optionSnapshot.day?.volume || 0,
          open_interest: optionSnapshot.open_interest || 0
        } : null
      };
    } catch (error) {
      throw new Error(`Failed to get market picture: ${error.message}`);
    }
  }

  /**
   * Assess overall risk environment
   * @param {number} vix - VIX level
   * @param {string} marketStrength - Market strength assessment
   * @returns {string} Risk environment
   */
  assessRiskEnvironment(vix, marketStrength) {
    const isHighVix = vix > 25;
    const isStrongMove = marketStrength.includes('STRONG');

    if (isHighVix && isStrongMove) return 'VERY_HIGH';
    if (isHighVix) return 'HIGH';
    if (isStrongMove) return 'MODERATE';
    return 'NORMAL';
  }

  /**
   * Evaluate if it's safe to enter a trade based on real-time conditions
   *
   * @param {Object} marketData - Market data from getCompleteMarketPicture
   * @param {Object} strikes - Strike prices { short_call, short_put, long_call, long_put }
   * @returns {Object} Entry decision
   */
  shouldEnterTrade(marketData, strikes) {
    const warnings = [];
    const checks = [];

    const currentPrice = marketData.underlying.price;

    // Check #1: Underlying already breached strike zone
    if (strikes.short_call && currentPrice >= strikes.short_call * 0.98) {
      warnings.push({
        severity: 'CRITICAL',
        check: 'Price vs Short Call',
        message: `DANGER: Stock at ${currentPrice.toFixed(2)}, only ${((strikes.short_call - currentPrice) / currentPrice * 100).toFixed(2)}% from short call ${strikes.short_call}`,
        should_block: true
      });
    } else if (strikes.short_call) {
      checks.push({
        check: 'Price vs Short Call',
        status: 'PASS',
        message: `Stock ${((strikes.short_call - currentPrice) / currentPrice * 100).toFixed(2)}% below short call`
      });
    }

    if (strikes.short_put && currentPrice <= strikes.short_put * 1.02) {
      warnings.push({
        severity: 'CRITICAL',
        check: 'Price vs Short Put',
        message: `DANGER: Stock at ${currentPrice.toFixed(2)}, only ${((currentPrice - strikes.short_put) / currentPrice * 100).toFixed(2)}% from short put ${strikes.short_put}`,
        should_block: true
      });
    } else if (strikes.short_put) {
      checks.push({
        check: 'Price vs Short Put',
        status: 'PASS',
        message: `Stock ${((currentPrice - strikes.short_put) / currentPrice * 100).toFixed(2)}% above short put`
      });
    }

    // Check #2: VIX elevated
    if (marketData.market.vix > 25) {
      warnings.push({
        severity: 'HIGH',
        check: 'VIX Level',
        message: `WARNING: VIX at ${marketData.market.vix.toFixed(2)} (>25), high volatility environment`,
        should_block: false
      });
    } else if (marketData.market.vix > 20) {
      warnings.push({
        severity: 'MEDIUM',
        check: 'VIX Level',
        message: `CAUTION: VIX at ${marketData.market.vix.toFixed(2)} (>20), elevated volatility`,
        should_block: false
      });
    } else {
      checks.push({
        check: 'VIX Level',
        status: 'PASS',
        message: `VIX at ${marketData.market.vix.toFixed(2)}, normal volatility`
      });
    }

    // Check #3: Market direction
    const spyChangePct = marketData.market.spy_change_percent;
    if (Math.abs(spyChangePct) > 1.5) {
      warnings.push({
        severity: 'MEDIUM',
        check: 'Market Direction',
        message: `WARNING: Market showing strong ${spyChangePct > 0 ? 'upward' : 'downward'} movement (SPY ${spyChangePct > 0 ? '+' : ''}${spyChangePct.toFixed(2)}%)`,
        should_block: false
      });
    } else {
      checks.push({
        check: 'Market Direction',
        status: 'PASS',
        message: `Market stable (SPY ${spyChangePct > 0 ? '+' : ''}${spyChangePct.toFixed(2)}%)`
      });
    }

    // Check #4: Intraday range
    const rangePct = marketData.underlying.intraday.range_pct;
    if (rangePct > 3.0) {
      warnings.push({
        severity: 'HIGH',
        check: 'Intraday Volatility',
        message: `WARNING: Large intraday range (${rangePct.toFixed(2)}%), stock moving significantly`,
        should_block: false
      });
    } else {
      checks.push({
        check: 'Intraday Volatility',
        status: 'PASS',
        message: `Normal intraday range (${rangePct.toFixed(2)}%)`
      });
    }

    // Check #5: VWAP deviation
    const vwapDeviation = Math.abs(marketData.underlying.intraday.distance_from_vwap.percent);
    if (vwapDeviation > 2) {
      warnings.push({
        severity: 'MEDIUM',
        check: 'VWAP Deviation',
        message: `Price ${vwapDeviation.toFixed(2)}% from VWAP, potential reversion`,
        should_block: false
      });
    } else {
      checks.push({
        check: 'VWAP Deviation',
        status: 'PASS',
        message: `Price near VWAP (${vwapDeviation.toFixed(2)}% deviation)`
      });
    }

    // Check #6: Market hours
    const marketStatus = marketData.market.market_status;
    if (marketStatus !== 'open' && marketStatus !== 'regular_trading') {
      warnings.push({
        severity: 'MEDIUM',
        check: 'Market Hours',
        message: `CAUTION: Market is ${marketStatus}, consider waiting for regular hours`,
        should_block: false
      });
    } else {
      checks.push({
        check: 'Market Hours',
        status: 'PASS',
        message: 'Market is open for regular trading'
      });
    }

    // Determine overall safety
    const criticalWarnings = warnings.filter(w => w.should_block);
    const safeToEnter = criticalWarnings.length === 0;

    return {
      safe_to_enter: safeToEnter,
      overall_assessment: safeToEnter
        ? (warnings.length > 0 ? 'PROCEED_WITH_CAUTION' : 'APPROVED')
        : 'REJECTED',
      warnings: warnings,
      passed_checks: checks,
      summary: {
        total_checks: checks.length + warnings.length,
        passed: checks.length,
        warnings: warnings.filter(w => !w.should_block).length,
        critical: criticalWarnings.length
      },
      recommendation: this.generateEntryRecommendation(safeToEnter, warnings, marketData)
    };
  }

  /**
   * Generate entry recommendation based on checks
   * @param {boolean} safeToEnter - Whether entry is safe
   * @param {Array} warnings - List of warnings
   * @param {Object} marketData - Market data
   * @returns {Object} Recommendation
   */
  generateEntryRecommendation(safeToEnter, warnings, marketData) {
    if (!safeToEnter) {
      const blocking = warnings.filter(w => w.should_block);
      return {
        action: 'DO_NOT_ENTER',
        reason: 'Critical safety checks failed',
        blocking_issues: blocking.map(w => w.message),
        next_steps: ['Wait for conditions to improve', 'Consider different strikes', 'Re-evaluate strategy']
      };
    }

    if (warnings.length > 0) {
      return {
        action: 'PROCEED_WITH_CAUTION',
        reason: 'Entry permitted but some warnings present',
        considerations: warnings.map(w => w.message),
        next_steps: [
          'Monitor position closely',
          'Set tight stop losses',
          'Consider reducing position size',
          'Be ready to exit quickly'
        ]
      };
    }

    return {
      action: 'APPROVED',
      reason: 'All safety checks passed',
      market_conditions: `VIX: ${marketData.market.vix.toFixed(2)}, Market: ${marketData.market.market_strength}`,
      next_steps: [
        'Execute trade as planned',
        'Set up alerts for strike levels',
        'Monitor daily at close'
      ]
    };
  }
}
