import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const API_KEY = process.env.MASSIVE_API_KEY;
const BASE_URL = 'https://api.massive.com/v3';

async function testOptionQuotes() {
  console.log('Testing option quote endpoints for IBIT...\n');
  
  try {
    // First, get the option contract for IBIT $70 call expiring 2026-01-16
    console.log('1. Getting option contract ticker...');
    const contractResponse = await axios.get(`${BASE_URL}/reference/options/contracts`, {
      params: {
        apiKey: API_KEY,
        underlying_ticker: 'IBIT',
        contract_type: 'call',
        strike_price: 70,
        expiration_date: '2026-01-16',
        limit: 1
      }
    });
    
    if (!contractResponse.data.results || contractResponse.data.results.length === 0) {
      console.log('No contract found!');
      return;
    }
    
    const contract = contractResponse.data.results[0];
    const ticker = contract.ticker;
    console.log('Found contract:', ticker);
    console.log('Contract details:', JSON.stringify(contract, null, 2));
    
    // Now test various quote endpoints
    console.log('\n2. Testing quote endpoints...\n');
    
    const quoteEndpoints = [
      // Polygon.io style endpoints
      `/v2/snapshot/options/contracts/${ticker}`,
      `/v2/aggs/ticker/${ticker}/prev`,
      `/v1/last/options/contracts/${ticker}`,
      `/v2/last/trade/options/${ticker}`,
      `/v3/quotes/${ticker}`,
      `/v3/trades/${ticker}`,
      // Direct ticker endpoints
      `/${ticker}`,
      `/tickers/${ticker}`,
      `/options/contracts/${ticker}`,
      `/reference/options/contracts/${ticker}`
    ];
    
    for (const endpoint of quoteEndpoints) {
      console.log(`Testing: ${endpoint}`);
      try {
        const response = await axios.get(`${BASE_URL}${endpoint}`, {
          params: { apiKey: API_KEY },
          timeout: 5000
        });
        console.log('✓ Success! Status:', response.status);
        console.log('Response:', JSON.stringify(response.data, null, 2).substring(0, 400));
        console.log('---\n');
      } catch (error) {
        console.log(`✗ Failed: ${error.response?.status || error.code} - ${error.message}`);
        if (error.response?.status === 403) {
          console.log('Forbidden - may need additional subscription');
        }
      }
    }
    
  } catch (error) {
    console.error('Error:', error.message);
    if (error.response?.data) {
      console.error('Response:', error.response.data);
    }
  }
}

testOptionQuotes();