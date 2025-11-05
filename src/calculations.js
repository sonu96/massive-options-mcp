// Options calculations module
// Provides advanced calculations for options trading

/**
 * Calculate break-even price for an option
 * @param {string} type - 'call' or 'put'
 * @param {number} strike - Strike price
 * @param {number} premium - Option premium paid
 * @returns {number} Break-even price
 */
export function calculateBreakeven(type, strike, premium) {
  if (type === 'call') {
    return strike + premium;
  } else if (type === 'put') {
    return strike - premium;
  }
  throw new Error('Invalid option type. Must be "call" or "put"');
}

/**
 * Calculate intrinsic value of an option
 * @param {string} type - 'call' or 'put'
 * @param {number} strike - Strike price
 * @param {number} stockPrice - Current stock price
 * @returns {number} Intrinsic value
 */
export function calculateIntrinsicValue(type, strike, stockPrice) {
  if (type === 'call') {
    return Math.max(0, stockPrice - strike);
  } else if (type === 'put') {
    return Math.max(0, strike - stockPrice);
  }
  throw new Error('Invalid option type. Must be "call" or "put"');
}

/**
 * Calculate time value of an option
 * @param {number} optionPrice - Current option price
 * @param {number} intrinsicValue - Intrinsic value
 * @returns {number} Time value
 */
export function calculateTimeValue(optionPrice, intrinsicValue) {
  return Math.max(0, optionPrice - intrinsicValue);
}

/**
 * Determine moneyness of an option
 * @param {string} type - 'call' or 'put'
 * @param {number} strike - Strike price
 * @param {number} stockPrice - Current stock price
 * @returns {string} Moneyness category
 */
export function calculateMoneyness(type, strike, stockPrice) {
  const percentFromStrike = ((stockPrice - strike) / strike) * 100;
  
  if (type === 'call') {
    if (percentFromStrike > 5) return 'ITM (In The Money)';
    if (percentFromStrike < -5) return 'OTM (Out of The Money)';
    return 'ATM (At The Money)';
  } else {
    if (percentFromStrike < -5) return 'ITM (In The Money)';
    if (percentFromStrike > 5) return 'OTM (Out of The Money)';
    return 'ATM (At The Money)';
  }
}

/**
 * Calculate moneyness percentage
 * @param {string} type - 'call' or 'put'
 * @param {number} strike - Strike price
 * @param {number} stockPrice - Current stock price
 * @returns {number} Percentage away from strike
 */
export function calculateMoneynessPercent(type, strike, stockPrice) {
  const percent = ((stockPrice - strike) / strike) * 100;
  return type === 'call' ? percent : -percent;
}

/**
 * Calculate detailed moneyness category
 * @param {string} type - 'call' or 'put'
 * @param {number} strike - Strike price
 * @param {number} stockPrice - Current stock price
 * @returns {string} Detailed moneyness category
 */
export function getDetailedMoneyness(type, strike, stockPrice) {
  const percent = calculateMoneynessPercent(type, strike, stockPrice);
  
  if (percent > 20) return 'Deep ITM';
  if (percent > 5) return 'ITM';
  if (percent > -5) return 'ATM';
  if (percent > -20) return 'OTM';
  return 'Deep OTM';
}

/**
 * Cumulative normal distribution function
 * Used in Black-Scholes calculations
 */
function normalCDF(x) {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.sqrt(2);
  
  const t = 1 / (1 + p * x);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  
  return 0.5 * (1 + sign * y);
}

/**
 * Calculate probability of option expiring in the money using Black-Scholes
 * @param {Object} params - Calculation parameters
 * @returns {number} Probability between 0 and 1
 */
export function calculateProbabilityITM(params) {
  const { type, strike, stockPrice, volatility, dte, riskFreeRate = 0.05 } = params;
  
  // Convert days to years
  const timeToExpiry = dte / 365;
  
  // Avoid division by zero
  if (timeToExpiry <= 0 || volatility <= 0) {
    return type === 'call' ? (stockPrice > strike ? 1 : 0) : (stockPrice < strike ? 1 : 0);
  }
  
  // Calculate d2 from Black-Scholes
  const d2 = (Math.log(stockPrice / strike) + (riskFreeRate - 0.5 * volatility * volatility) * timeToExpiry) 
             / (volatility * Math.sqrt(timeToExpiry));
  
  // Probability is N(d2) for calls, N(-d2) for puts
  if (type === 'call') {
    return normalCDF(d2);
  } else {
    return normalCDF(-d2);
  }
}

/**
 * Calculate expected move based on implied volatility
 * @param {number} stockPrice - Current stock price
 * @param {number} iv - Implied volatility (annualized)
 * @param {number} dte - Days to expiration
 * @returns {Object} Expected move up and down
 */
export function calculateExpectedMove(stockPrice, iv, dte) {
  // Convert to time fraction
  const timeFactor = Math.sqrt(dte / 365);
  
  // 1 standard deviation move
  const oneSigmaMove = stockPrice * iv * timeFactor;
  
  return {
    oneSigmaUp: stockPrice + oneSigmaMove,
    oneSigmaDown: stockPrice - oneSigmaMove,
    twoSigmaUp: stockPrice + (2 * oneSigmaMove),
    twoSigmaDown: stockPrice - (2 * oneSigmaMove),
    expectedMovePercent: (oneSigmaMove / stockPrice) * 100,
    expectedMoveAmount: oneSigmaMove
  };
}

/**
 * Calculate option leverage (lambda)
 * @param {number} delta - Option delta
 * @param {number} stockPrice - Current stock price
 * @param {number} optionPrice - Current option price
 * @returns {number} Leverage factor
 */
