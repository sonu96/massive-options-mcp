/**
 * Options Probability Calculator
 *
 * Calculates probabilities for options trading using Black-Scholes model
 * and historical volatility analysis. Critical for pre-trade validation.
 */

/**
 * Calculate days to expiration from an expiration date string
 * @param {string} expirationDate - Date in YYYY-MM-DD format
 * @returns {number} Days to expiration
 */
function calculateDTE(expirationDate) {
  const expiry = new Date(expirationDate);
  const today = new Date();
  const diffTime = expiry - today;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays > 0 ? diffDays : 0;
}

/**
 * Calculate realized volatility from historical price bars
 * Uses close-to-close method (standard deviation of log returns)
 * @param {Array} bars - Historical OHLC bars
 * @returns {number} Annualized volatility
 */
function calculateRealizedVolatility(bars) {
  if (!bars || bars.length < 2) return 0;

  // Calculate log returns
  const returns = [];
  for (let i = 1; i < bars.length; i++) {
    const logReturn = Math.log(bars[i].c / bars[i - 1].c);
    returns.push(logReturn);
  }

  // Calculate mean return
  const meanReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;

  // Calculate variance
  const variance = returns.reduce((sum, r) =>
    sum + Math.pow(r - meanReturn, 2), 0) / (returns.length - 1);

  // Annualize volatility (sqrt(252) for daily data)
  const volatility = Math.sqrt(variance) * Math.sqrt(252);

  return volatility;
}

/**
 * Calculate Average True Range (ATR)
 * Measures average daily price movement including gaps
 * @param {Array} bars - Historical OHLC bars
 * @param {number} period - Period for ATR calculation (default 14)
 * @returns {number} Average True Range
 */
function calculateATR(bars, period = 14) {
  if (!bars || bars.length < period + 1) return 0;

  const trueRanges = [];

  for (let i = 1; i < bars.length; i++) {
    const high = bars[i].h;
    const low = bars[i].l;
    const prevClose = bars[i - 1].c;

    const tr = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    );

    trueRanges.push(tr);
  }

  // Calculate average of last 'period' true ranges
  const recentTRs = trueRanges.slice(-period);
  const atr = recentTRs.reduce((sum, tr) => sum + tr, 0) / recentTRs.length;

  return atr;
}

/**
 * Standard normal cumulative distribution function
 * Used in Black-Scholes probability calculations
 * @param {number} x - Input value
 * @returns {number} Probability
 */
function normalCDF(x) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp(-x * x / 2);
  const prob = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - prob : prob;
}

/**
 * Options Probability Calculator Class
 */
export class OptionsProbabilityCalculator {
  constructor(massiveClient) {
    this.client = massiveClient;
  }

