#!/usr/bin/env node

// Diagnostic script to investigate available option data
import { MassiveOptionsClient } from './src/massive-client.js';
import dotenv from 'dotenv';

dotenv.config();

const client = new MassiveOptionsClient(
  process.env.MASSIVE_API_KEY,
  process.env.MASSIVE_API_BASE_URL
);

async function diagnoseData() {
  try {
    console.log('DIAGNOSING OPTION DATA AVAILABILITY FOR IBIT\n');
    console.log('='.repeat(80) + '\n');

    // Step 1: Get full option chain snapshot
    console.log('Step 1: Fetching option chain snapshot...\n');
    const snapshot = await client.getOptionChainSnapshot('IBIT');

    console.log('SNAPSHOT OVERVIEW:');
    console.log(`  Underlying: ${snapshot.underlying.symbol}`);
    console.log(`  Current Price: $${snapshot.underlying.price}`);
    console.log(`  Total Contracts: ${snapshot.total_contracts}`);
    console.log(`  Expirations Available: ${snapshot.expirations.length}`);
    console.log(`\nAvailable Expirations:`);
    snapshot.expirations.forEach((exp, i) => {
      console.log(`  ${i + 1}. ${exp}`);
    });

    console.log('\n' + '='.repeat(80) + '\n');

    // Step 2: Check each expiration in detail
    console.log('Step 2: Analyzing each expiration...\n');

    const targetExps = ['2025-11-07', '2025-11-14', '2025-11-21', '2025-11-28'];

    for (const exp of targetExps) {
      console.log(`\nEXPIRATION: ${exp}`);
      console.log('-'.repeat(40));

      if (!snapshot.data[exp]) {
        console.log(`  ❌ NO DATA AVAILABLE`);
        continue;
      }

      const expData = snapshot.data[exp];

      console.log(`  Calls: ${expData.calls?.length || 0}`);
      console.log(`  Puts: ${expData.puts?.length || 0}`);

      if (expData.calls && expData.calls.length > 0) {
        const strikes = expData.calls.map(c => c.strike).sort((a, b) => a - b);
        console.log(`  Call Strikes: ${strikes[0]} - ${strikes[strikes.length - 1]}`);

        // Check for Greeks availability
        const withGreeks = expData.calls.filter(c => c.greeks && c.greeks.gamma).length;
        const withIV = expData.calls.filter(c => c.implied_volatility).length;
        const withOI = expData.calls.filter(c => c.price && c.price.open_interest > 0).length;
        const withVolume = expData.calls.filter(c => c.price && c.price.volume > 0).length;

        console.log(`  ✓ With Greeks: ${withGreeks}/${expData.calls.length}`);
        console.log(`  ✓ With IV: ${withIV}/${expData.calls.length}`);
        console.log(`  ✓ With OI > 0: ${withOI}/${expData.calls.length}`);
        console.log(`  ✓ With Volume > 0: ${withVolume}/${expData.calls.length}`);

        // Sample a few strikes to see data quality
        console.log(`\n  Sample Calls (first 3):`);
        expData.calls.slice(0, 3).forEach(call => {
          console.log(`    Strike ${call.strike}:`);
          console.log(`      Price: ${call.price?.last || 'N/A'}`);
          console.log(`      Volume: ${call.price?.volume || 0}`);
          console.log(`      OI: ${call.price?.open_interest || 0}`);
          console.log(`      Gamma: ${call.greeks?.gamma || 'N/A'}`);
          console.log(`      IV: ${call.implied_volatility || 'N/A'}`);
        });
      }

      if (expData.puts && expData.puts.length > 0) {
        const strikes = expData.puts.map(p => p.strike).sort((a, b) => a - b);
        console.log(`\n  Put Strikes: ${strikes[0]} - ${strikes[strikes.length - 1]}`);

        const withGreeks = expData.puts.filter(p => p.greeks && p.greeks.gamma).length;
        const withOI = expData.puts.filter(p => p.price && p.price.open_interest > 0).length;

        console.log(`  ✓ With Greeks: ${withGreeks}/${expData.puts.length}`);
        console.log(`  ✓ With OI > 0: ${withOI}/${expData.puts.length}`);
      }
    }

    console.log('\n' + '='.repeat(80) + '\n');

    // Step 3: Try getting specific expiration data directly
    console.log('Step 3: Testing direct API call for Nov 21...\n');

    try {
      const nov21Data = await client.getOptionChainSnapshot('IBIT', '2025-11-21');
      console.log('✓ Nov 21 data retrieved:');
      console.log(`  Total contracts: ${nov21Data.total_contracts}`);
      console.log(`  Expirations in response: ${nov21Data.expirations.join(', ')}`);

      if (nov21Data.data['2025-11-21']) {
        const exp = nov21Data.data['2025-11-21'];
        console.log(`  Calls: ${exp.calls?.length || 0}`);
        console.log(`  Puts: ${exp.puts?.length || 0}`);
      }
    } catch (err) {
      console.log(`❌ Failed to get Nov 21 data: ${err.message}`);
    }

    console.log('\n' + '='.repeat(80) + '\n');

    // Step 4: Check if it's a strike range filtering issue
    console.log('Step 4: Testing with different strike ranges...\n');

    try {
      const wideRange = await client.getOptionChainSnapshot('IBIT', null, 40, 80);
      console.log('✓ Wide range (40-80) retrieved:');
      console.log(`  Total contracts: ${wideRange.total_contracts}`);
      console.log(`  Expirations: ${wideRange.expirations.length}`);

      // Count contracts per expiration
      Object.entries(wideRange.data).forEach(([exp, data]) => {
        const callCount = data.calls?.length || 0;
        const putCount = data.puts?.length || 0;
        console.log(`  ${exp}: ${callCount} calls, ${putCount} puts`);
      });
    } catch (err) {
      console.log(`❌ Failed with wide range: ${err.message}`);
    }

    console.log('\n' + '='.repeat(80) + '\n');

    // Step 5: Compare with SPY (known liquid ticker)
    console.log('Step 5: Comparing with SPY for reference...\n');

    try {
      const spySnapshot = await client.getOptionChainSnapshot('SPY');
      console.log('SPY Snapshot:');
      console.log(`  Current Price: $${spySnapshot.underlying.price}`);
      console.log(`  Total Contracts: ${spySnapshot.total_contracts}`);
      console.log(`  Expirations: ${spySnapshot.expirations.length}`);
      console.log(`  First 5 expirations: ${spySnapshot.expirations.slice(0, 5).join(', ')}`);

      // Check first expiration data quality
      const firstExp = spySnapshot.expirations[0];
      if (spySnapshot.data[firstExp]) {
        const exp = spySnapshot.data[firstExp];
        console.log(`\n  ${firstExp}:`);
        console.log(`    Calls: ${exp.calls?.length || 0}`);
        console.log(`    Puts: ${exp.puts?.length || 0}`);

        if (exp.calls && exp.calls.length > 0) {
          const withGreeks = exp.calls.filter(c => c.greeks && c.greeks.gamma).length;
          console.log(`    With Greeks: ${withGreeks}/${exp.calls.length}`);
        }
      }
    } catch (err) {
      console.log(`❌ Failed to get SPY data: ${err.message}`);
    }

    console.log('\n' + '='.repeat(80) + '\n');

    // Step 6: Test the underlying API endpoints directly
    console.log('Step 6: Testing raw API endpoints...\n');

    try {
      const axios = (await import('axios')).default;
      const baseURL = process.env.MASSIVE_API_BASE_URL || 'https://api.massive.com/v3';
      const apiKey = process.env.MASSIVE_API_KEY;

      // Test option contracts endpoint
      console.log('Testing /reference/options/contracts endpoint...');
      const contractsResponse = await axios.get(`${baseURL}/reference/options/contracts`, {
        params: {
          apiKey: apiKey,
          underlying_ticker: 'IBIT',
          expiration_date: '2025-11-21',
          limit: 250
        }
      });

      console.log(`✓ Contracts API response:`);
      console.log(`  Results count: ${contractsResponse.data.results?.length || 0}`);
      console.log(`  Status: ${contractsResponse.data.status}`);

      if (contractsResponse.data.results && contractsResponse.data.results.length > 0) {
        const strikes = contractsResponse.data.results.map(r => r.strike_price);
        console.log(`  Strike range: ${Math.min(...strikes)} - ${Math.max(...strikes)}`);
        console.log(`  Sample contract: ${contractsResponse.data.results[0].ticker}`);
      }

      // Test snapshot endpoint
      console.log('\nTesting /snapshot/options endpoint...');
      const snapshotResponse = await axios.get(`${baseURL}/snapshot/options/IBIT`, {
        params: {
          apiKey: apiKey,
          expiration_date: '2025-11-21'
        }
      });

      console.log(`✓ Snapshot API response:`);
      console.log(`  Results count: ${snapshotResponse.data.results?.length || 0}`);
      console.log(`  Status: ${snapshotResponse.data.status}`);

      if (snapshotResponse.data.results && snapshotResponse.data.results.length > 0) {
        const sample = snapshotResponse.data.results[0];
        console.log(`  Sample data structure:`);
        console.log(`    Has Greeks: ${!!sample.greeks}`);
        console.log(`    Has IV: ${!!sample.implied_volatility}`);
        console.log(`    Has OI: ${!!sample.open_interest}`);
        console.log(`    Has Day data: ${!!sample.day}`);
      }

    } catch (err) {
      console.log(`❌ API test failed: ${err.message}`);
      if (err.response) {
        console.log(`  Status: ${err.response.status}`);
        console.log(`  Data: ${JSON.stringify(err.response.data)}`);
      }
    }

    console.log('\n' + '='.repeat(80) + '\n');
    console.log('DIAGNOSIS COMPLETE\n');

  } catch (error) {
    console.error('Diagnosis failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

diagnoseData();
