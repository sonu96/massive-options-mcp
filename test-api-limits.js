#!/usr/bin/env node

// Test different API approaches
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const apiKey = process.env.MASSIVE_API_KEY;
const baseURL = 'https://api.massive.com/v3';

async function testAPIs() {
  console.log('Testing different API approaches...\n');

  // Test 1: Snapshot without limit
  console.log('Test 1: Snapshot endpoint without limit parameter');
  try {
    const response = await axios.get(`${baseURL}/snapshot/options/IBIT`, {
      params: {
        apiKey: apiKey,
        expiration_date: '2025-11-21'
      }
    });
    console.log(`✓ Success: ${response.data.results?.length} results`);
  } catch (err) {
    console.log(`✗ Failed: ${err.response?.status} - ${err.message}`);
  }

  // Test 2: Snapshot WITH limit
  console.log('\nTest 2: Snapshot endpoint WITH limit=1000');
  try {
    const response = await axios.get(`${baseURL}/snapshot/options/IBIT`, {
      params: {
        apiKey: apiKey,
        expiration_date: '2025-11-21',
        limit: 1000
      }
    });
    console.log(`✓ Success: ${response.data.results?.length} results`);
  } catch (err) {
    console.log(`✗ Failed: ${err.response?.status} - ${err.message}`);
    if (err.response?.data) {
      console.log(`  Error data: ${JSON.stringify(err.response.data)}`);
    }
  }

  // Test 3: Contracts endpoint
  console.log('\nTest 3: Contracts endpoint with limit=1000');
  try {
    const response = await axios.get(`${baseURL}/reference/options/contracts`, {
      params: {
        apiKey: apiKey,
        underlying_ticker: 'IBIT',
        expiration_date: '2025-11-21',
        limit: 1000
      }
    });
    console.log(`✓ Success: ${response.data.results?.length} contracts`);

    // Now get snapshot for these specific contracts
    if (response.data.results && response.data.results.length > 0) {
      const sampleTicker = response.data.results[0].ticker;
      console.log(`  Sample ticker: ${sampleTicker}`);

      // Try getting quote for this ticker
      console.log(`\n  Testing quote for ${sampleTicker}...`);
      try {
        const quoteResp = await axios.get(`${baseURL}/quotes/${sampleTicker}`, {
          params: { apiKey: apiKey }
        });
        console.log(`  ✓ Quote retrieved`);
      } catch (quoteErr) {
        console.log(`  ✗ Quote failed: ${quoteErr.message}`);
      }
    }
  } catch (err) {
    console.log(`✗ Failed: ${err.response?.status} - ${err.message}`);
  }

  // Test 4: Multiple snapshot calls (pagination)
  console.log('\nTest 4: Can we paginate snapshot results?');
  try {
    // Try with offset/cursor if supported
    const response = await axios.get(`${baseURL}/snapshot/options/IBIT`, {
      params: {
        apiKey: apiKey,
        expiration_date: '2025-11-21',
        limit: 100,
        offset: 0
      }
    });
    console.log(`✓ With offset: ${response.data.results?.length} results`);
    console.log(`  Response has next_url: ${!!response.data.next_url}`);
  } catch (err) {
    console.log(`✗ Failed: ${err.response?.status} - ${err.message}`);
  }

  // Test 5: All options for IBIT (no expiration filter)
  console.log('\nTest 5: All IBIT options (no expiration filter)');
  try {
    const response = await axios.get(`${baseURL}/snapshot/options/IBIT`, {
      params: {
        apiKey: apiKey
      }
    });
    console.log(`✓ Success: ${response.data.results?.length} results`);

    if (response.data.results) {
      const expirations = [...new Set(response.data.results.map(r => r.details?.expiration_date))];
      console.log(`  Unique expirations: ${expirations.length}`);
      console.log(`  First 5: ${expirations.slice(0, 5).join(', ')}`);
    }
  } catch (err) {
    console.log(`✗ Failed: ${err.response?.status} - ${err.message}`);
  }
}

testAPIs();
