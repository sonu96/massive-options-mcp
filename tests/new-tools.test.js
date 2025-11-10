/**
 * Tests for the 5 new tools:
 * - get_market_status
 * - get_upcoming_market_holidays
 * - get_dividends
 * - get_option_ema
 * - get_option_rsi
 */

import { MassiveOptionsClient } from '../src/massive-client.js';
import dotenv from 'dotenv';

dotenv.config();

const describeIfApiKey = process.env.MASSIVE_API_KEY ? describe : describe.skip;

describeIfApiKey('New Tools Test Suite', () => {
  let client;

  beforeAll(() => {
    const apiKey = process.env.MASSIVE_API_KEY;
    client = new MassiveOptionsClient(apiKey);
  });

  describe('Market Status', () => {
    test('should fetch current market status with correct structure', async () => {
      const result = await client.getMarketStatus();

      // Verify basic structure
      expect(result).toHaveProperty('market');
      expect(result).toHaveProperty('serverTime');
      expect(result).toHaveProperty('overall_status');
      expect(result).toHaveProperty('trading_allowed');
      expect(result).toHaveProperty('exchanges');

      // Verify overall_status is one of the expected values
      expect(['Markets Open', 'Markets Closed']).toContain(result.overall_status);

      // Verify trading_allowed is a boolean
      expect(typeof result.trading_allowed).toBe('boolean');

      // Verify exchanges is an array
      expect(Array.isArray(result.exchanges)).toBe(true);

      // If exchanges exist, verify structure
      if (result.exchanges.length > 0) {
        const firstExchange = result.exchanges[0];
        expect(firstExchange).toHaveProperty('exchange');
        expect(firstExchange).toHaveProperty('market');
        expect(firstExchange).toHaveProperty('status');
        expect(firstExchange).toHaveProperty('serverTime');
      }
    }, 10000);

    test('should correctly parse exchange status', async () => {
      const result = await client.getMarketStatus();

      // Verify that major exchanges are present
      const exchangeNames = result.exchanges.map(ex => ex.exchange);
      const hasMajorExchanges = ['nyse', 'nasdaq', 'amex'].some(
        exchange => exchangeNames.includes(exchange)
      );

      expect(hasMajorExchanges).toBe(true);

      // Verify each exchange has a valid status
      result.exchanges.forEach(exchange => {
        expect(exchange.status).toBeDefined();
        expect(typeof exchange.status).toBe('string');
      });
    }, 10000);
  });

  describe('Upcoming Market Holidays', () => {
    test('should fetch upcoming market holidays', async () => {
      const result = await client.getUpcomingMarketHolidays();

      // Verify structure
      expect(result).toHaveProperty('holidays');
      expect(result).toHaveProperty('fetched_at');

      // Verify holidays is an array
      expect(Array.isArray(result.holidays)).toBe(true);

      // Verify fetched_at is a valid ISO date string
      expect(new Date(result.fetched_at).toString()).not.toBe('Invalid Date');
    }, 10000);
  });

  describe('Dividends', () => {
    test('should fetch dividends with no filters', async () => {
      const result = await client.getDividends({});

      // Verify structure
      expect(result).toHaveProperty('results');
      expect(result).toHaveProperty('count');
      expect(result).toHaveProperty('status');
      expect(result).toHaveProperty('fetched_at');

      // Verify results is an array
      expect(Array.isArray(result.results)).toBe(true);
    }, 10000);

    test('should fetch dividends filtered by ticker', async () => {
      const result = await client.getDividends({
        ticker: 'AAPL',
        limit: 10
      });

      // Verify structure
      expect(result).toHaveProperty('results');
      expect(Array.isArray(result.results)).toBe(true);

      // If results exist, verify they're for AAPL
      if (result.results.length > 0) {
        result.results.forEach(dividend => {
          expect(dividend.ticker).toBe('AAPL');
        });
      }
    }, 10000);

    test('should support all filter parameters', async () => {
      // Test that all parameters are accepted (even if results are empty)
      const result = await client.getDividends({
        ticker: 'AAPL',
        ex_dividend_date: '2024-01-01',
        record_date: '2024-01-05',
        declaration_date: '2023-12-15',
        pay_date: '2024-01-15',
        cash_amount: 0.24,
        frequency: 4,
        limit: 50,
        sort: 'ex_dividend_date',
        order: 'asc'
      });

      // Should not throw an error
      expect(result).toHaveProperty('results');
      expect(result).toHaveProperty('count');
    }, 10000);

    test('should support sorting and ordering', async () => {
      const resultDesc = await client.getDividends({
        ticker: 'AAPL',
        limit: 5,
        sort: 'ex_dividend_date',
        order: 'desc'
      });

      const resultAsc = await client.getDividends({
        ticker: 'AAPL',
        limit: 5,
        sort: 'ex_dividend_date',
        order: 'asc'
      });

      expect(resultDesc).toHaveProperty('results');
      expect(resultAsc).toHaveProperty('results');
    }, 10000);
  });

  describe('Option EMA', () => {
    test('should fetch EMA for an option contract', async () => {
      // Use a liquid option that likely has data
      const result = await client.getOptionEMA(
        'SPY',
        'call',
        580,
        '2025-12-19',
        'day',
        20
      );

      // Verify structure
      expect(result).toHaveProperty('ticker');
      expect(result).toHaveProperty('underlying');
      expect(result).toHaveProperty('contract_type');
      expect(result).toHaveProperty('strike');
      expect(result).toHaveProperty('expiration');
      expect(result).toHaveProperty('indicator');
      expect(result).toHaveProperty('timespan');
      expect(result).toHaveProperty('window');
      expect(result).toHaveProperty('results');
      expect(result).toHaveProperty('fetched_at');

      // Verify values
      expect(result.underlying).toBe('SPY');
      expect(result.contract_type).toBe('call');
      expect(result.strike).toBe(580);
      expect(result.expiration).toBe('2025-12-19');
      expect(result.indicator).toBe('EMA');
      expect(result.timespan).toBe('day');
      expect(result.window).toBe(20);

      // Verify results exists (might be array or object depending on API response)
      expect(result.results).toBeDefined();
    }, 15000);

    test('should use default values for optional parameters', async () => {
      const result = await client.getOptionEMA(
        'SPY',
        'call',
        580,
        '2025-12-19'
        // timespan and window not provided - should use defaults
      );

      // Verify defaults were used
      expect(result.timespan).toBe('day');
      expect(result.window).toBe(20);
    }, 15000);

    test('should accept custom window sizes', async () => {
      const result = await client.getOptionEMA(
        'SPY',
        'call',
        580,
        '2025-12-19',
        'day',
        50
      );

      expect(result.window).toBe(50);
    }, 15000);
  });

  describe('Option RSI', () => {
    test('should fetch RSI for an option contract', async () => {
      const result = await client.getOptionRSI(
        'SPY',
        'put',
        560,
        '2025-12-19',
        'day',
        14
      );

      // Verify structure
      expect(result).toHaveProperty('ticker');
      expect(result).toHaveProperty('underlying');
      expect(result).toHaveProperty('contract_type');
      expect(result).toHaveProperty('strike');
      expect(result).toHaveProperty('expiration');
      expect(result).toHaveProperty('indicator');
      expect(result).toHaveProperty('timespan');
      expect(result).toHaveProperty('window');
      expect(result).toHaveProperty('results');
      expect(result).toHaveProperty('interpretation');
      expect(result).toHaveProperty('fetched_at');

      // Verify values
      expect(result.underlying).toBe('SPY');
      expect(result.contract_type).toBe('put');
      expect(result.strike).toBe(560);
      expect(result.expiration).toBe('2025-12-19');
      expect(result.indicator).toBe('RSI');
      expect(result.timespan).toBe('day');
      expect(result.window).toBe(14);

      // Verify results exists (might be array or object depending on API response)
      expect(result.results).toBeDefined();

      // Verify interpretation exists
      expect(typeof result.interpretation).toBe('string');
    }, 15000);

    test('should provide correct RSI interpretation', async () => {
      const result = await client.getOptionRSI(
        'SPY',
        'call',
        580,
        '2025-12-19'
      );

      // Interpretation should be one of the expected formats
      const validInterpretations = [
        'No data available',
        'No RSI value available'
      ];

      const isValidOrContainsRSI =
        validInterpretations.includes(result.interpretation) ||
        result.interpretation.includes('Overbought') ||
        result.interpretation.includes('Oversold') ||
        result.interpretation.includes('Neutral');

      expect(isValidOrContainsRSI).toBe(true);
    }, 15000);

    test('should use default values for optional parameters', async () => {
      const result = await client.getOptionRSI(
        'SPY',
        'call',
        580,
        '2025-12-19'
        // timespan and window not provided - should use defaults
      );

      // Verify defaults were used
      expect(result.timespan).toBe('day');
      expect(result.window).toBe(14);
    }, 15000);
  });

  describe('Integration Tests', () => {
    test('should handle market status and holidays together', async () => {
      const status = await client.getMarketStatus();
      const holidays = await client.getUpcomingMarketHolidays();

      expect(status.overall_status).toBeDefined();
      expect(Array.isArray(holidays.holidays)).toBe(true);
    }, 10000);

    test('should handle multiple technical indicators for same option', async () => {
      const symbol = 'SPY';
      const optionType = 'call';
      const strike = 580;
      const expiration = '2025-12-19';

      const ema = await client.getOptionEMA(symbol, optionType, strike, expiration);
      const rsi = await client.getOptionRSI(symbol, optionType, strike, expiration);

      // Both should reference the same option
      expect(ema.underlying).toBe(rsi.underlying);
      expect(ema.contract_type).toBe(rsi.contract_type);
      expect(ema.strike).toBe(rsi.strike);
      expect(ema.expiration).toBe(rsi.expiration);

      // But different indicators
      expect(ema.indicator).toBe('EMA');
      expect(rsi.indicator).toBe('RSI');
    }, 20000);
  });

  describe('Error Handling', () => {
    test('should handle invalid option ticker in EMA', async () => {
      await expect(
        client.getOptionEMA('INVALID', 'call', 999, '2025-12-19')
      ).rejects.toThrow();
    }, 10000);

    test('should handle invalid option ticker in RSI', async () => {
      await expect(
        client.getOptionRSI('INVALID', 'call', 999, '2025-12-19')
      ).rejects.toThrow();
    }, 10000);
  });
});
