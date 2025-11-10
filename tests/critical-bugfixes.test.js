/**
 * Tests for critical bug fixes:
 * 1. get_option_quote base URL fix (underlying_price now populated)
 * 2. get_option_analytics works (no longer throws stock price error)
 * 3. Gamma regime logic correct (not flipped)
 */

import { MassiveOptionsClient } from '../src/massive-client.js';
import { analyzeGammaExposure } from '../src/market-structure.js';
import dotenv from 'dotenv';

dotenv.config();

const describeIfApiKey = process.env.MASSIVE_API_KEY ? describe : describe.skip;

describeIfApiKey('Critical Bug Fixes', () => {
  let client;

  beforeAll(() => {
    const apiKey = process.env.MASSIVE_API_KEY;
    client = new MassiveOptionsClient(apiKey);
  });

  describe('Bug Fix #1: get_option_quote underlying_price', () => {
    test('should successfully fetch underlying stock price', async () => {
      const quote = await client.getQuote('SPY', 'call', 580, '2025-12-19');

      // Verify basic structure
      expect(quote).toHaveProperty('underlying_price');

      // The critical fix: underlying_price should NOT be null
      expect(quote.underlying_price).not.toBeNull();
      expect(typeof quote.underlying_price).toBe('number');
      expect(quote.underlying_price).toBeGreaterThan(0);

      // Verify it's a reasonable stock price for SPY (should be in hundreds)
      expect(quote.underlying_price).toBeGreaterThan(100);
      expect(quote.underlying_price).toBeLessThan(1000);
    }, 15000);

    test('should calculate moneyness correctly with valid underlying price', async () => {
      const quote = await client.getQuote('SPY', 'call', 580, '2025-12-19');

      // With a valid underlying_price, moneyness should not be "Unknown"
      expect(quote.moneyness).toBeDefined();
      expect(quote.moneyness).not.toBe('Unknown');

      // Should be one of the valid moneyness values
      expect(['ITM (In The Money)', 'ATM (At The Money)', 'OTM (Out of The Money)'])
        .toContain(quote.moneyness);
    }, 15000);

    test('should have all required fields populated', async () => {
      const quote = await client.getQuote('SPY', 'put', 560, '2025-12-19');

      // Verify all key fields are present
      expect(quote).toHaveProperty('ticker');
      expect(quote).toHaveProperty('underlying_ticker');
      expect(quote).toHaveProperty('strike_price');
      expect(quote).toHaveProperty('expiration_date');
      expect(quote).toHaveProperty('quote');
      expect(quote).toHaveProperty('greeks');
      expect(quote).toHaveProperty('implied_volatility');
      expect(quote).toHaveProperty('underlying_price');
      expect(quote).toHaveProperty('moneyness');
      expect(quote).toHaveProperty('days_to_expiration');
    }, 15000);
  });

  describe('Bug Fix #2: get_option_analytics works', () => {
    test('should successfully run analytics without throwing stock price error', async () => {
      // This used to throw "Could not fetch underlying stock price - required for analytics calculations"
      const analytics = await client.getOptionAnalytics('SPY', 'call', 580, '2025-12-19');

      // Verify it completes successfully
      expect(analytics).toBeDefined();
      expect(analytics).toHaveProperty('analytics');
      expect(analytics).toHaveProperty('underlying_price');

      // Underlying price should be populated
      expect(analytics.underlying_price).not.toBeNull();
      expect(typeof analytics.underlying_price).toBe('number');
    }, 20000);

    test('should provide complete analytics data', async () => {
      const analytics = await client.getOptionAnalytics('SPY', 'put', 560, '2025-12-19');

      // Verify comprehensive analytics structure
      expect(analytics).toHaveProperty('ticker');
      expect(analytics).toHaveProperty('underlying');
      expect(analytics).toHaveProperty('underlying_price');
      expect(analytics).toHaveProperty('contract');
      expect(analytics).toHaveProperty('market');
      expect(analytics).toHaveProperty('analytics');
      expect(analytics).toHaveProperty('calculated_at');

      // Verify underlying price is valid
      expect(analytics.underlying_price).toBeGreaterThan(0);
    }, 20000);

    test('should calculate analytics with target price', async () => {
      const targetPrice = 600;
      const analytics = await client.getOptionAnalytics(
        'SPY',
        'call',
        580,
        '2025-12-19',
        targetPrice
      );

      // Should include risk/reward analysis when target is provided
      expect(analytics).toHaveProperty('risk_reward');

      if (analytics.risk_reward) {
        expect(analytics.risk_reward).toHaveProperty('targetPrice');
        expect(analytics.risk_reward.targetPrice).toBe(targetPrice);
      }
    }, 20000);
  });

  describe('Bug Fix #3: Gamma regime logic correct', () => {
    test('positive totalGEX should mean Positive Gamma regime', () => {
      // Create mock chain data with net positive GEX
      const mockChainData = {
        '2025-12-19': {
          calls: [
            {
              strike: 580,
              greeks: { gamma: 0.05 },
              price: { open_interest: 10000 }
            }
          ],
          puts: []
        }
      };

      const spotPrice = 575;
      const result = analyzeGammaExposure(mockChainData, spotPrice);

      // With positive net gamma, regime should be "Positive Gamma"
      expect(result.regime).toBe('Positive Gamma');
      expect(result.interpretation).toContain('long gamma');
      expect(result.interpretation).toContain('mean reversion');
      expect(result.interpretation).toContain('volatility suppression');
    });

    test('negative totalGEX should mean Negative Gamma regime', () => {
      // Create mock chain data with net negative GEX (more put GEX)
      const mockChainData = {
        '2025-12-19': {
          calls: [],
          puts: [
            {
              strike: 580,
              greeks: { gamma: 0.05 },
              price: { open_interest: 10000 }
            }
          ]
        }
      };

      const spotPrice = 575;
      const result = analyzeGammaExposure(mockChainData, spotPrice);

      // With negative net gamma (puts), regime should be "Negative Gamma"
      expect(result.regime).toBe('Negative Gamma');
      expect(result.interpretation).toContain('short gamma');
      expect(result.interpretation).toContain('higher volatility');
      expect(result.interpretation).toContain('trending moves');
    });

    test('gamma regime interpretation matches the sign', () => {
      const mockChainDataPositive = {
        '2025-12-19': {
          calls: [
            { strike: 580, greeks: { gamma: 0.05 }, price: { open_interest: 5000 } }
          ],
          puts: []
        }
      };

      const mockChainDataNegative = {
        '2025-12-19': {
          calls: [],
          puts: [
            { strike: 580, greeks: { gamma: 0.05 }, price: { open_interest: 5000 } }
          ]
        }
      };

      const spotPrice = 575;
      const positiveResult = analyzeGammaExposure(mockChainDataPositive, spotPrice);
      const negativeResult = analyzeGammaExposure(mockChainDataNegative, spotPrice);

      // Positive GEX = Positive Gamma regime
      expect(positiveResult.regime).toBe('Positive Gamma');
      expect(positiveResult.totalGEX).toBeGreaterThan(0);

      // Negative GEX = Negative Gamma regime
      expect(negativeResult.regime).toBe('Negative Gamma');
      expect(negativeResult.totalGEX).toBeLessThan(0);
    });
  });

  describe('Integration: Market Structure with Correct Gamma', () => {
    test('should analyze market structure with correct gamma regime', async () => {
      const structure = await client.getMarketStructure('SPY');

      // Verify structure has gamma exposure analysis
      expect(structure).toHaveProperty('gamma_exposure');
      expect(structure.gamma_exposure).toHaveProperty('regime');
      expect(structure.gamma_exposure).toHaveProperty('interpretation');
      expect(structure.gamma_exposure).toHaveProperty('totalGEX');

      // Regime should be one of the two valid values
      expect(['Positive Gamma', 'Negative Gamma']).toContain(structure.gamma_exposure.regime);

      // Verify the interpretation matches the regime
      if (structure.gamma_exposure.regime === 'Positive Gamma') {
        expect(structure.gamma_exposure.interpretation).toContain('long gamma');
        expect(structure.gamma_exposure.interpretation).toContain('mean reversion');
      } else {
        expect(structure.gamma_exposure.interpretation).toContain('short gamma');
        expect(structure.gamma_exposure.interpretation).toContain('volatility');
      }
    }, 30000);
  });

  describe('Regression Prevention', () => {
    test('should not make double-path API calls', async () => {
      // This test ensures the fix stays in place
      // If the bug returns, underlying_price will be null again
      const quote = await client.getQuote('SPY', 'call', 580, '2025-12-19');

      expect(quote.underlying_price).not.toBeNull();
      expect(typeof quote.underlying_price).toBe('number');
    }, 15000);

    test('analytics should not fail with stock price error', async () => {
      // If the bug returns, this will throw the error again
      await expect(
        client.getOptionAnalytics('SPY', 'call', 580, '2025-12-19')
      ).resolves.toBeDefined();
    }, 20000);
  });
});
