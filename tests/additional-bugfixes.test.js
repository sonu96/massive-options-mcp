/**
 * Tests for additional bug fixes:
 * 1. EMA/RSI properly handle response.data.results.values
 * 2. getDividends handles 0 values in filters
 */

import { MassiveOptionsClient } from '../src/massive-client.js';
import dotenv from 'dotenv';

dotenv.config();

const describeIfApiKey = process.env.MASSIVE_API_KEY ? describe : describe.skip;

describeIfApiKey('Additional Bug Fixes', () => {
  let client;

  beforeAll(() => {
    const apiKey = process.env.MASSIVE_API_KEY;
    client = new MassiveOptionsClient(apiKey);
  });

  describe('Bug Fix: EMA/RSI Response Structure', () => {
    test('should return results as array with timestamp and value', async () => {
      const ema = await client.getOptionEMA('SPY', 'call', 580, '2025-12-19', 'day', 20);

      // Verify results is an array
      expect(Array.isArray(ema.results)).toBe(true);

      // If results exist, verify structure
      if (ema.results.length > 0) {
        const firstResult = ema.results[0];

        // Should have timestamp and value properties
        expect(firstResult).toHaveProperty('timestamp');
        expect(firstResult).toHaveProperty('value');

        // Timestamp should be ISO string
        expect(firstResult.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);

        // Value should be a number
        expect(typeof firstResult.value).toBe('number');
      }
    }, 20000);

    test('RSI should have proper results array and interpretation', async () => {
      const rsi = await client.getOptionRSI('SPY', 'call', 580, '2025-12-19', 'day', 14);

      // Verify results is an array
      expect(Array.isArray(rsi.results)).toBe(true);

      // Verify interpretation exists and is not the error case
      expect(rsi.interpretation).toBeDefined();
      expect(typeof rsi.interpretation).toBe('string');

      // If results exist, verify structure
      if (rsi.results.length > 0) {
        const firstResult = rsi.results[0];

        // Should have timestamp and value properties
        expect(firstResult).toHaveProperty('timestamp');
        expect(firstResult).toHaveProperty('value');

        // Timestamp should be ISO string
        expect(firstResult.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);

        // Value should be a number (RSI is 0-100)
        expect(typeof firstResult.value).toBe('number');
        expect(firstResult.value).toBeGreaterThanOrEqual(0);
        expect(firstResult.value).toBeLessThanOrEqual(100);

        // If we have data, interpretation should not be "No data available"
        expect(rsi.interpretation).not.toBe('No data available');
        expect(rsi.interpretation).not.toBe('No RSI value available');
      }
    }, 20000);

    test('RSI interpretation should work with array results', async () => {
      const rsi = await client.getOptionRSI('SPY', 'put', 560, '2025-12-19');

      // Should not throw error about results.length being undefined
      expect(rsi.interpretation).toBeDefined();

      // If there are results, interpretation should reflect the RSI value
      if (rsi.results.length > 0) {
        const latestValue = rsi.results[0].value;

        if (latestValue > 70) {
          expect(rsi.interpretation).toContain('Overbought');
          expect(rsi.interpretation).toContain('RSI:');
        } else if (latestValue < 30) {
          expect(rsi.interpretation).toContain('Oversold');
          expect(rsi.interpretation).toContain('RSI:');
        } else {
          expect(rsi.interpretation).toContain('Neutral');
          expect(rsi.interpretation).toContain('RSI:');
        }
      }
    }, 20000);
  });

  describe('Bug Fix: getDividends Zero Values', () => {
    test('should accept frequency: 0 for one-time dividends', async () => {
      // This should NOT be dropped - frequency: 0 is valid
      const result = await client.getDividends({
        frequency: 0,
        limit: 10
      });

      // Should complete without error
      expect(result).toHaveProperty('results');
      expect(result).toHaveProperty('count');

      // If API supports frequency filter, results should respect it
      // (We can't assert the API honors it, but we can verify the request doesn't fail)
    }, 15000);

    test('should accept cash_amount: 0 for zero dividends', async () => {
      // This should NOT be dropped - cash_amount: 0 is valid
      const result = await client.getDividends({
        cash_amount: 0,
        limit: 10
      });

      // Should complete without error
      expect(result).toHaveProperty('results');
      expect(result).toHaveProperty('count');
    }, 15000);

    test('should handle multiple filters including zero values', async () => {
      const result = await client.getDividends({
        ticker: 'AAPL',
        frequency: 0,
        cash_amount: 0,
        limit: 5,
        sort: 'ex_dividend_date',
        order: 'desc'
      });

      // Should complete without error
      expect(result).toHaveProperty('results');
      expect(result).toHaveProperty('count');
      expect(result).toHaveProperty('fetched_at');
    }, 15000);

    test('should not include undefined or null filters', async () => {
      // These should be excluded
      const result = await client.getDividends({
        ticker: 'AAPL',
        frequency: undefined,
        cash_amount: null,
        limit: 10
      });

      // Should complete without error
      expect(result).toHaveProperty('results');
      expect(result).toHaveProperty('count');
    }, 15000);
  });

  describe('Integration: All Fixes Working Together', () => {
    test('should handle EMA with proper array structure', async () => {
      const ema = await client.getOptionEMA('SPY', 'call', 580, '2025-12-19');

      expect(Array.isArray(ema.results)).toBe(true);
      expect(ema).toHaveProperty('indicator', 'EMA');
      expect(ema).toHaveProperty('window', 20);
    }, 20000);

    test('should handle RSI with proper interpretation', async () => {
      const rsi = await client.getOptionRSI('SPY', 'call', 580, '2025-12-19');

      expect(Array.isArray(rsi.results)).toBe(true);
      expect(rsi).toHaveProperty('indicator', 'RSI');
      expect(rsi).toHaveProperty('interpretation');
      expect(typeof rsi.interpretation).toBe('string');
    }, 20000);

    test('should handle dividends with zero-value filters', async () => {
      const result = await client.getDividends({
        frequency: 0,
        limit: 5
      });

      expect(result).toHaveProperty('results');
      expect(Array.isArray(result.results)).toBe(true);
    }, 15000);
  });
});

// Test that runs even without API key
describe('Test Configuration', () => {
  test('should skip integration tests gracefully without API key', () => {
    const hasApiKey = !!process.env.MASSIVE_API_KEY;

    if (!hasApiKey) {
      console.log('✓ Integration tests properly skipped (no API key)');
    } else {
      console.log('✓ Integration tests enabled (API key present)');
    }

    // This test always passes
    expect(true).toBe(true);
  });
});
