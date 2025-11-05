import { MassiveOptionsClient } from './src/massive-client.js';
import dotenv from 'dotenv';

dotenv.config();

async function testComprehensiveQuote() {
  const client = new MassiveOptionsClient(process.env.MASSIVE_API_KEY, process.env.MASSIVE_API_BASE_URL);
  
  console.log('Testing comprehensive quote for IBIT $70 call expiring 2026-01-16...\n');
  
  try {
    const quote = await client.getQuote('IBIT', 'call', 70, '2026-01-16');
    
    console.log('=== CONTRACT IDENTIFICATION ===');
    console.log(`Ticker: ${quote.ticker}`);
    console.log(`Underlying: ${quote.underlying_ticker}`);
    console.log(`Type: ${quote.contract_type}`);
    
    console.log('\n=== CONTRACT SPECIFICATIONS ===');
    console.log(`Strike Price: $${quote.strike_price}`);
    console.log(`Expiration: ${quote.expiration_date}`);
    console.log(`Exercise Style: ${quote.exercise_style}`);
    console.log(`Shares per Contract: ${quote.shares_per_contract}`);
    console.log(`Days to Expiration: ${quote.days_to_expiration}`);
    
    console.log('\n=== EXCHANGE INFORMATION ===');
    console.log(`Primary Exchange: ${quote.primary_exchange}`);
    console.log(`CFI Code: ${quote.cfi}`);
    
    console.log('\n=== MARKET DATA ===');
    console.log(`Last Price: $${quote.quote.last}`);
    console.log(`Change: $${quote.quote.change} (${quote.quote.change_percent}%)`);
    console.log(`Volume: ${quote.quote.volume}`);
    console.log(`VWAP: $${quote.quote.vwap}`);
    console.log(`High: $${quote.quote.high}`);
    console.log(`Low: $${quote.quote.low}`);
    console.log(`Open Interest: ${quote.open_interest}`);
    
    console.log('\n=== RISK METRICS (GREEKS) ===');
    console.log(`Delta: ${quote.greeks.delta?.toFixed(4) || 'N/A'}`);
    console.log(`Gamma: ${quote.greeks.gamma?.toFixed(4) || 'N/A'}`);
    console.log(`Theta: ${quote.greeks.theta?.toFixed(4) || 'N/A'}`);
    console.log(`Vega: ${quote.greeks.vega?.toFixed(4) || 'N/A'}`);
    console.log(`Implied Volatility: ${(quote.implied_volatility * 100).toFixed(2)}%`);
    
    console.log('\n=== ANALYSIS ===');
    console.log(`Underlying Price: ${quote.underlying_price ? '$' + quote.underlying_price : 'N/A'}`);
    console.log(`Moneyness: ${quote.moneyness}`);
    console.log(`Last Updated: ${quote.quote.last_updated}`);
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

testComprehensiveQuote();