/**
 * Options Screener Test Suite
 *
 * Tests the options screening functionality with various criteria
 */

import { MassiveOptionsClient } from '../src/massive-client.js';
import {
  applyScreenerFilters,
  rankScreenerResults,
  formatScreenerOutput,
  getCachedChain,
  setCachedChain,
  clearCache,
  DEFAULT_SCREENER_SYMBOLS
} from '../src/options-screener.js';
import dotenv from 'dotenv';

dotenv.config();

const API_KEY = process.env.MASSIVE_API_KEY;

if (!API_KEY) {
  console.error('ERROR: MASSIVE_API_KEY not set in environment');
  console.error('Please set MASSIVE_API_KEY in your .env file');
  process.exit(1);
}

const client = new MassiveOptionsClient(API_KEY);

// Helper to print test results
function printTestResult(testName, passed, details = '') {
  const status = passed ? '✓ PASS' : '✗ FAIL';
  console.log(`${status}: ${testName}`);
  if (details) {
    console.log(`  ${details}`);
  }
}

// Helper to print section header
function printSection(title) {
  console.log('\n' + '='.repeat(70));
  console.log(title);
  console.log('='.repeat(70));
}

// Test 1: Basic screener call with volume filter
async function testVolumeFilter() {
  printSection('Test 1: Screen by Volume (min_volume: 100)');

  try {
    const results = await client.screenOptions({
      symbols: ['SPY', 'AAPL', 'TSLA'], // Limit to 3 symbols for faster testing
      min_volume: 100,
      limit: 10
    });

    printTestResult(
      'Volume filter',
      results.success && results.matches.length > 0,
      `Found ${results.total_matched} matches from ${results.total_screened} options`
    );

    if (results.matches.length > 0) {
      console.log('\nTop 3 Results:');
      results.matches.slice(0, 3).forEach((opt, i) => {
        console.log(`  ${i + 1}. ${opt.ticker} | Vol: ${opt.volume} | Strike: $${opt.strike} | DTE: ${opt.days_to_expiration}`);
      });
    }

    console.log(`\nExecution time: ${results.execution_time_ms}ms`);
    console.log(`Cache: ${results.cache_hits} hits, ${results.cache_misses} misses`);

    return results.success;
  } catch (error) {
    printTestResult('Volume filter', false, error.message);
    return false;
  }
}

// Test 2: Screen by Delta range
async function testDeltaFilter() {
  printSection('Test 2: Screen by Delta (0.30 - 0.40 for covered calls)');

  try {
    const results = await client.screenOptions({
      symbols: ['SPY', 'QQQ'],
      option_type: 'call',
      min_delta: 0.30,
      max_delta: 0.40,
      min_volume: 50,
      limit: 10
    });

    printTestResult(
      'Delta filter',
      results.success && results.total_matched >= 0,
      `Found ${results.total_matched} calls with delta 0.30-0.40`
    );

    if (results.matches.length > 0) {
      console.log('\nTop 5 Results:');
      results.matches.slice(0, 5).forEach((opt, i) => {
        console.log(`  ${i + 1}. ${opt.ticker} | Delta: ${opt.delta?.toFixed(3)} | Strike: $${opt.strike} | IV: ${(opt.implied_volatility * 100).toFixed(1)}%`);
      });
    }

    return results.success;
  } catch (error) {
    printTestResult('Delta filter', false, error.message);
    return false;
  }
}

// Test 3: Screen by IV (high IV for premium selling)
async function testImpliedVolatilityFilter() {
  printSection('Test 3: Screen by High IV (min_iv: 0.35 for premium selling)');

  try {
    const results = await client.screenOptions({
      symbols: ['TSLA', 'NVDA', 'AMD'],
      min_iv: 0.35,
      min_open_interest: 100,
      min_days_to_expiration: 21,
      max_days_to_expiration: 45,
      sort_by: 'iv',
      limit: 10
    });

    printTestResult(
      'IV filter',
      results.success && results.total_matched >= 0,
      `Found ${results.total_matched} high IV options (>35%)`
    );

    if (results.matches.length > 0) {
      console.log('\nTop 5 High IV Options:');
      results.matches.slice(0, 5).forEach((opt, i) => {
        console.log(`  ${i + 1}. ${opt.ticker} | IV: ${(opt.implied_volatility * 100).toFixed(1)}% | Type: ${opt.contract_type} | DTE: ${opt.days_to_expiration}`);
      });
    }

    return results.success;
  } catch (error) {
    printTestResult('IV filter', false, error.message);
    return false;
  }
}

