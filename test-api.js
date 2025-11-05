import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const API_KEY = process.env.MASSIVE_API_KEY;
const BASE_URL = process.env.MASSIVE_API_BASE_URL || 'https://api.massive.com/rest';

console.log('Testing Massive.com API connection...');
console.log('API Key:', API_KEY ? `${API_KEY.substring(0, 10)}...` : 'NOT SET');
console.log('Base URL:', BASE_URL);

async function testConnection() {
  try {
    // Try different possible endpoints
    const endpoints = [
      '/options/chain',
      '/options/quote',
      '/options',
      '/health',
      '/status',
      '/'
    ];

    for (const endpoint of endpoints) {
      console.log(`\nTesting endpoint: ${endpoint}`);
      try {
        const response = await axios({
          method: 'GET',
          url: `${BASE_URL}${endpoint}`,
          headers: {
            'Authorization': `Bearer ${API_KEY}`,
            'Content-Type': 'application/json'
          },
          timeout: 5000
        });
        console.log(`✓ Success! Status: ${response.status}`);
        console.log('Response headers:', response.headers);
        if (response.data) {
          console.log('Response data:', JSON.stringify(response.data, null, 2).substring(0, 500));
        }
      } catch (error) {
        console.log(`✗ Failed: ${error.response?.status || error.code} - ${error.response?.statusText || error.message}`);
        if (error.response?.data) {
          console.log('Error response:', JSON.stringify(error.response.data, null, 2));
        }
      }
    }

    // Test with a specific symbol
    console.log('\n\nTesting with AAPL symbol...');
    const symbolEndpoints = [
      '/options/chain?symbol=AAPL',
      '/options/quote?symbol=AAPL&optionType=call&strike=150&expiration=2025-01-17',
      '/options?symbol=AAPL'
    ];

    for (const endpoint of symbolEndpoints) {
      console.log(`\nTesting: ${endpoint}`);
      try {
        const response = await axios({
          method: 'GET',
          url: `${BASE_URL}${endpoint}`,
          headers: {
            'Authorization': `Bearer ${API_KEY}`,
            'Content-Type': 'application/json'
          },
          timeout: 5000
        });
        console.log(`✓ Success! Status: ${response.status}`);
        if (response.data) {
          console.log('Response preview:', JSON.stringify(response.data, null, 2).substring(0, 300) + '...');
        }
      } catch (error) {
        console.log(`✗ Failed: ${error.response?.status || error.code}`);
        if (error.response?.data) {
          console.log('Error:', JSON.stringify(error.response.data, null, 2));
        }
      }
    }

  } catch (error) {
    console.error('Unexpected error:', error);
  }
}

testConnection();