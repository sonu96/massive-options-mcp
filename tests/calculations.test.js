import {
  calculateBreakeven,
  calculateIntrinsicValue,
  calculateTimeValue,
  calculateMoneyness,
  calculateMoneynessPercent,
  getDetailedMoneyness,
  calculateProbabilityITM,
  calculateExpectedMove,
  calculateLeverage,
  calculateDailyTheta,
  calculateRiskReward,
  calculateVolumeOIRatio,
  calculateFullAnalytics
} from '../src/calculations.js';

describe('Options Calculations', () => {
  describe('Break-even Calculations', () => {
    test('Call break-even = strike + premium', () => {
      expect(calculateBreakeven('call', 70, 2.27)).toBe(72.27);
      expect(calculateBreakeven('call', 100, 5.50)).toBe(105.50);
    });

    test('Put break-even = strike - premium', () => {
      expect(calculateBreakeven('put', 70, 2.27)).toBe(67.73);
      expect(calculateBreakeven('put', 100, 5.50)).toBe(94.50);
    });

    test('Throws error for invalid option type', () => {
      expect(() => calculateBreakeven('invalid', 70, 2.27)).toThrow('Invalid option type');
    });
  });

  describe('Intrinsic Value Calculations', () => {
    test('Call intrinsic value when ITM', () => {
      expect(calculateIntrinsicValue('call', 70, 75)).toBe(5);
      expect(calculateIntrinsicValue('call', 70, 80)).toBe(10);
    });

    test('Call intrinsic value when OTM', () => {
      expect(calculateIntrinsicValue('call', 70, 65)).toBe(0);
      expect(calculateIntrinsicValue('call', 70, 60)).toBe(0);
    });

    test('Put intrinsic value when ITM', () => {
      expect(calculateIntrinsicValue('put', 70, 65)).toBe(5);
      expect(calculateIntrinsicValue('put', 70, 60)).toBe(10);
    });

    test('Put intrinsic value when OTM', () => {
      expect(calculateIntrinsicValue('put', 70, 75)).toBe(0);
      expect(calculateIntrinsicValue('put', 70, 80)).toBe(0);
    });
  });

  describe('Time Value Calculations', () => {
    test('Time value = option price - intrinsic value', () => {
      expect(calculateTimeValue(7.50, 5)).toBe(2.50);
      expect(calculateTimeValue(2.27, 0)).toBe(2.27);
    });

    test('Time value cannot be negative', () => {
      expect(calculateTimeValue(5, 7)).toBe(0);
    });
  });

  describe('Moneyness Calculations', () => {
    test('Call moneyness categories', () => {
      expect(calculateMoneyness('call', 70, 75)).toBe('ITM (In The Money)');
      expect(calculateMoneyness('call', 70, 72)).toBe('ATM (At The Money)');
      expect(calculateMoneyness('call', 70, 65)).toBe('OTM (Out of The Money)');
    });

    test('Put moneyness categories', () => {
      expect(calculateMoneyness('put', 70, 65)).toBe('ITM (In The Money)');
      expect(calculateMoneyness('put', 70, 68)).toBe('ATM (At The Money)');
      expect(calculateMoneyness('put', 70, 75)).toBe('OTM (Out of The Money)');
    });

    test('Moneyness percentage calculations', () => {
      expect(calculateMoneynessPercent('call', 70, 77)).toBeCloseTo(10);
      expect(calculateMoneynessPercent('call', 70, 63)).toBeCloseTo(-10);
      expect(calculateMoneynessPercent('put', 70, 63)).toBeCloseTo(10);
      expect(calculateMoneynessPercent('put', 70, 77)).toBeCloseTo(-10);
    });

    test('Detailed moneyness categories', () => {
      expect(getDetailedMoneyness('call', 70, 90)).toBe('Deep ITM');
      expect(getDetailedMoneyness('call', 70, 75)).toBe('ITM');
      expect(getDetailedMoneyness('call', 70, 70)).toBe('ATM');
      expect(getDetailedMoneyness('call', 70, 65)).toBe('OTM');
      expect(getDetailedMoneyness('call', 70, 50)).toBe('Deep OTM');
    });
  });

  describe('Probability Calculations', () => {
    test('Probability of ITM for ATM option', () => {
      const prob = calculateProbabilityITM({
        type: 'call',
        strike: 70,
        stockPrice: 70,
        volatility: 0.3,
        dte: 30,
        riskFreeRate: 0.05
      });
      // ATM option should be close to 50% probability
      expect(prob).toBeGreaterThan(0.45);
      expect(prob).toBeLessThan(0.55);
    });

    test('Probability of ITM for deep ITM call', () => {
      const prob = calculateProbabilityITM({
        type: 'call',
        strike: 50,
        stockPrice: 70,
        volatility: 0.3,
        dte: 30
      });
      expect(prob).toBeGreaterThan(0.9);
    });

    test('Probability of ITM for deep OTM call', () => {
      const prob = calculateProbabilityITM({
        type: 'call',
        strike: 90,
        stockPrice: 70,
        volatility: 0.3,
        dte: 30
      });
      expect(prob).toBeLessThan(0.1);
    });

    test('Probability at expiration (0 DTE)', () => {
      const probITM = calculateProbabilityITM({
        type: 'call',
        strike: 70,
        stockPrice: 75,
        volatility: 0.3,
        dte: 0
      });
      expect(probITM).toBe(1); // Already ITM

      const probOTM = calculateProbabilityITM({
        type: 'call',
        strike: 70,
        stockPrice: 65,
        volatility: 0.3,
        dte: 0
      });
      expect(probOTM).toBe(0); // Already OTM
    });
  });

  describe('Expected Move Calculations', () => {
    test('Expected move calculation', () => {
      const move = calculateExpectedMove(100, 0.3, 30);
      
      // 30-day expected move with 30% IV
      expect(move.expectedMovePercent).toBeCloseTo(8.6, 1);
      expect(move.expectedMoveAmount).toBeCloseTo(8.6, 1);
      expect(move.oneSigmaUp).toBeCloseTo(108.6, 1);
      expect(move.oneSigmaDown).toBeCloseTo(91.4, 1);
    });

    test('Expected move for different timeframes', () => {
      const move7 = calculateExpectedMove(100, 0.3, 7);
      const move30 = calculateExpectedMove(100, 0.3, 30);
      const move365 = calculateExpectedMove(100, 0.3, 365);
      
      // Longer timeframe = larger expected move
      expect(move7.expectedMoveAmount).toBeLessThan(move30.expectedMoveAmount);
      expect(move30.expectedMoveAmount).toBeLessThan(move365.expectedMoveAmount);
      
      // Annual move should be close to IV
      expect(move365.expectedMovePercent).toBeCloseTo(30, 1);
    });
  });

  describe('Leverage Calculations', () => {
    test('Option leverage calculation', () => {
      expect(calculateLeverage(0.5, 100, 5)).toBe(10);
      expect(calculateLeverage(0.25, 100, 2)).toBe(12.5);
    });

    test('Leverage with zero option price', () => {
      expect(calculateLeverage(0.5, 100, 0)).toBe(0);
    });
  });

  describe('Theta Calculations', () => {
    test('Daily theta conversion', () => {
      expect(calculateDailyTheta(-36.5)).toBeCloseTo(-0.1);
      expect(calculateDailyTheta(-18.25)).toBeCloseTo(-0.05);
    });
  });

  describe('Risk/Reward Calculations', () => {
    test('Call risk/reward', () => {
      const rr = calculateRiskReward('call', 5, 100, 98, 110);
      
      expect(rr.maxRisk).toBe(5);
      expect(rr.maxReward).toBe(Infinity);
      expect(rr.profitAtTarget).toBe(5); // (110-100)-5
      expect(rr.riskRewardRatio).toBe('Unlimited');
      expect(rr.breakEvenMove).toBe(7); // 105-98
      expect(rr.breakEvenPercent).toBeCloseTo(7.14, 2);
    });

    test('Put risk/reward', () => {
      const rr = calculateRiskReward('put', 5, 100, 102, 90);
      
      expect(rr.maxRisk).toBe(5);
      expect(rr.maxReward).toBe(95); // 100-5
      expect(rr.profitAtTarget).toBe(5); // (100-90)-5
      expect(rr.riskRewardRatio).toBe('19.00');
      expect(rr.breakEvenMove).toBe(7); // 102-95
    });
  });

  describe('Volume/OI Analysis', () => {
    test('Volume/OI ratio interpretation', () => {
      const highActivity = calculateVolumeOIRatio(5000, 2000);
      expect(highActivity.ratio).toBe(2.5);
      expect(highActivity.interpretation).toContain('High activity');
      expect(highActivity.isUnusual).toBe(true);

      const lowActivity = calculateVolumeOIRatio(100, 1000);
      expect(lowActivity.ratio).toBe(0.1);
      expect(lowActivity.interpretation).toContain('Low activity');
      expect(lowActivity.isUnusual).toBe(false);
    });

    test('Handle zero open interest', () => {
      const result = calculateVolumeOIRatio(100, 0);
      expect(result.ratio).toBe(0);
    });
  });

  describe('Full Analytics Integration', () => {
    test('Calculate full analytics for realistic option', () => {
      const optionData = {
        contract_type: 'call',
        strike_price: 70,
        expiration_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        quote: {
          last: 2.27,
          volume: 1000
        },
        greeks: {
          delta: 0.35,
          gamma: 0.025,
          theta: -0.035,
          vega: 0.10
        },
        implied_volatility: 0.45,
        open_interest: 5000
      };

      const analytics = calculateFullAnalytics(optionData, 65);

      // Verify structure
      expect(analytics).toHaveProperty('price');
      expect(analytics).toHaveProperty('intrinsicValue');
      expect(analytics).toHaveProperty('timeValue');
      expect(analytics).toHaveProperty('breakeven');
      expect(analytics).toHaveProperty('moneyness');
      expect(analytics).toHaveProperty('probabilityITM');
      expect(analytics).toHaveProperty('expectedMove');
      expect(analytics).toHaveProperty('leverage');
      expect(analytics).toHaveProperty('dailyTheta');
      expect(analytics).toHaveProperty('volumeOIRatio');

      // Verify calculations
      expect(analytics.intrinsicValue).toBe(0); // OTM
      expect(analytics.timeValue).toBe(2.27);
      expect(analytics.breakeven).toBe(72.27);
      expect(analytics.moneyness).toBe('OTM (Out of The Money)');
      expect(analytics.moneynessPercent).toBeCloseTo(-7.14, 1);
      expect(analytics.leverage).toBeCloseTo(10.03, 1);
      expect(analytics.volumeOIRatio).toBe(0.2);
    });

    test('Edge case: expired option', () => {
      const optionData = {
        contract_type: 'call',
        strike_price: 70,
        expiration_date: new Date(Date.now() - 1000).toISOString(), // Expired
        quote: { last: 0, volume: 0 },
        greeks: {},
        implied_volatility: 0,
        open_interest: 0
      };

      const analytics = calculateFullAnalytics(optionData, 65);
      
      expect(analytics.dte).toBe(0);
      expect(analytics.probabilityITM).toBe(0); // OTM and expired
    });
  });
});