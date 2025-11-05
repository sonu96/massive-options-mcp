import {
  analyzeVolatilitySmile,
  analyzeTermStructure,
  calculateIVRank,
  compareIVtoRV,
  calculateVolatilityCone
} from '../src/volatility-analysis.js';

describe('Volatility Analysis', () => {
  describe('Volatility Smile Analysis', () => {
    test('Analyze typical volatility smile', () => {
      // OTM puts and calls have higher IV than ATM
      const strikes = [90, 95, 100, 105, 110];
      const ivs = [0.35, 0.30, 0.25, 0.30, 0.35];
      const atmStrike = 100;
      
      const analysis = analyzeVolatilitySmile(strikes, ivs, atmStrike);
      
      expect(analysis.atmIV).toBe(0.25);
      expect(analysis.atmStrike).toBe(100);
      expect(analysis.pattern).toBe('smile');
      expect(analysis.smileSteepness).toBeGreaterThan(0);
      expect(analysis.interpretation).toContain('tail risk concerns');
    });

    test('Analyze volatility smirk (put skew)', () => {
      // OTM puts have higher IV
      const strikes = [90, 95, 100, 105, 110];
      const ivs = [0.40, 0.35, 0.30, 0.28, 0.26];
      const atmStrike = 100;
      
      const analysis = analyzeVolatilitySmile(strikes, ivs, atmStrike);
      
      expect(analysis.pattern).toBe('smirk');
      expect(analysis.skew.delta25).toBeGreaterThan(0);
      expect(analysis.interpretation).toContain('downside protection');
    });

    test('Analyze reverse smirk', () => {
      // OTM calls have higher IV
      const strikes = [90, 95, 100, 105, 110];
      const ivs = [0.26, 0.28, 0.30, 0.35, 0.40];
      const atmStrike = 100;
      
      const analysis = analyzeVolatilitySmile(strikes, ivs, atmStrike);
      
      expect(analysis.pattern).toBe('reverse-smirk');
      expect(analysis.interpretation).toContain('upside speculation');
    });

    test('Handle invalid data', () => {
      expect(() => analyzeVolatilitySmile([100], [0.30], 100)).toThrow();
      expect(() => analyzeVolatilitySmile([100, 110], [0.30], 100)).toThrow();
    });
  });

  describe('Term Structure Analysis', () => {
    test('Analyze contango term structure', () => {
      const today = new Date();
      const expirations = [
        new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        new Date(today.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString(),
        new Date(today.getTime() + 180 * 24 * 60 * 60 * 1000).toISOString(),
      ];
      const atmIVs = [0.20, 0.25, 0.35, 0.45]; // Strongly increasing IVs
      
      const analysis = analyzeTermStructure(expirations, atmIVs);
      
      expect(analysis.shape).toBe('contango');
      expect(analysis.shortTermIV).toBeLessThan(analysis.longTermIV);
      expect(analysis.interpretation).toContain('higher volatility in the future');
    });

    test('Analyze backwardation term structure', () => {
      const today = new Date();
      const expirations = [
        new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        new Date(today.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString(),
        new Date(today.getTime() + 180 * 24 * 60 * 60 * 1000).toISOString(),
      ];
      const atmIVs = [0.45, 0.35, 0.25, 0.20]; // Strongly decreasing IVs
      
      const analysis = analyzeTermStructure(expirations, atmIVs);
      
      expect(analysis.shape).toBe('backwardation');
      expect(analysis.shortTermIV).toBeGreaterThan(analysis.longTermIV);
      expect(analysis.interpretation).toContain('Near-term event risk');
    });

    test('Analyze flat term structure', () => {
      const today = new Date();
      const expirations = [
        new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        new Date(today.getTime() + 60 * 24 * 60 * 60 * 1000).toISOString(),
      ];
      const atmIVs = [0.30, 0.31, 0.29]; // Similar IVs
      
      const analysis = analyzeTermStructure(expirations, atmIVs);
      
      expect(analysis.shape).toBe('flat');
      expect(analysis.interpretation).toContain('Stable volatility');
    });
  });

  describe('IV Rank Calculations', () => {
    test('Calculate high IV rank', () => {
      const currentIV = 0.45;
      const historicalIVs = [];
      // Generate historical IVs between 0.20 and 0.50
      for (let i = 0; i < 252; i++) {
        historicalIVs.push(0.20 + (0.30 * Math.random()));
      }
      
      const analysis = calculateIVRank(currentIV, historicalIVs);
      
      expect(analysis.rank).toBeGreaterThan(80);
      expect(analysis.percentile).toBeGreaterThan(80);
      expect(analysis.interpretation).toContain('Good for selling premium');
    });

    test('Calculate low IV rank', () => {
      const currentIV = 0.15;
      const historicalIVs = [];
      // Generate historical IVs between 0.15 and 0.50
      for (let i = 0; i < 252; i++) {
        historicalIVs.push(0.15 + (0.35 * Math.random()));
      }
      
      const analysis = calculateIVRank(currentIV, historicalIVs);
      
      expect(analysis.rank).toBeLessThan(20);
      expect(analysis.interpretation).toContain('Good for buying premium');
    });

    test('Handle empty historical data', () => {
      const analysis = calculateIVRank(0.30, []);
      
      expect(analysis.rank).toBeNull();
      expect(analysis.percentile).toBeNull();
      expect(analysis.interpretation).toBe('Insufficient historical data');
    });
  });

  describe('IV vs RV Comparison', () => {
    test('Compare when IV > RV (normal premium)', () => {
      const impliedVol = 0.30; // 30% IV
      const priceHistory = [100]; // Start at 100
      
      // Generate price history with ~20% realized volatility
      for (let i = 1; i <= 30; i++) {
        const dailyReturn = 0.0005 + (Math.random() - 0.5) * 0.02; // ~1% daily moves
        priceHistory.push(priceHistory[i - 1] * (1 + dailyReturn));
      }
      
      const analysis = compareIVtoRV(impliedVol, priceHistory, 20);
      
      expect(analysis.impliedVol).toBe(0.3);
      expect(analysis.realizedVol).toBeGreaterThan(0.05);
      expect(analysis.realizedVol).toBeLessThan(0.40);
      expect(analysis.volPremium).toBeGreaterThan(0);
    });

    test('Handle insufficient price history', () => {
      const analysis = compareIVtoRV(0.30, [100, 101, 102], 20);
      
      expect(analysis.realizedVol).toBeNull();
      expect(analysis.interpretation).toBe('Insufficient price history');
    });
  });

  describe('Volatility Cone', () => {
    test('Calculate volatility cone for different periods', () => {
      const priceHistory = [100];
      
      // Generate 100 days of price history
      for (let i = 1; i <= 100; i++) {
        const dailyReturn = (Math.random() - 0.5) * 0.02;
        priceHistory.push(priceHistory[i - 1] * (1 + dailyReturn));
      }
      
      const cone = calculateVolatilityCone(priceHistory);
      
      // Should have data for 5d, 10d, 20d, 30d, 60d, 90d
      expect(cone['5d']).toBeDefined();
      expect(cone['20d']).toBeDefined();
      expect(cone['60d']).toBeDefined();
      
      // Verify structure
      if (cone['20d']) {
        expect(cone['20d'].min).toBeLessThanOrEqual(cone['20d'].p10);
        expect(cone['20d'].p10).toBeLessThanOrEqual(cone['20d'].p25);
        expect(cone['20d'].p25).toBeLessThanOrEqual(cone['20d'].p50);
        expect(cone['20d'].p50).toBeLessThanOrEqual(cone['20d'].p75);
        expect(cone['20d'].p75).toBeLessThanOrEqual(cone['20d'].p90);
        expect(cone['20d'].p90).toBeLessThanOrEqual(cone['20d'].max);
      }
    });

    test('Handle insufficient data for longer periods', () => {
      const priceHistory = Array(50).fill(100); // Only 50 days
      const cone = calculateVolatilityCone(priceHistory);
      
      expect(cone['20d']).toBeDefined();
      expect(cone['90d']).toBeUndefined(); // Not enough data
    });
  });
});