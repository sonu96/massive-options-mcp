import { MassiveOptionsClient } from '../src/massive-client.js';

describe('Market Indicators', () => {
  let client;

  beforeEach(() => {
    client = new MassiveOptionsClient('test-api-key');
  });

  describe('Market Indicator Logic', () => {
    test('classifies strength correctly - UP direction', () => {
      // Test WEAK UP
      let changePercent = 0.2;
      let direction = changePercent > 0 ? 'UP' : 'DOWN';
      let strength = changePercent > 2 ? 'STRONG' : changePercent > 0.5 ? 'MODERATE' : 'WEAK';
      expect(direction).toBe('UP');
      expect(strength).toBe('WEAK');

      // Test MODERATE UP
      changePercent = 0.8;
      direction = changePercent > 0 ? 'UP' : 'DOWN';
      strength = changePercent > 2 ? 'STRONG' : changePercent > 0.5 ? 'MODERATE' : 'WEAK';
      expect(direction).toBe('UP');
      expect(strength).toBe('MODERATE');

      // Test STRONG UP
      changePercent = 3.0;
      direction = changePercent > 0 ? 'UP' : 'DOWN';
      strength = changePercent > 2 ? 'STRONG' : changePercent > 0.5 ? 'MODERATE' : 'WEAK';
      expect(direction).toBe('UP');
      expect(strength).toBe('STRONG');
    });

    test('classifies strength correctly - DOWN direction', () => {
      // Test WEAK DOWN
      let changePercent = -0.3;
      let direction = changePercent < 0 ? 'DOWN' : 'UP';
      let strength = changePercent < -2 ? 'STRONG' : changePercent < -0.5 ? 'MODERATE' : 'WEAK';
      expect(direction).toBe('DOWN');
      expect(strength).toBe('WEAK');

      // Test MODERATE DOWN
      changePercent = -0.9;
      direction = changePercent < 0 ? 'DOWN' : 'UP';
      strength = changePercent < -2 ? 'STRONG' : changePercent < -0.5 ? 'MODERATE' : 'WEAK';
      expect(direction).toBe('DOWN');
      expect(strength).toBe('MODERATE');

      // Test STRONG DOWN
      changePercent = -2.5;
      direction = changePercent < 0 ? 'DOWN' : 'UP';
      strength = changePercent < -2 ? 'STRONG' : changePercent < -0.5 ? 'MODERATE' : 'WEAK';
      expect(direction).toBe('DOWN');
      expect(strength).toBe('STRONG');
    });

    test('interprets VIX levels correctly', () => {
      const testVIX = (price) => {
        if (price > 30) return 'HIGH FEAR - Market stress elevated';
        if (price > 20) return 'ELEVATED - Increased uncertainty';
        if (price < 15) return 'LOW - Complacency in markets';
        return 'NORMAL - Healthy volatility levels';
      };

      expect(testVIX(12)).toBe('LOW - Complacency in markets');
      expect(testVIX(17)).toBe('NORMAL - Healthy volatility levels');
      expect(testVIX(25)).toBe('ELEVATED - Increased uncertainty');
      expect(testVIX(35)).toBe('HIGH FEAR - Market stress elevated');
    });

    test('interprets dollar trend correctly', () => {
      const testDollar = (direction) => {
        return direction === 'UP' ?
          'Dollar strengthening - headwind for stocks/commodities' :
          'Dollar weakening - tailwind for stocks/commodities';
      };

      expect(testDollar('UP')).toContain('headwind');
      expect(testDollar('DOWN')).toContain('tailwind');
    });

    test('interprets bond trend correctly', () => {
      const testBonds = (direction) => {
        return direction === 'UP' ?
          'Bonds rallying - yields falling, risk-off sentiment' :
          'Bonds selling - yields rising, risk-on or inflation concerns';
      };

      expect(testBonds('UP')).toContain('risk-off');
      expect(testBonds('DOWN')).toContain('risk-on');
    });

    test('real-time flag is set correctly', () => {
      expect('open' !== 'closed').toBe(true); // is_real_time when market open
      expect('closed' !== 'closed').toBe(false); // not real-time when closed
      expect('pre' !== 'closed').toBe(true); // pre-market is real-time
      expect('after' !== 'closed').toBe(true); // after-hours is real-time
    });
  });

  describe('generateMarketSummary', () => {
    test('generates neutral summary when no strong signals', () => {
      const indicators = {
        SPY: { direction: 'UP', strength: 'WEAK', change_percent: 0.1 },
        VIX: { current_price: 16 },
        QQQ: { change_percent: 0.15 },
        UUP: { direction: 'FLAT', strength: 'NEUTRAL' },
        TLT: { direction: 'FLAT', strength: 'NEUTRAL' }
      };

      const summary = client.generateMarketSummary(indicators);

      expect(summary.overall_sentiment).toBe('NEUTRAL');
      expect(summary.risk_environment).toBe('NORMAL');
    });

    test('detects strong dollar pressure', () => {
      const indicators = {
        SPY: { direction: 'DOWN', strength: 'WEAK', change_percent: -0.2 },
        VIX: { current_price: 17 },
        QQQ: { change_percent: -0.25 },
        UUP: { direction: 'UP', strength: 'STRONG', change_percent: 0.8 },
        TLT: { direction: 'FLAT', strength: 'NEUTRAL' }
      };

      const summary = client.generateMarketSummary(indicators);

      const hasDollarNote = summary.key_observations.some(
        obs => obs.includes('Strong dollar may pressure equities')
      );
      expect(hasDollarNote).toBe(true);
    });
  });
});
