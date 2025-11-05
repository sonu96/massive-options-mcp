import { MassiveOptionsClient } from './src/massive-client.js';
import dotenv from 'dotenv';

dotenv.config();

async function testOptionChainSnapshot() {
  const client = new MassiveOptionsClient(process.env.MASSIVE_API_KEY, process.env.MASSIVE_API_BASE_URL);
  
  console.log('Testing option chain snapshot for IBIT...\n');
  
  try {
    // Test 1: Get full snapshot
    console.log('=== TEST 1: Full Option Chain Snapshot ===');
    const fullSnapshot = await client.getOptionChainSnapshot('IBIT');
    
    console.log('Underlying:');
    console.log(`  Symbol: ${fullSnapshot.underlying.symbol}`);
    console.log(`  Price: $${fullSnapshot.underlying.price || 'N/A'}`);
    console.log(`  Change: $${fullSnapshot.underlying.change || 'N/A'}`);
    
    console.log(`\nTotal Contracts: ${fullSnapshot.total_contracts}`);
    console.log(`Available Expirations: ${fullSnapshot.expirations.slice(0, 5).join(', ')}...`);
    
    console.log('\nMarket Summary:');
    console.log(`  Total Call Volume: ${fullSnapshot.summary.total_call_volume}`);
    console.log(`  Total Put Volume: ${fullSnapshot.summary.total_put_volume}`);
    console.log(`  Put/Call Ratio: ${fullSnapshot.summary.put_call_ratio.toFixed(2)}`);
    console.log(`  Total Call OI: ${fullSnapshot.summary.total_call_oi}`);
    console.log(`  Total Put OI: ${fullSnapshot.summary.total_put_oi}`);
    
    // Show sample data from first expiration
    const firstExp = fullSnapshot.expirations[0];
    if (firstExp && fullSnapshot.data[firstExp]) {
      console.log(`\nSample data for ${firstExp}:`);
      const calls = fullSnapshot.data[firstExp].calls.slice(0, 3);
      console.log('  Calls:');
      calls.forEach(call => {
        console.log(`    Strike $${call.strike}: $${call.price.last} (IV: ${(call.implied_volatility * 100).toFixed(1)}%, Vol: ${call.price.volume})`);
      });
    }
    
    // Test 2: Filtered snapshot
    console.log('\n\n=== TEST 2: Filtered Snapshot (Strike Range) ===');
    const filteredSnapshot = await client.getOptionChainSnapshot('IBIT', null, 50, 70);
    console.log(`Contracts in $50-$70 range: ${filteredSnapshot.total_contracts}`);
    
    // Test 3: Single expiration snapshot
    console.log('\n=== TEST 3: Single Expiration Snapshot ===');
    const singleExpSnapshot = await client.getOptionChainSnapshot('IBIT', '2025-11-21');
    console.log(`Contracts for 2025-11-21: ${singleExpSnapshot.total_contracts}`);
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

testOptionChainSnapshot();