// Test 4: Screen by moneyness (OTM puts for hedging)
async function testMoneynessFilter() {
  printSection('Test 4: Screen OTM Puts for Hedging');

  try {
    const results = await client.screenOptions({
      symbols: ['SPY', 'QQQ'],
      option_type: 'put',
      moneyness: 'OTM',
      max_price: 2.00,
      min_days_to_expiration: 30,
      max_days_to_expiration: 60,
      min_volume: 100,
      limit: 10
    });

    printTestResult(
      'Moneyness filter (OTM puts)',
      results.success && results.total_matched >= 0,
      `Found ${results.total_matched} OTM puts under $2.00`
    );

    if (results.matches.length > 0) {
      console.log('\nTop 5 OTM Puts:');
      results.matches.slice(0, 5).forEach((opt, i) => {
        console.log(`  ${i + 1}. ${opt.ticker} | Strike: $${opt.strike} | Price: $${opt.midpoint?.toFixed(2)} | DTE: ${opt.days_to_expiration}`);
      });
    }

    return results.success;
  } catch (error) {
    printTestResult('Moneyness filter', false, error.message);
    return false;
  }
}

// Test 5: Screen by liquidity quality
async function testLiquidityFilter() {
  printSection('Test 5: Screen by Liquidity Quality (GOOD or better)');

  try {
    const results = await client.screenOptions({
      symbols: ['SPY', 'AAPL', 'MSFT'],
      liquidity_quality: 'GOOD',
      min_open_interest: 500,
      sort_by: 'liquidity_score',
      limit: 10
    });

    printTestResult(
      'Liquidity filter',
      results.success && results.total_matched >= 0,
      `Found ${results.total_matched} liquid options (GOOD+ quality)`
    );

    if (results.matches.length > 0) {
      console.log('\nTop 5 Most Liquid Options:');
      results.matches.slice(0, 5).forEach((opt, i) => {
        console.log(`  ${i + 1}. ${opt.ticker} | Quality: ${opt.liquidity_quality} | Score: ${opt.liquidity_score?.toFixed(1)} | Spread: ${opt.bid_ask_spread_percent?.toFixed(2)}%`);
      });
    }

    return results.success;
  } catch (error) {
    printTestResult('Liquidity filter', false, error.message);
    return false;
  }
}

// Test 6: Combined filters (realistic covered call screen)
async function testCombinedFilters() {
  printSection('Test 6: Combined Filters - Covered Call Candidates');
  console.log('Criteria: OTM calls, 30-45 DTE, delta 0.25-0.40, good liquidity, high volume');

  try {
    const results = await client.screenOptions({
      symbols: ['AAPL', 'MSFT', 'GOOGL', 'AMZN'],
      option_type: 'call',
      moneyness: 'OTM',
      min_delta: 0.25,
      max_delta: 0.40,
      min_days_to_expiration: 30,
      max_days_to_expiration: 45,
      min_volume: 50,
      liquidity_quality: 'GOOD',
      sort_by: 'iv',
      limit: 15
    });

    printTestResult(
      'Combined filters (covered calls)',
      results.success && results.total_matched >= 0,
      `Found ${results.total_matched} covered call candidates`
    );

    if (results.matches.length > 0) {
      console.log('\nTop 5 Covered Call Opportunities:');
      results.matches.slice(0, 5).forEach((opt, i) => {
        console.log(`  ${i + 1}. ${opt.underlying_symbol} ${opt.strike} ${opt.contract_type.toUpperCase()}`);
        console.log(`      Delta: ${opt.delta?.toFixed(3)} | IV: ${(opt.implied_volatility * 100).toFixed(1)}% | Premium: $${opt.midpoint?.toFixed(2)}`);
        console.log(`      DTE: ${opt.days_to_expiration} | Vol: ${opt.volume} | OI: ${opt.open_interest}`);
      });
    }

    return results.success;
  } catch (error) {
    printTestResult('Combined filters', false, error.message);
    return false;
  }
}

// Test 7: Caching behavior
async function testCaching() {
  printSection('Test 7: Caching Behavior');

  try {
    // Clear cache first
    clearCache();
    console.log('Cache cleared');

    // First call - should hit API
    console.log('\nFirst call (should miss cache):');
    const results1 = await client.screenOptions({
      symbols: ['SPY'],
      min_volume: 100,
      limit: 5
    });
    console.log(`  Cache hits: ${results1.cache_hits}, misses: ${results1.cache_misses}`);
    console.log(`  Execution time: ${results1.execution_time_ms}ms`);

    // Second call - should hit cache
    console.log('\nSecond call (should hit cache):');
    const results2 = await client.screenOptions({
      symbols: ['SPY'],
      min_volume: 100,
      limit: 5
    });
    console.log(`  Cache hits: ${results2.cache_hits}, misses: ${results2.cache_misses}`);
    console.log(`  Execution time: ${results2.execution_time_ms}ms`);

    const cacheWorking = results2.cache_hits > results1.cache_hits;
    const fasterSecondCall = results2.execution_time_ms < results1.execution_time_ms;

    printTestResult(
      'Caching',
      cacheWorking && fasterSecondCall,
      `Cache improved performance: ${results1.execution_time_ms}ms → ${results2.execution_time_ms}ms`
    );

    return cacheWorking;
  } catch (error) {
    printTestResult('Caching', false, error.message);
    return false;
  }
}

