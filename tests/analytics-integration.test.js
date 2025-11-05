import { 
  calculateFullAnalytics, 
  calculateRiskReward 
} from '../src/calculations.js';

describe('Analytics Integration', () => {
  describe('Full Analytics with Real-like Data', () => {
    test('Complete analytics for ITM call option', () => {
      // Simulate real option data structure
      const optionData = {
        contract_type: 'call',
        strike_price: 62,
        expiration_date: '2025-11-14',
        quote: {
          last: 4.50,
          volume: 1500
        },
        greeks: {
          delta: 0.65,
          gamma: 0.02,
          theta: -0.045,
          vega: 0.15
        },
        implied_volatility: 0.35,
        open_interest: 8000
      };
      
      const stockPrice = 65;  // ITM by $3
      
      const analytics = calculateFullAnalytics(optionData, stockPrice);
      
      // Verify all properties exist
      expect(analytics).toHaveProperty('type', 'call');
      expect(analytics).toHaveProperty('strike', 62);
      expect(analytics).toHaveProperty('dte');
      expect(analytics).toHaveProperty('price', 4.50);
      expect(analytics).toHaveProperty('intrinsicValue', 3);
      expect(analytics).toHaveProperty('timeValue', 1.50);
      expect(analytics).toHaveProperty('breakeven', 66.50);
      expect(analytics).toHaveProperty('moneyness', 'ATM (At The Money)');
      expect(analytics).toHaveProperty('probabilityITM');
      expect(analytics).toHaveProperty('leverage');
      expect(analytics).toHaveProperty('dailyTheta');
      expect(analytics).toHaveProperty('volumeOIRatio', 0.19);  // 1500/8000
      
      // Verify probability is reasonable for ITM option
      expect(analytics.probabilityITM).toBeGreaterThan(0.5);
      expect(analytics.probabilityITM).toBeLessThan(1);
      
      // Verify leverage calculation
      expect(analytics.leverage).toBeCloseTo(9.4, 1);  // 0.65 * 65 / 4.50
    });

    test('Complete analytics for OTM put option', () => {
      const optionData = {
        contract_type: 'put',
        strike_price: 60,
        expiration_date: '2025-12-19',
        quote: {
          last: 1.25,
          volume: 750
        },
        greeks: {
          delta: -0.25,
          gamma: 0.015,
          theta: -0.02,
          vega: 0.08
        },
        implied_volatility: 0.40,
        open_interest: 3000
      };
      
      const stockPrice = 65;  // OTM by $5
      
      const analytics = calculateFullAnalytics(optionData, stockPrice);
      
      expect(analytics.type).toBe('put');
      expect(analytics.intrinsicValue).toBe(0);  // OTM
      expect(analytics.timeValue).toBe(1.25);  // All time value
      expect(analytics.breakeven).toBe(58.75);  // 60 - 1.25
      expect(analytics.moneyness).toBe('OTM (Out of The Money)');
      expect(analytics.probabilityITM).toBeLessThan(0.5);  // OTM should be < 50%
      
      // Verify expected move
      expect(analytics.expectedMove).toBeDefined();
      expect(analytics.expectedMove.percent).toBeGreaterThan(0);
      expect(analytics.expectedMove.oneSigmaRange[0]).toBeLessThan(stockPrice);
      expect(analytics.expectedMove.oneSigmaRange[1]).toBeGreaterThan(stockPrice);
    });

    test('Analytics with risk/reward calculation', () => {
      const stockPrice = 100;
      const premium = 2.50;
      
      // Test call risk/reward
      const callRR = calculateRiskReward('call', premium, 100, stockPrice, 110);
      
      expect(callRR.maxRisk).toBe(2.50);
      expect(callRR.maxReward).toBe(Infinity);
      expect(callRR.profitAtTarget).toBe(7.50);  // (110-100) - 2.50
      expect(callRR.breakEvenMove).toBe(2.50);   // 102.50 - 100
      expect(callRR.breakEvenPercent).toBe(2.50);
      
      // Test put risk/reward
      const putRR = calculateRiskReward('put', premium, 100, stockPrice, 90);
      
      expect(putRR.maxRisk).toBe(2.50);
      expect(putRR.maxReward).toBe(97.50);  // 100 - 2.50
      expect(putRR.profitAtTarget).toBe(7.50);  // (100-90) - 2.50
      expect(putRR.riskRewardRatio).toBe('39.00');
    });

    test('Edge case: Deep ITM option near expiration', () => {
      const optionData = {
        contract_type: 'call',
        strike_price: 50,
        expiration_date: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),  // 2 days
        quote: {
          last: 15.10,
          volume: 50
        },
        greeks: {
          delta: 0.99,
          gamma: 0.001,
          theta: -0.10,
          vega: 0.01
        },
        implied_volatility: 0.15,
        open_interest: 500
      };
      
      const stockPrice = 65;  // Deep ITM
      
      const analytics = calculateFullAnalytics(optionData, stockPrice);
      
      expect(analytics.intrinsicValue).toBe(15);  // 65 - 50
      expect(analytics.timeValue).toBe(0.10);     // 15.10 - 15
      expect(analytics.moneynessDetail).toBe('Deep ITM');
      expect(analytics.probabilityITM).toBeGreaterThan(0.95);  // Very high probability
      expect(analytics.dte).toBe(2);
      
      // Low leverage for deep ITM
      expect(analytics.leverage).toBeLessThan(5);
    });

    test('Unusual activity detection', () => {
      const highVolumeOption = {
        contract_type: 'call',
        strike_price: 70,
        expiration_date: '2025-11-14',
        quote: {
          last: 2.00,
          volume: 25000  // Very high volume
        },
        greeks: {},
        implied_volatility: 0.50,
        open_interest: 5000
      };
      
      const analytics = calculateFullAnalytics(highVolumeOption, 65);
      
      expect(analytics.volumeOIRatio).toBe(5);  // 25000/5000
      expect(analytics.unusualActivity).toBe(true);
      expect(analytics.volumeInterpretation).toContain('High activity');
    });
  });

  describe('Expected Move Calculations in Context', () => {
    test('Weekly vs Monthly expected moves', () => {
      const weeklyOption = {
        contract_type: 'call',
        strike_price: 100,
        expiration_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        quote: { last: 2.00, volume: 100 },
        greeks: {},
        implied_volatility: 0.30,
        open_interest: 1000
      };
      
      const monthlyOption = {
        ...weeklyOption,
        expiration_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      };
      
      const weeklyAnalytics = calculateFullAnalytics(weeklyOption, 100);
      const monthlyAnalytics = calculateFullAnalytics(monthlyOption, 100);
      
      // Monthly should have larger expected move
      expect(monthlyAnalytics.expectedMove.amount)
        .toBeGreaterThan(weeklyAnalytics.expectedMove.amount);
        
      // But weekly should have higher daily move rate
      const weeklyDailyMove = weeklyAnalytics.expectedMove.percent / 7;
      const monthlyDailyMove = monthlyAnalytics.expectedMove.percent / 30;
      expect(weeklyDailyMove).toBeGreaterThan(monthlyDailyMove);
    });
  });
});