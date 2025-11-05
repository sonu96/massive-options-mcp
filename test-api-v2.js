import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const API_KEY = process.env.MASSIVE_API_KEY;
const BASE_URL = process.env.MASSIVE_API_BASE_URL || 'https://api.massive.com/v3';

console.log('Testing Massive.com API connection (v3)...');
console.log('API Key:', API_KEY ? `${API_KEY.substring(0, 10)}...` : 'NOT SET');
console.log('Base URL:', BASE_URL);

async function testConnection() {
  try {
    // Test authentication methods
    console.log('\n1. Testing with query parameter authentication...');
    try {
      const response = await axios.get(`${BASE_URL}/stocks/AAPL?apiKey=${API_KEY}`);
      console.log('✓ Query param auth successful!');
      console.log('Response:', JSON.stringify(response.data, null, 2).substring(0, 200) + '...');
    } catch (error) {
      console.log(`✗ Query param auth failed: ${error.response?.status} - ${error.message}`);
      if (error.response?.data) {
        console.log('Error:', JSON.stringify(error.response.data, null, 2));
      }
    }

    console.log('\n2. Testing with Bearer token authentication...');
    try {
      const response = await axios({
        method: 'GET',
        url: `${BASE_URL}/stocks/AAPL`,
        headers: {
          'Authorization': `Bearer ${API_KEY}`
        }
      });
      console.log('✓ Bearer token auth successful!');
      console.log('Response:', JSON.stringify(response.data, null, 2).substring(0, 200) + '...');
    } catch (error) {
      console.log(`✗ Bearer token auth failed: ${error.response?.status} - ${error.message}`);
      if (error.response?.data) {
        console.log('Error:', JSON.stringify(error.response.data, null, 2));
      }
    }

    // Test options endpoints
    console.log('\n3. Testing options endpoints...');
    
    // Try different possible option endpoint patterns
    const optionEndpoints = [
      `/options/AAPL`,
      `/options?symbol=AAPL`,
      `/options/chain/AAPL`,
      `/options/contracts/AAPL`,
      `/options/AAPL/2025-01-17`,
      `/options/AAPL/chains`
    ];

    for (const endpoint of optionEndpoints) {
      console.log(`\nTrying: ${endpoint}`);
      try {
        const response = await axios({
          method: 'GET',
          url: `${BASE_URL}${endpoint}`,
          headers: {
            'Authorization': `Bearer ${API_KEY}`
          },
          timeout: 10000
        });
        console.log(`✓ Success! Status: ${response.status}`);
        console.log('Sample data:', JSON.stringify(response.data, null, 2).substring(0, 300) + '...');
        break; // Stop on first success
      } catch (error) {
        console.log(`✗ Failed: ${error.response?.status || error.code}`);
        if (error.response?.status === 401) {
          console.log('Authentication error - check API key');
        }
      }
    }

    // Test a specific option quote if we know the format
    console.log('\n4. Testing specific option quote...');
    const quoteEndpoints = [
      `/options/AAPL/quote?type=call&strike=150&expiration=2025-01-17`,
      `/options/quote/AAPL?type=call&strike=150&expiration=2025-01-17`,
      `/options/AAPL/2025-01-17/150/call`
    ];

    for (const endpoint of quoteEndpoints) {
      console.log(`\nTrying: ${endpoint}`);
      try {
        const response = await axios({
          method: 'GET',
          url: `${BASE_URL}${endpoint}`,
          headers: {
            'Authorization': `Bearer ${API_KEY}`
          }
        });
        console.log(`✓ Success! Status: ${response.status}`);
        console.log('Quote data:', JSON.stringify(response.data, null, 2).substring(0, 300) + '...');
        break;
      } catch (error) {
        console.log(`✗ Failed: ${error.response?.status || error.code}`);
      }
    }

  } catch (error) {
    console.error('Unexpected error:', error);
  }
}

testConnection();