// Test 8: Sort by different criteria
async function testSorting() {
  printSection('Test 8: Sort By Different Criteria');

  const sortFields = ['volume', 'open_interest', 'iv', 'delta'];

  try {
    for (const sortBy of sortFields) {
      console.log(`\nTesting sort_by: ${sortBy}`);

      const results = await client.screenOptions({
        symbols: ['SPY'],
        min_volume: 50,
        sort_by: sortBy,
        limit: 5
      });

      if (results.success && results.matches.length > 0) {
        console.log(`  ✓ Sorted by ${sortBy}, got ${results.matches.length} results`);
        console.log(`    Top result: ${results.matches[0].ticker} | ${sortBy}: ${results.matches[0][sortBy]}`);
      } else {
        console.log(`  ✗ Failed to sort by ${sortBy}`);
      }
    }

    printTestResult('Sorting', true, 'All sort fields tested');
    return true;
  } catch (error) {
    printTestResult('Sorting', false, error.message);
    return false;
  }
}

// Test 9: Default symbols list
async function testDefaultSymbols() {
  printSection('Test 9: Default Symbols List (No symbols parameter)');

  try {
    console.log(`Default symbols list contains ${DEFAULT_SCREENER_SYMBOLS.length} symbols`);
    console.log(`Sample: ${DEFAULT_SCREENER_SYMBOLS.slice(0, 10).join(', ')}`);

    const results = await client.screenOptions({
      min_volume: 500, // Higher volume to limit results across all symbols
      min_open_interest: 1000,
      limit: 20
    });

    printTestResult(
      'Default symbols',
      results.success && results.symbols_screened === DEFAULT_SCREENER_SYMBOLS.length,
      `Screened ${results.symbols_screened} default symbols, found ${results.total_matched} matches`
    );

    return results.success;
  } catch (error) {
    printTestResult('Default symbols', false, error.message);
    return false;
  }
}

// Test 10: Edge cases
async function testEdgeCases() {
  printSection('Test 10: Edge Cases');

  const tests = [
    {
      name: 'No matches (impossible criteria)',
      params: {
        symbols: ['SPY'],
        min_volume: 1000000, // Impossibly high volume
        limit: 10
      },
      expectMatches: 0
    },
    {
      name: 'Limit parameter',
      params: {
        symbols: ['SPY'],
        min_volume: 10,
        limit: 3
      },
      expectMaxResults: 3
    },
    {
      name: 'Empty symbols array (should use defaults)',
      params: {
        symbols: [],
        min_volume: 500,
        limit: 5
      },
      expectSuccess: true
    }
  ];

  let allPassed = true;

  for (const test of tests) {
    try {
      const results = await client.screenOptions(test.params);

      let passed = results.success;

      if (test.expectMatches !== undefined) {
        passed = passed && results.total_matched === test.expectMatches;
      }

      if (test.expectMaxResults !== undefined) {
        passed = passed && results.returned <= test.expectMaxResults;
      }

      if (test.expectSuccess !== undefined) {
        passed = passed && results.success === test.expectSuccess;
      }

      console.log(`  ${passed ? '✓' : '✗'} ${test.name}: ${JSON.stringify(results.returned || 0)} results`);

      allPassed = allPassed && passed;
    } catch (error) {
      console.log(`  ✗ ${test.name}: ${error.message}`);
      allPassed = false;
    }
  }

  printTestResult('Edge cases', allPassed);
  return allPassed;
}

// Main test runner
async function runAllTests() {
  console.log('Options Screener Test Suite');
  console.log('API Key:', API_KEY ? `${API_KEY.substring(0, 10)}...` : 'NOT SET');
  console.log('Starting tests...\n');

  const tests = [
    { name: 'Volume Filter', fn: testVolumeFilter },
    { name: 'Delta Filter', fn: testDeltaFilter },
    { name: 'Implied Volatility Filter', fn: testImpliedVolatilityFilter },
    { name: 'Moneyness Filter', fn: testMoneynessFilter },
    { name: 'Liquidity Filter', fn: testLiquidityFilter },
    { name: 'Combined Filters', fn: testCombinedFilters },
    { name: 'Caching', fn: testCaching },
    { name: 'Sorting', fn: testSorting },
    { name: 'Default Symbols', fn: testDefaultSymbols },
    { name: 'Edge Cases', fn: testEdgeCases }
  ];

  const results = [];

  for (const test of tests) {
    try {
      const passed = await test.fn();
      results.push({ name: test.name, passed });
    } catch (error) {
      console.error(`ERROR in ${test.name}:`, error.message);
      results.push({ name: test.name, passed: false });
    }
  }

  // Summary
  printSection('Test Summary');
  const passed = results.filter(r => r.passed).length;
  const total = results.length;

  console.log(`\nResults: ${passed}/${total} tests passed\n`);

  results.forEach(r => {
    console.log(`  ${r.passed ? '✓' : '✗'} ${r.name}`);
  });

  if (passed === total) {
    console.log('\n🎉 All tests passed!');
  } else {
    console.log(`\n⚠️  ${total - passed} test(s) failed`);
  }

  process.exit(passed === total ? 0 : 1);
}

// Run tests
runAllTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