  /**
   * Calculate comprehensive probabilities for an options position
   *
   * @param {string} symbol - Underlying symbol
   * @param {number} strike - Strike price
   * @param {string} expiration - Expiration date (YYYY-MM-DD)
   * @param {string} optionType - 'call' or 'put'
   * @returns {Object} Complete probability analysis
   */
  async calculateProbabilities(symbol, strike, expiration, optionType) {
    try {
      // Get option snapshot for current data
      const snapshot = await this.client.getOptionSnapshot(symbol, strike, expiration, optionType);

      // Get historical bars for volatility calculations (30 days)
      const toDate = new Date().toISOString().split('T')[0];
      const fromDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const bars = await this.client.getHistoricalBars(symbol, 1, 'day', fromDate, toDate);

      // Extract key parameters
      const S = snapshot.underlying_asset?.price || 0;      // Current stock price
      const K = strike;                                      // Strike price
      const σ = snapshot.implied_volatility || 0;           // Implied volatility
      const T = calculateDTE(expiration) / 365;             // Time to expiry (years)
      const r = 0.045;                                      // Risk-free rate (~4.5%)

      // Validate inputs
      if (S === 0 || σ === 0 || T === 0) {
        throw new Error('Invalid option data - missing price or volatility');
      }

      // Black-Scholes d1 and d2
      const d1 = (Math.log(S / K) + (r + σ ** 2 / 2) * T) / (σ * Math.sqrt(T));
      const d2 = d1 - σ * Math.sqrt(T);

      // Probability calculations
      const probITM = optionType === 'call'
        ? normalCDF(d2)
        : normalCDF(-d2);

      // Probability of touching the strike (approximation)
      // For more accurate calculation, this is roughly 2x the ITM probability
      const probTouch = Math.min(2 * normalCDF(Math.abs(d2)), 1.0);

      // Expected move (1 standard deviation)
      const expectedMove = σ * Math.sqrt(T) * S;

      // Historical volatility analysis
      const historicalVol = calculateRealizedVolatility(bars);
      const atr = calculateATR(bars, 14);

      // Distance metrics
      const distance = Math.abs(S - K);
      const distanceInATR = atr > 0 ? distance / atr : 0;
      const distanceInStdDev = expectedMove > 0 ? distance / expectedMove : 0;

      // Risk assessment
      const riskLevel = this.assessRisk(probTouch, distanceInATR, σ);
      const warnings = this.generateWarnings(probTouch, distanceInATR, σ, S, K, optionType);

      return {
        // Basic parameters
        current_price: S,
        strike: K,
        option_type: optionType,
        days_to_expiration: Math.round(T * 365),
        time_to_expiry_years: T,

        // Probability metrics
        prob_itm: probITM,                                 // Probability of expiring ITM
        prob_otm: 1 - probITM,                            // Probability of expiring OTM
        prob_touch: probTouch,                            // Probability of touching strike

        // Expected moves (standard deviation ranges)
        expected_move: expectedMove,
        expected_move_pct: (expectedMove / S) * 100,
        range_1sd: [S - expectedMove, S + expectedMove],
        range_2sd: [S - 2 * expectedMove, S + 2 * expectedMove],

        // Distance analysis
        distance_to_strike: distance,
        distance_in_dollars: distance,
        distance_in_percent: (distance / S) * 100,
        distance_in_atr: distanceInATR,                   // How many ATR units away?
        distance_in_stddev: distanceInStdDev,             // How many σ away?

        // Volatility context
        implied_volatility: σ,
        implied_volatility_pct: σ * 100,
        historical_volatility: historicalVol,
        historical_volatility_pct: historicalVol * 100,
        iv_hv_ratio: historicalVol > 0 ? σ / historicalVol : 0,
        atr_14d: atr,

        // Greeks from snapshot
        delta: snapshot.greeks?.delta || 0,
        gamma: snapshot.greeks?.gamma || 0,
        theta: snapshot.greeks?.theta || 0,
        vega: snapshot.greeks?.vega || 0,

        // Quote data
        bid: snapshot.last_quote?.bid_price || 0,
        ask: snapshot.last_quote?.ask_price || 0,
        mid: snapshot.last_quote?.mid_price || 0,
        bid_ask_spread: snapshot.last_quote
          ? snapshot.last_quote.ask_price - snapshot.last_quote.bid_price
          : 0,

        // Volume data
        volume: snapshot.day?.volume || 0,
        open_interest: snapshot.open_interest || 0,

        // Risk assessment
        risk_level: riskLevel,
        warnings: warnings,

        // Black-Scholes parameters (for transparency)
        d1: d1,
        d2: d2,
        risk_free_rate: r
      };
    } catch (error) {
      throw new Error(`Failed to calculate probabilities: ${error.message}`);
    }
  }

  /**
   * Assess overall risk level based on probabilities and distance
   *
   * @param {number} probTouch - Probability of touching strike
   * @param {number} distanceInATR - Distance to strike in ATR units
   * @param {number} iv - Implied volatility
   * @returns {string} Risk level
   */
  assessRisk(probTouch, distanceInATR, iv) {
    // Extreme risk conditions
    if (probTouch > 0.75 || distanceInATR < 1.0 || iv > 0.90) {
      return 'EXTREME';
    }

    // High risk conditions
    if (probTouch > 0.60 || distanceInATR < 1.5 || iv > 0.60) {
      return 'HIGH';
    }

    // Moderate risk conditions
    if (probTouch > 0.45 || distanceInATR < 2.0 || iv > 0.40) {
      return 'MODERATE';
    }

    // Low risk
    return 'LOW';
  }

