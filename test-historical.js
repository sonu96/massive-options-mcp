import { MassiveOptionsClient } from './src/massive-client.js';
import dotenv from 'dotenv';

dotenv.config();

async function testHistoricalEndpoints() {
  const client = new MassiveOptionsClient(process.env.MASSIVE_API_KEY, process.env.MASSIVE_API_BASE_URL);
  
  console.log('Testing historical data endpoints for IBIT $70 call...\n');
  
  try {
    // Test 1: Get previous day OHLC
    console.log('=== TEST 1: Previous Day OHLC ===');
    try {
      const prevDay = await client.getPreviousDayOHLC('IBIT', 'call', 70, '2026-01-16');
      console.log('Previous day data:');
      console.log(JSON.stringify(prevDay, null, 2));
    } catch (error) {
      console.log('Previous day error:', error.message);
    }
    
    // Test 2: Get daily aggregates for past week
    console.log('\n=== TEST 2: Daily Aggregates (Past Week) ===');
    try {
      const aggregates = await client.getHistoricalAggregates(
        'IBIT', 'call', 70, '2026-01-16',
        1, 'day', '2024-10-25', '2024-11-01'
      );
      console.log(`Found ${aggregates.resultsCount} daily bars`);
      if (aggregates.results.length > 0) {
        console.log('First bar:', JSON.stringify(aggregates.results[0], null, 2));
        console.log('Last bar:', JSON.stringify(aggregates.results[aggregates.results.length - 1], null, 2));
      }
    } catch (error) {
      console.log('Aggregates error:', error.message);
    }
    
    // Test 3: Get hourly aggregates for a specific day
    console.log('\n=== TEST 3: Hourly Aggregates ===');
    try {
      const hourly = await client.getHistoricalAggregates(
        'IBIT', 'call', 70, '2026-01-16',
        1, 'hour', '2024-10-31', '2024-10-31'
      );
      console.log(`Found ${hourly.resultsCount} hourly bars`);
    } catch (error) {
      console.log('Hourly error:', error.message);
    }
    
    // Test 4: Get open/close for a specific date
    console.log('\n=== TEST 4: Daily Open/Close ===');
    try {
      const openClose = await client.getDailyOpenClose(
        'IBIT', 'call', 70, '2026-01-16', '2024-10-31'
      );
      console.log('Open/Close data:');
      console.log(JSON.stringify(openClose, null, 2));
    } catch (error) {
      console.log('Open/Close error:', error.message);
    }
    
  } catch (error) {
    console.error('Unexpected error:', error.message);
  }
}

testHistoricalEndpoints();