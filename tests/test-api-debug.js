import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const API_KEY = process.env.MASSIVE_API_KEY;

console.log('Debug: Testing Massive.com API...');
console.log('API Key:', API_KEY);

async function debugTest() {
  // Test different base URLs
  const baseUrls = [
    'https://api.massive.com',
    'https://api.massive.com/v1',
    'https://api.massive.com/v2', 
    'https://api.massive.com/v3',
    'https://massive.com/api',
    'https://api-v3.massive.com',
    'https://rest.massive.com'
  ];

  for (const baseUrl of baseUrls) {
    console.log(`\nTesting base URL: ${baseUrl}`);
    
    try {
      const response = await axios({
        method: 'GET',
        url: baseUrl,
        headers: {
          'Authorization': `Bearer ${API_KEY}`,
          'X-API-Key': API_KEY,
          'apiKey': API_KEY
        },
        timeout: 5000,
        validateStatus: () => true // Accept any status
      });
      
      console.log(`Response Status: ${response.status}`);
      console.log(`Response Headers:`, response.headers);
      if (response.data) {
        console.log(`Response Data:`, typeof response.data === 'string' 
          ? response.data.substring(0, 200) 
          : JSON.stringify(response.data, null, 2).substring(0, 200));
      }
      
      if (response.status !== 404) {
        console.log('✓ This might be the correct base URL!');
      }
    } catch (error) {
      console.log(`Error: ${error.code} - ${error.message}`);
    }
  }

  // Also try without any path
  console.log('\n\nTrying Massive.com homepage API info...');
  try {
    const response = await axios.get('https://massive.com/api');
    console.log('Homepage response:', response.data.substring(0, 500));
  } catch (error) {
    console.log('Homepage error:', error.message);
  }
}

debugTest();