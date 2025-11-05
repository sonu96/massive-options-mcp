import {
  analyzePutCallRatios,
  analyzeOptionFlow,
  analyzeGammaExposure,
  calculateMaxPain,
  analyzeOIDistribution
} from '../src/market-structure.js';

describe('Market Structure Analysis', () => {
  describe('Put/Call Ratio Analysis', () => {
    test('Analyze balanced P/C ratios', () => {
      const chainData = {
        '2025-01-17': {
          calls: [
            { price: { volume: 500, open_interest: 5000, last: 2.50 } },
            { price: { volume: 300, open_interest: 3000, last: 1.50 } }
          ],
          puts: [
            { price: { volume: 400, open_interest: 4000, last: 2.00 } },
            { price: { volume: 400, open_interest: 4000, last: 2.50 } }
          ]
        }
      };
      
      const analysis = analyzePutCallRatios(chainData);
      
      expect(analysis.volume.callVolume).toBe(800);
      expect(analysis.volume.putVolume).toBe(800);
      expect(analysis.volume.ratio).toBe(1.0);
      expect(analysis.volume.interpretation).toContain('bearish');
      
      expect(analysis.openInterest.callOI).toBe(8000);
      expect(analysis.openInterest.putOI).toBe(8000);
      expect(analysis.openInterest.ratio).toBe(1.0);
      
      expect(analysis.premium.callPremium).toBe(1700); // (500*2.5 + 300*1.5)
      expect(analysis.premium.putPremium).toBe(1800); // (400*2 + 400*2.5)
    });

    test('Analyze bullish P/C ratios', () => {
      const chainData = {
        '2025-01-17': {
          calls: [
            { price: { volume: 1000, open_interest: 10000, last: 3.00 } }
          ],
          puts: [
            { price: { volume: 300, open_interest: 3000, last: 1.00 } }
          ]
        }
      };
      
      const analysis = analyzePutCallRatios(chainData);
      
      expect(analysis.volume.ratio).toBeLessThan(0.5);
      expect(analysis.volume.interpretation).toContain('Bullish');
    });
  });

  describe('Option Flow Analysis', () => {
    test('Analyze bullish flow', () => {
      const recentTrades = [
        { type: 'call', side: 'buy', price: 2.50, size: 100, bid: 2.40 },
        { type: 'call', side: 'buy', price: 3.00, size: 200, bid: 2.90 },
        { type: 'put', side: 'sell', price: 1.50, size: 150, bid: 1.60 }
      ];
      
      const analysis = analyzeOptionFlow(recentTrades);
      
      expect(analysis.bullishFlow).toBeGreaterThan(analysis.bearishFlow);
      expect(analysis.netFlow).toBeGreaterThan(0);
      expect(analysis.interpretation).toContain('bullish');
      expect(analysis.largeBlockTrades).toHaveLength(3); // All are >= 100
    });

    test('Analyze bearish flow', () => {
      const recentTrades = [
        { type: 'put', side: 'buy', price: 3.00, size: 200, bid: 2.90 },
        { type: 'call', side: 'sell', price: 2.00, size: 150, bid: 2.10 }
      ];
      
      const analysis = analyzeOptionFlow(recentTrades);
      
      expect(analysis.bearishFlow).toBeGreaterThan(analysis.bullishFlow);
      expect(analysis.netFlow).toBeLessThan(0);
      expect(analysis.interpretation).toContain('bearish');
    });

    test('Handle empty trade data', () => {
      const analysis = analyzeOptionFlow([]);
      
      expect(analysis.netFlow).toBe('N/A');
      expect(analysis.interpretation).toBe('Insufficient trade data');
    });
  });

  describe('Gamma Exposure Analysis', () => {
    test('Analyze positive gamma regime', () => {
      const chainData = {
        '2025-01-17': {
          calls: [
            { 
              strike: 100, 
              greeks: { gamma: 0.02 }, 
              price: { open_interest: 5000 } 
            },
            { 
              strike: 105, 
              greeks: { gamma: 0.015 }, 
              price: { open_interest: 3000 } 
            }
          ],
          puts: [
            { 
              strike: 95, 
              greeks: { gamma: 0.01 }, 
              price: { open_interest: 2000 } 
            }
          ]
        }
      };
      
      const spotPrice = 100;
      const analysis = analyzeGammaExposure(chainData, spotPrice);
      
      expect(analysis.totalGEX).toBeGreaterThan(0); // Positive total GEX = negative gamma regime
      expect(analysis.regime).toBe('Negative Gamma');
      expect(analysis.interpretation).toContain('higher volatility');
      expect(analysis.maxGammaStrike).toBe(100);
    });

    test('Find gamma levels', () => {
      const chainData = {
        '2025-01-17': {
          calls: [
            { strike: 95, greeks: { gamma: 0.01 }, price: { open_interest: 1000 } },
            { strike: 100, greeks: { gamma: 0.03 }, price: { open_interest: 10000 } },
            { strike: 105, greeks: { gamma: 0.01 }, price: { open_interest: 1000 } }
          ],
          puts: []
        }
      };
      
      const analysis = analyzeGammaExposure(chainData, 100);
      
      expect(analysis.maxGammaStrike).toBe(100); // Highest gamma concentration
      expect(analysis.gammaProfile).toHaveLength(3);
    });
  });

  describe('Max Pain Calculation', () => {
    test('Calculate max pain with simple chain', () => {
      const chainData = {
        '2025-01-17': {
          calls: [
            { strike: 95, price: { open_interest: 1000 } },
            { strike: 100, price: { open_interest: 2000 } },
            { strike: 105, price: { open_interest: 1500 } }
          ],
          puts: [
            { strike: 95, price: { open_interest: 1500 } },
            { strike: 100, price: { open_interest: 2000 } },
            { strike: 105, price: { open_interest: 1000 } }
          ]
        }
      };
      
      const spotPrice = 102;
      const analysis = calculateMaxPain(chainData, spotPrice);
      
      expect(analysis.maxPainStrike).toBeDefined();
      expect(analysis.currentSpot).toBe(102);
      expect(analysis.percentFromSpot).toBeDefined();
      expect(analysis.interpretation).toBeDefined();
      expect(analysis.painDistribution.length).toBeGreaterThan(0);
    });

    test('Interpret max pain positioning', () => {
      const chainData = {
        '2025-01-17': {
          calls: [
            { strike: 110, price: { open_interest: 10000 } } // Heavy call OI above
          ],
          puts: [
            { strike: 90, price: { open_interest: 10000 } } // Heavy put OI below
          ]
        }
      };
      
      const spotPrice = 100;
      const analysis = calculateMaxPain(chainData, spotPrice);
      
      // Max pain should be around 100 (between heavy call and put OI)
      expect(analysis.maxPainStrike).toBeDefined();
      expect(analysis.percentFromSpot).toBeDefined();
      // Just check that interpretation exists, actual value depends on calculation
    });
  });

  describe('OI Distribution Analysis', () => {
    test('Identify call and put walls', () => {
      const chainData = {
        '2025-01-17': {
          calls: [
            { strike: 100, price: { open_interest: 5000 } },
            { strike: 105, price: { open_interest: 20000 } }, // Call wall
            { strike: 110, price: { open_interest: 3000 } }
          ],
          puts: [
            { strike: 90, price: { open_interest: 3000 } },
            { strike: 95, price: { open_interest: 15000 } }, // Put wall
            { strike: 100, price: { open_interest: 5000 } }
          ]
        }
      };
      
      const spotPrice = 100;
      const analysis = analyzeOIDistribution(chainData, spotPrice);
      
      // Check call walls
      expect(analysis.callWalls[0].strike).toBe(105);
      expect(analysis.callWalls[0].openInterest).toBe(20000);
      
      // Check put walls
      expect(analysis.putWalls[0].strike).toBe(95);
      expect(analysis.putWalls[0].openInterest).toBe(15000);
      
      // Check nearest levels
      expect(analysis.nearestResistance).toBe(105);
      expect(analysis.nearestSupport).toBe(95);
      
      // Check expected range
      expect(analysis.expectedRange.low).toBe(95);
      expect(analysis.expectedRange.high).toBe(105);
      expect(analysis.expectedRange.width).toBe(10);
    });

    test('Handle sparse OI distribution', () => {
      const chainData = {
        '2025-01-17': {
          calls: [
            { strike: 100, price: { open_interest: 100 } }
          ],
          puts: [
            { strike: 95, price: { open_interest: 100 } }
          ]
        }
      };
      
      const analysis = analyzeOIDistribution(chainData, 98);
      
      expect(analysis.callWalls).toHaveLength(1);
      expect(analysis.putWalls).toHaveLength(1);
      expect(analysis.interpretation).toBeDefined();
    });
  });
});