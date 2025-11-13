#!/usr/bin/env node

/**
 * Quick test script for market indicators
 * Run with: node test-market-indicators.js
 */

import { MassiveOptionsClient } from './src/massive-client.js';
import dotenv from 'dotenv';

dotenv.config();

async function testMarketIndicators() {
  console.log('Testing Market Indicators...\n');

  const client = new MassiveOptionsClient(
    process.env.MASSIVE_API_KEY,
    process.env.MASSIVE_API_BASE_URL
  );

  try {
    const indicators = await client.getMarketIndicators();

    console.log('=== MARKET INDICATORS ===\n');
    console.log(JSON.stringify(indicators, null, 2));
    console.log('\n✓ Market indicators fetched successfully!');

  } catch (error) {
    console.error('✗ Error:', error.message);
    process.exit(1);
  }
}

testMarketIndicators();
