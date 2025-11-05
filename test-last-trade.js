import { MassiveOptionsClient } from './src/massive-client.js';
import dotenv from 'dotenv';

dotenv.config();

async function testLastTrade() {
  const client = new MassiveOptionsClient(process.env.MASSIVE_API_KEY, process.env.MASSIVE_API_BASE_URL);
  
  console.log('Testing last trade endpoint for IBIT $70 call expiring 2026-01-16...\n');
  
  try {
    // Test with known option
    const lastTrade = await client.getLastTrade('IBIT', 'call', 70, '2026-01-16');
    
    console.log('=== LAST TRADE DATA ===');
    console.log(`Ticker: ${lastTrade.ticker}`);
    console.log(`Underlying: ${lastTrade.underlying}`);
    console.log(`Contract Type: ${lastTrade.contract_type}`);
    console.log(`Strike: $${lastTrade.strike}`);
    console.log(`Expiration: ${lastTrade.expiration}`);
    
    console.log('\n=== TRADE DETAILS ===');
    console.log(`Price: $${lastTrade.trade.price}`);
    console.log(`Size: ${lastTrade.trade.size} contracts`);
    console.log(`Exchange: ${lastTrade.trade.exchange}`);
    console.log(`Conditions: ${lastTrade.trade.conditions.join(', ') || 'None'}`);
    console.log(`Timestamp: ${lastTrade.trade.timestamp}`);
    console.log(`Status: ${lastTrade.status}`);
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

testLastTrade();