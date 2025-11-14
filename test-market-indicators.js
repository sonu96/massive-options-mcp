#!/usr/bin/env node

/**
 * Quick test script for market indicators with real-time data validation
 * Run with: node test-market-indicators.js
 */

import { MassiveOptionsClient } from './src/massive-client.js';
import dotenv from 'dotenv';

dotenv.config();

async function testMarketIndicators() {
  console.log('='.repeat(70));
  console.log('MARKET INDICATORS - REAL-TIME DATA VALIDATION');
  console.log('='.repeat(70));
  console.log();

  const client = new MassiveOptionsClient(
    process.env.MASSIVE_API_KEY,
    process.env.MASSIVE_API_BASE_URL
  );

  try {
    console.log('[1/3] Fetching market indicators...');
    const indicators = await client.getMarketIndicators();

    console.log('[2/3] Validating data structure...');

    // Validate structure
    if (!indicators.timestamp || !indicators.indicators || !indicators.market_summary) {
      throw new Error('Invalid response structure');
    }

    console.log('[3/3] Checking data freshness and real-time status...\n');

    const symbols = ['SPY', 'VIX', 'QQQ', 'UUP', 'TLT'];
    let successCount = 0;
    let errorCount = 0;
    let realTimeCount = 0;

    console.log('─'.repeat(70));
    console.log('Symbol    Status        Price      Change%    Real-Time    Market Status');
    console.log('─'.repeat(70));

    for (const symbol of symbols) {
      const indicator = indicators.indicators[symbol];

      if (indicator.error) {
        console.log(`${symbol.padEnd(10)}✗ ERROR      ${indicator.error.substring(0, 45)}`);
        errorCount++;
      } else {
        const statusMark = indicator.is_real_time ? '✓ LIVE' : '○ PREV';
        const changeStr = indicator.change_percent >= 0
          ? `+${indicator.change_percent.toFixed(2)}%`
          : `${indicator.change_percent.toFixed(2)}%`;

        console.log(
          `${symbol.padEnd(10)}${statusMark}      ` +
          `$${indicator.current_price.toString().padEnd(8)} ` +
          `${changeStr.padEnd(10)} ` +
          `${indicator.is_real_time ? 'Yes' : 'No '}          ` +
          `${indicator.market_status}`
        );

        successCount++;
        if (indicator.is_real_time) realTimeCount++;
      }
    }

    console.log('─'.repeat(70));
    console.log();

    // Display market summary
    console.log('MARKET SUMMARY:');
    console.log('  Overall Sentiment:', indicators.market_summary.overall_sentiment);
    console.log('  Risk Environment:', indicators.market_summary.risk_environment);

    if (indicators.market_summary.key_observations.length > 0) {
      console.log('  Key Observations:');
      indicators.market_summary.key_observations.forEach(obs => {
        console.log(`    • ${obs}`);
      });
    }
    console.log();

    // Data freshness validation
    console.log('DATA VALIDATION:');
    console.log(`  ✓ ${successCount}/${symbols.length} symbols fetched successfully`);

    if (errorCount > 0) {
      console.log(`  ⚠ ${errorCount}/${symbols.length} symbols had errors (likely API plan limitations)`);
    }

    console.log(`  ${realTimeCount > 0 ? '✓' : '○'} ${realTimeCount}/${successCount} using real-time data`);

    if (realTimeCount === 0 && successCount > 0) {
      console.log('  ℹ All data from previous close (market likely closed)');
    }

    // Timestamp validation
    const fetchTime = new Date(indicators.timestamp);
    console.log(`  ✓ Data fetched at: ${fetchTime.toLocaleString()}`);

    // Check if any indicator has recent data (within last hour)
    const hasRecentData = Object.values(indicators.indicators).some(ind => {
      if (ind.data_timestamp) {
        const dataTime = new Date(ind.data_timestamp);
        const ageMinutes = (Date.now() - dataTime.getTime()) / 1000 / 60;
        return ageMinutes < 60;
      }
      return false;
    });

    if (hasRecentData) {
      console.log('  ✓ Data includes recent market activity (< 1 hour old)');
    } else {
      console.log('  ℹ Data is from previous session (expected when market closed)');
    }

    console.log();
    console.log('─'.repeat(70));
    console.log('✓ Market indicators test completed successfully!');
    console.log('─'.repeat(70));

  } catch (error) {
    console.error('\n✗ Error:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

testMarketIndicators();