  /**
   * Generate specific warnings based on probability analysis
   *
   * @param {number} probTouch - Probability of touching strike
   * @param {number} distanceInATR - Distance in ATR units
   * @param {number} iv - Implied volatility
   * @param {number} currentPrice - Current stock price
   * @param {number} strike - Strike price
   * @param {string} optionType - 'call' or 'put'
   * @returns {Array} Array of warning messages
   */
  generateWarnings(probTouch, distanceInATR, iv, currentPrice, strike, optionType) {
    const warnings = [];

    // Probability warnings
    if (probTouch > 0.80) {
      warnings.push({
        severity: 'CRITICAL',
        message: `>80% probability of touching strike - EXTREMELY HIGH RISK`,
        metric: 'probability',
        value: probTouch
      });
    } else if (probTouch > 0.70) {
      warnings.push({
        severity: 'HIGH',
        message: `>70% probability of touching strike - HIGH RISK`,
        metric: 'probability',
        value: probTouch
      });
    } else if (probTouch > 0.60) {
      warnings.push({
        severity: 'MEDIUM',
        message: `>60% probability of touching strike - MODERATE RISK`,
        metric: 'probability',
        value: probTouch
      });
    }

    // Distance warnings
    if (distanceInATR < 1.0) {
      warnings.push({
        severity: 'CRITICAL',
        message: `Strike within 1 ATR - VERY CLOSE TO CURRENT PRICE`,
        metric: 'distance',
        value: distanceInATR
      });
    } else if (distanceInATR < 1.5) {
      warnings.push({
        severity: 'HIGH',
        message: `Strike within 1.5 ATR - strike within typical daily range`,
        metric: 'distance',
        value: distanceInATR
      });
    } else if (distanceInATR < 2.0) {
      warnings.push({
        severity: 'MEDIUM',
        message: `Strike within 2 ATR - close to normal daily movement`,
        metric: 'distance',
        value: distanceInATR
      });
    }

    // Volatility warnings
    if (iv > 0.90) {
      warnings.push({
        severity: 'CRITICAL',
        message: `EXTREME VOLATILITY (IV ${(iv * 100).toFixed(0)}%) - AVOID SELLING OPTIONS`,
        metric: 'volatility',
        value: iv
      });
    } else if (iv > 0.60) {
      warnings.push({
        severity: 'HIGH',
        message: `High implied volatility (${(iv * 100).toFixed(0)}%) - expect large moves`,
        metric: 'volatility',
        value: iv
      });
    } else if (iv > 0.40) {
      warnings.push({
        severity: 'MEDIUM',
        message: `Elevated volatility (${(iv * 100).toFixed(0)}%) - monitor closely`,
        metric: 'volatility',
        value: iv
      });
    }

    // Price proximity warnings
    const distancePct = Math.abs(currentPrice - strike) / currentPrice * 100;
    if (distancePct < 1) {
      warnings.push({
        severity: 'CRITICAL',
        message: `Stock within 1% of strike - IMMEDIATE DANGER ZONE`,
        metric: 'proximity',
        value: distancePct
      });
    } else if (distancePct < 2) {
      warnings.push({
        severity: 'HIGH',
        message: `Stock within 2% of strike - entering danger zone`,
        metric: 'proximity',
        value: distancePct
      });
    } else if (distancePct < 3) {
      warnings.push({
        severity: 'MEDIUM',
        message: `Stock within 3% of strike - close to warning level`,
        metric: 'proximity',
        value: distancePct
      });
    }

    return warnings;
  }

  /**
   * Calculate IV Rank (where current IV stands in 52-week range)
   * Requires historical IV data
   *
   * @param {string} symbol - Underlying symbol
   * @param {number} currentIV - Current implied volatility
   * @returns {number} IV Rank (0-100)
   */
  async calculateIVRank(symbol, currentIV) {
    try {
      // Get 1 year of option data to build IV history
      const toDate = new Date().toISOString().split('T')[0];
      const fromDate = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      // This would need historical IV data - approximation for now
      // In production, you'd cache daily IV snapshots

      // Simplified: use HV as proxy for IV range
      const bars = await this.client.getHistoricalBars(symbol, 1, 'day', fromDate, toDate);

      // Calculate rolling 30-day HV for each day
      const hvSeries = [];
      for (let i = 30; i < bars.length; i++) {
        const window = bars.slice(i - 30, i);
        const hv = calculateRealizedVolatility(window);
        hvSeries.push(hv);
      }

      if (hvSeries.length === 0) return 50; // Default to middle

      const minIV = Math.min(...hvSeries);
      const maxIV = Math.max(...hvSeries);

      // IV Rank = (current IV - min IV) / (max IV - min IV) * 100
      const ivRank = ((currentIV - minIV) / (maxIV - minIV)) * 100;

      return Math.max(0, Math.min(100, ivRank));
    } catch (error) {
      console.error('Failed to calculate IV Rank:', error.message);
      return 50; // Default to middle if calculation fails
    }
  }
}
