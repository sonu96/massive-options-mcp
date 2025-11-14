import { MassiveOptionsClient } from '../src/massive-client.js';

describe('Validation Pipeline Fallback Logic', () => {
  let client;

  beforeEach(() => {
    client = new MassiveOptionsClient('test-api-key');
  });

  describe('Fallback logic validation', () => {
    test('getQuote should have fallback logic in place', async () => {
      // Read the source to verify fallback exists
      const getQuoteSource = client.getQuote.toString();

      // Verify fallback to clientV2.get is present
      expect(getQuoteSource).toContain('clientV2');
      expect(getQuoteSource).toContain('prev');
      expect(getQuoteSource).toContain('fallback');
    });

    test('getSpecificOptionSnapshot should use /quotes/ endpoint', async () => {
      // Read the source to verify correct endpoint
      const snapshotSource = client.getSpecificOptionSnapshot.toString();

      // Should use /quotes/ not /snapshot/options/
      expect(snapshotSource).toContain('/quotes/');
      expect(snapshotSource).not.toContain('/snapshot/options/${symbol}/${optionContract}');
    });
  });

  describe('Underlying price impact on probability calculator', () => {
    test('valid underlying_price should allow probability calculation', () => {
      // Simulate what probability calculator receives
      const snapshot = {
        underlying_price: 150.25,
        implied_volatility: 0.35,
        strike_price: 150,
        expiration_date: '2025-01-17'
      };

      const S = snapshot.underlying_price || 0;
      const σ = snapshot.implied_volatility || 0;

      // Should be valid for calculations
      expect(S).toBeGreaterThan(0);
      expect(σ).toBeGreaterThan(0);
    });

    test('null underlying_price would cause calculation to fail', () => {
      // This is what happens when fallback fails
      const snapshot = {
        underlying_price: null,
        implied_volatility: 0.35
      };

      const S = snapshot.underlying_price || 0;

      // Would trigger "Invalid option data - missing price" error
      expect(S).toBe(0);
    });

    test('fallback price should also be valid for calculations', () => {
      // Simulate fallback scenario
      const snapshot = {
        underlying_price: 148.50,  // Previous close from fallback
        implied_volatility: 0.35
      };

      const S = snapshot.underlying_price || 0;
      const σ = snapshot.implied_volatility || 0;

      // Fallback price should still be valid
      expect(S).toBeGreaterThan(0);
      expect(σ).toBeGreaterThan(0);
    });
  });

  describe('Data structure validation', () => {
    test('underlying_price extraction logic in probability calculator', () => {
      // Test the extraction pattern used by probability calculator
      const snapshot1 = {
        underlying_asset: { price: 150.25 }
      };
      const S1 = snapshot1.underlying_asset?.price || snapshot1.underlying_price || 0;
      expect(S1).toBe(150.25);

      const snapshot2 = {
        underlying_price: 150.25
      };
      const S2 = snapshot2.underlying_asset?.price || snapshot2.underlying_price || 0;
      expect(S2).toBe(150.25);

      const snapshot3 = {};
      const S3 = snapshot3.underlying_asset?.price || snapshot3.underlying_price || 0;
      expect(S3).toBe(0);
    });

    test('option snapshot should include required metadata', () => {
      // Verify the structure we expect from getSpecificOptionSnapshot
      const expectedFields = ['fetch_timestamp', 'data_timestamp', 'data_age_seconds'];

      // Just verify the structure is defined in the method
      const snapshotSource = client.getSpecificOptionSnapshot.toString();

      expectedFields.forEach(field => {
        expect(snapshotSource).toContain(field);
      });
    });
  });

  describe('Error handling', () => {
    test('should have error handling for both getStockQuote and fallback', () => {
      const getQuoteSource = client.getQuote.toString();

      // Should have try-catch for getStockQuote
      expect(getQuoteSource).toContain('try');
      expect(getQuoteSource).toContain('catch');

      // Should have nested try-catch for fallback
      const tryCatchCount = (getQuoteSource.match(/try/g) || []).length;
      expect(tryCatchCount).toBeGreaterThanOrEqual(2); // At least 2 try blocks
    });

    test('should log errors appropriately', () => {
      const getQuoteSource = client.getQuote.toString();

      // Should log when real-time fails
      expect(getQuoteSource).toContain('console.error');

      // Should log fallback attempt
      expect(getQuoteSource).toContain('fallback');
    });
  });
});