export function calculateLeverage(delta, stockPrice, optionPrice) {
  if (optionPrice <= 0) return 0;
  return Math.abs(delta * stockPrice / optionPrice);
}

/**
 * Calculate daily theta (time decay)
 * @param {number} theta - Annual theta from Greeks
 * @returns {number} Daily theta
 */
export function calculateDailyTheta(theta) {
  return theta / 365;
}

/**
 * Calculate risk/reward ratio
 * @param {string} type - 'call' or 'put'
 * @param {number} premium - Option premium paid
 * @param {number} strike - Strike price
 * @param {number} stockPrice - Current stock price
 * @param {number} target - Target price
 * @returns {Object} Risk/reward metrics
 */
export function calculateRiskReward(type, premium, strike, stockPrice, target) {
  const maxRisk = premium;
  let maxReward, profitAtTarget;
  
  if (type === 'call') {
    maxReward = Infinity; // Unlimited upside
    profitAtTarget = Math.max(0, target - strike) - premium;
  } else {
    maxReward = strike - premium; // Max when stock goes to 0
    profitAtTarget = Math.max(0, strike - target) - premium;
  }
  
  return {
    maxRisk,
    maxReward,
    profitAtTarget,
    riskRewardRatio: maxReward === Infinity ? 'Unlimited' : (maxReward / maxRisk).toFixed(2),
    breakEvenMove: type === 'call' ? strike + premium - stockPrice : stockPrice - (strike - premium),
    breakEvenPercent: type === 'call' ? 
      ((strike + premium - stockPrice) / stockPrice * 100) :
      ((stockPrice - (strike - premium)) / stockPrice * 100)
  };
}

/**
 * Calculate volume/OI ratio
 * @param {number} volume - Daily volume
 * @param {number} openInterest - Open interest
 * @returns {Object} Volume analysis
 */
export function calculateVolumeOIRatio(volume, openInterest) {
  const ratio = openInterest > 0 ? volume / openInterest : 0;
  
  return {
    ratio,
    interpretation: ratio > 1 ? 'High activity - possible new positions' : 
                   ratio > 0.5 ? 'Moderate activity' : 
                   'Low activity - mostly holding',
    isUnusual: ratio > 2
  };
}

/**
 * Calculate all analytics for an option
 * @param {Object} optionData - Option data including quote, Greeks, etc.
 * @param {number} stockPrice - Current stock price
 * @returns {Object} Complete analytics
 */
export function calculateFullAnalytics(optionData, stockPrice) {
  const { 
    contract_type: type, 
    strike_price: strike, 
    expiration_date: expiration,
    quote,
    greeks,
    implied_volatility: iv,
    open_interest: oi
  } = optionData;
  
  // Calculate days to expiration
  const dte = Math.max(0, Math.floor((new Date(expiration) - new Date()) / (1000 * 60 * 60 * 24)));
  
  // Current option price
  const optionPrice = quote?.last || 0;
  
  // Core calculations
  const intrinsicValue = calculateIntrinsicValue(type, strike, stockPrice);
  const timeValue = calculateTimeValue(optionPrice, intrinsicValue);
  const breakeven = calculateBreakeven(type, strike, optionPrice);
  
  // Advanced calculations
  const probabilityITM = calculateProbabilityITM({
    type, strike, stockPrice, volatility: iv || 0.3, dte
  });
  
  const expectedMove = calculateExpectedMove(stockPrice, iv || 0.3, dte);
  const leverage = calculateLeverage(greeks?.delta || 0, stockPrice, optionPrice);
  const dailyTheta = calculateDailyTheta(greeks?.theta || 0);
  
  // Volume analysis
  const volumeAnalysis = calculateVolumeOIRatio(quote?.volume || 0, oi || 0);
  
  return {
    // Identification
    type,
    strike,
    expiration,
    dte,
    
    // Pricing
    price: optionPrice,
    intrinsicValue: parseFloat(intrinsicValue.toFixed(2)),
    timeValue: parseFloat(timeValue.toFixed(2)),
    breakeven: parseFloat(breakeven.toFixed(2)),
    
    // Moneyness
    moneyness: calculateMoneyness(type, strike, stockPrice),
    moneynessDetail: getDetailedMoneyness(type, strike, stockPrice),
    moneynessPercent: parseFloat(calculateMoneynessPercent(type, strike, stockPrice).toFixed(2)),
    
    // Probability & Risk
    probabilityITM: parseFloat(probabilityITM.toFixed(4)),
    probabilityOTM: parseFloat((1 - probabilityITM).toFixed(4)),
    
    // Expected Move
    expectedMove: {
      amount: parseFloat(expectedMove.expectedMoveAmount.toFixed(2)),
      percent: parseFloat(expectedMove.expectedMovePercent.toFixed(2)),
      oneSigmaRange: [
        parseFloat(expectedMove.oneSigmaDown.toFixed(2)),
        parseFloat(expectedMove.oneSigmaUp.toFixed(2))
      ],
      twoSigmaRange: [
        parseFloat(expectedMove.twoSigmaDown.toFixed(2)),
        parseFloat(expectedMove.twoSigmaUp.toFixed(2))
      ]
    },
    
    // Advanced Metrics
    leverage: parseFloat(leverage.toFixed(2)),
    dailyTheta: parseFloat(dailyTheta.toFixed(4)),
    
    // Volume Analysis
    volumeOIRatio: parseFloat(volumeAnalysis.ratio.toFixed(2)),
    volumeInterpretation: volumeAnalysis.interpretation,
    unusualActivity: volumeAnalysis.isUnusual
  };
}