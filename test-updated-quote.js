import { MassiveOptionsClient } from './src/massive-client.js';
import dotenv from 'dotenv';

dotenv.config();

async function testUpdatedQuote() {
  const client = new MassiveOptionsClient(process.env.MASSIVE_API_KEY, process.env.MASSIVE_API_BASE_URL);
  
  console.log('Testing updated getQuote method for IBIT $70 call expiring 2026-01-16...\n');
  
  try {
    const quote = await client.getQuote('IBIT', 'call', 70, '2026-01-16');
    console.log('Quote data received:');
    console.log(JSON.stringify(quote, null, 2));
    
    console.log('\n\nTesting getGreeks method...\n');
    const greeks = await client.getGreeks('IBIT', 'call', 70, '2026-01-16');
    console.log('Greeks data:');
    console.log(JSON.stringify(greeks, null, 2));
    
    console.log('\n\nTesting getImpliedVolatility method...\n');
    const iv = await client.getImpliedVolatility('IBIT', 'call', 70, '2026-01-16');
    console.log('Implied Volatility data:');
    console.log(JSON.stringify(iv, null, 2));
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

testUpdatedQuote();