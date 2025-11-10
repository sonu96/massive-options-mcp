/**
 * Tests for dealer positioning bug fixes:
 * 1. Empty strike set guard
 * 2. Expiration metadata accuracy
 */

import { MassiveOptionsClient } from '../src/massive-client.js';
import dotenv from 'dotenv';

dotenv.config();

const describeIfApiKey = process.env.MASSIVE_API_KEY ? describe : describe.skip;

describeIfApiKey('Dealer Positioning Bug Fixes', () => {
  let client;

  beforeAll(() => {
    const apiKey = process.env.MASSIVE_API_KEY;
    client = new MassiveOptionsClient(apiKey);
  });

  describe('Empty Strike Set Guard', () => {
    test('should throw error when strike_range filters out all contracts', async () => {
      // Test with an unrealistic strike range that should filter out everything
      await expect(
        client.getDealerPositioningMatrix({
          symbol: 'SPY',
          strike_range: {
            min: 99999,
            max: 100000
          }
        })
      ).rejects.toThrow(/No contracts in the requested strike range/);
    }, 20000);

    test('should provide helpful error message for empty strike set', async () => {
      try {
        await client.getDealerPositioningMatrix({
          symbol: 'SPY',
          strike_range: {
            min: 99999,
            max: 100000
          }
        });
        fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).toContain('No contracts in the requested strike range');
        expect(error.message).toContain('widening the strike_range');
      }
    }, 20000);
  });

  describe('Expiration Metadata Accuracy', () => {
    test('should return only actually processed expirations', async () => {
      // Request specific expirations - some might not exist
      const result = await client.getDealerPositioningMatrix({
        symbol: 'SPY',
        expirations: ['2025-12-19', '2026-01-16', '2099-12-31'], // Last one definitely doesn't exist
        strike_range: {
          min: 500,
          max: 600
        }
      });

      // Verify that expirations in result are only those that were actually processed
      expect(result).toHaveProperty('expirations');
      expect(Array.isArray(result.expirations)).toBe(true);

      // Should NOT include the non-existent expiration
      expect(result.expirations).not.toContain('2099-12-31');

      // Verify the expirations array is sorted
      const sortedExpirations = [...result.expirations].sort();
      expect(result.expirations).toEqual(sortedExpirations);
    }, 30000);

    test('should process all valid expirations when some are invalid', async () => {
      const result = await client.getDealerPositioningMatrix({
        symbol: 'SPY',
        expirations: [
          '2025-12-19',
          '2026-01-16',
          '2099-12-31', // Invalid
          '2098-01-01'  // Invalid
        ],
        strike_range: {
          min: 500,
          max: 600
        }
      });

      // Should have processed at least some valid expirations
      expect(result.expirations.length).toBeGreaterThan(0);

      // None of the returned expirations should be from 2098 or 2099
      result.expirations.forEach(exp => {
        expect(exp).not.toMatch(/^2098/);
        expect(exp).not.toMatch(/^2099/);
      });
    }, 30000);

    test('should throw error when NO requested expirations exist', async () => {
      await expect(
        client.getDealerPositioningMatrix({
          symbol: 'SPY',
          expirations: ['2099-12-31', '2098-01-01'], // All invalid
          strike_range: {
            min: 500,
            max: 600
          }
        })
      ).rejects.toThrow(/No data available for requested expirations/);
    }, 20000);
  });

  describe('Integration - Valid Data', () => {
    test('should successfully process valid request with correct metadata', async () => {
      const result = await client.getDealerPositioningMatrix({
        symbol: 'SPY',
        strike_range: {
          min: 550,
          max: 600
        }
      });

      // Verify structure
      expect(result).toHaveProperty('symbol');
      expect(result).toHaveProperty('expirations');
      expect(result).toHaveProperty('strike_range');
      expect(result).toHaveProperty('gex_matrix');
      expect(result).toHaveProperty('key_levels');

      // Verify strike_range metadata is valid (not Infinity/-Infinity)
      expect(result.strike_range.min).toBeGreaterThan(0);
      expect(result.strike_range.max).toBeLessThan(Infinity);
      expect(result.strike_range.count).toBeGreaterThan(0);
      expect(Number.isFinite(result.strike_range.min)).toBe(true);
      expect(Number.isFinite(result.strike_range.max)).toBe(true);

      // Verify key levels don't have Infinity/NaN
      if (result.key_levels.max_positive_gex) {
        expect(Number.isFinite(result.key_levels.max_positive_gex.strike)).toBe(true);
      }
      if (result.key_levels.max_negative_gex) {
        expect(Number.isFinite(result.key_levels.max_negative_gex.strike)).toBe(true);
      }
      if (result.key_levels.total_gex !== undefined) {
        expect(Number.isFinite(result.key_levels.total_gex)).toBe(true);
      }
    }, 30000);

    test('should handle null expirations (use all available)', async () => {
      const result = await client.getDealerPositioningMatrix({
        symbol: 'SPY',
        expirations: null, // Should use all available
        strike_range: {
          min: 550,
          max: 600
        }
      });

      // Should have found and processed some expirations
      expect(result.expirations.length).toBeGreaterThan(0);

      // All returned expirations should be valid date strings
      result.expirations.forEach(exp => {
        expect(exp).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(new Date(exp).toString()).not.toBe('Invalid Date');
      });
    }, 30000);
  });

  describe('Strike Range Edge Cases', () => {
    test('should handle very wide strike range', async () => {
      const result = await client.getDealerPositioningMatrix({
        symbol: 'SPY',
        strike_range: {
          min: 100,
          max: 1000
        }
      });

      // Should successfully process
      expect(result.strike_range.count).toBeGreaterThan(0);
      expect(result.strike_range.min).toBeGreaterThanOrEqual(100);
      expect(result.strike_range.max).toBeLessThanOrEqual(1000);
    }, 30000);

    test('should handle very narrow strike range', async () => {
      // This might return few strikes or throw if none match
      try {
        const result = await client.getDealerPositioningMatrix({
          symbol: 'SPY',
          strike_range: {
            min: 570,
            max: 575
          }
        });

        // If successful, verify structure
        expect(result.strike_range.count).toBeGreaterThan(0);
        expect(result.strike_range.min).toBeGreaterThanOrEqual(570);
        expect(result.strike_range.max).toBeLessThanOrEqual(575);
      } catch (error) {
        // If it throws, should be the helpful error
        expect(error.message).toContain('No contracts in the requested strike range');
      }
    }, 30000);
  });
});
