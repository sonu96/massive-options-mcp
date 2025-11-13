#!/usr/bin/env node

/**
 * Real-Time Stock Price Example
 *
 * Shows how to get current stock price with timestamps for ORCL or any ticker
 */

import { MassiveOptionsClient } from '../src/massive-client.js';
import dotenv from 'dotenv';

dotenv.config();

const client = new MassiveOptionsClient(
  process.env.MASSIVE_API_KEY,
  process.env.MASSIVE_API_BASE_URL
);

/**
 * Get real-time stock price with full details
 */
async function getRealTimeStockPrice(symbol) {
  try {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📊 Real-Time Stock Data: ${symbol}`);
    console.log(`${'='.repeat(60)}\n`);

    // Method 1: Get current quote (fastest)
    console.log('Fetching current quote...');
    const fetchStart = Date.now();
    const quote = await client.getStockQuote(symbol);
    const fetchTime = Date.now() - fetchStart;

    console.log(`✅ Fetched in ${fetchTime}ms\n`);

    // Display timestamp information
    console.log('⏰ TIMESTAMP INFORMATION:');
    console.log('  Fetch timestamp:', quote.timestamp || new Date().toISOString());
    console.log('  Data timestamp:', quote.data_timestamp || quote.quote?.last_updated || 'N/A');

    if (quote.data_timestamp) {
      const dataAge = (Date.now() - new Date(quote.data_timestamp).getTime()) / 1000;
      const freshness = dataAge < 60 ? '🟢 FRESH'
        : dataAge < 300 ? '🟡 RECENT'
        : dataAge < 900 ? '🟠 STALE'
        : '🔴 OLD';
      console.log('  Data age:', dataAge.toFixed(1), 'seconds');
      console.log('  Freshness:', freshness);
    }

    // Display price information
    console.log('\n💰 PRICE INFORMATION:');
    console.log('  Current Price: $' + (quote.price || quote.quote?.last || 'N/A'));
    console.log('  Change:', (quote.session?.change || 0).toFixed(2));
    console.log('  Change %:', (quote.session?.change_percent || 0).toFixed(2) + '%');
    console.log('  Open: $' + (quote.session?.open || quote.quote?.open || 'N/A'));
    console.log('  High: $' + (quote.session?.high || quote.quote?.high || 'N/A'));
    console.log('  Low: $' + (quote.session?.low || quote.quote?.low || 'N/A'));
    console.log('  Volume:', (quote.session?.volume || quote.quote?.volume || 0).toLocaleString());
    console.log('  VWAP: $' + (quote.quote?.vwap || 'N/A'));
    console.log('  Market Status:', quote.market_status || 'Unknown');

    return quote;
  } catch (error) {
    console.error('❌ Error fetching stock price:', error.message);
    throw error;
  }
}

/**
 * Get intraday price movement
 */
async function getIntradayMovement(symbol, interval = 5) {
  try {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📈 Intraday Movement: ${symbol} (${interval}-minute bars)`);
    console.log(`${'='.repeat(60)}\n`);

    const fetchStart = Date.now();
    const bars = await client.getIntradayBars(symbol, interval, 'minute');
    const fetchTime = Date.now() - fetchStart;

    console.log(`✅ Fetched ${bars.length} bars in ${fetchTime}ms\n`);

    if (bars.length === 0) {
      console.log('⚠️ No intraday data available (market may be closed)');
      return;
    }

    // Get latest bar
    const latestBar = bars[bars.length - 1];
    const barTime = new Date(latestBar.bar_timestamp);
    const now = new Date();
    const barAge = (now - barTime) / 1000;

    console.log('⏰ LATEST BAR:');
    console.log('  Bar time:', latestBar.bar_timestamp);
    console.log('  Fetch time:', latestBar.fetch_timestamp);
    console.log('  Bar age:', barAge.toFixed(1), 'seconds');
    console.log('  Status:', barAge < 60 ? '🔴 FORMING' : '✅ COMPLETE');

    console.log('\n💰 LATEST PRICES:');
    console.log('  Open: $' + latestBar.o.toFixed(2));
    console.log('  High: $' + latestBar.h.toFixed(2));
    console.log('  Low: $' + latestBar.l.toFixed(2));
    console.log('  Close: $' + latestBar.c.toFixed(2));
    console.log('  Volume:', latestBar.v.toLocaleString());
    console.log('  VWAP: $' + (latestBar.vw || 0).toFixed(2));

    // Calculate intraday range
    const firstBar = bars[0];
    const dayOpen = firstBar.o;
    const dayHigh = Math.max(...bars.map(b => b.h));
    const dayLow = Math.min(...bars.map(b => b.l));
    const currentPrice = latestBar.c;
    const range = ((dayHigh - dayLow) / dayOpen * 100).toFixed(2);

    console.log('\n📊 INTRADAY STATISTICS:');
    console.log('  Day Open: $' + dayOpen.toFixed(2));
    console.log('  Day High: $' + dayHigh.toFixed(2));
    console.log('  Day Low: $' + dayLow.toFixed(2));
    console.log('  Current: $' + currentPrice.toFixed(2));
    console.log('  Range:', range + '%');

    // Calculate VWAP
    const totalPV = bars.reduce((sum, bar) => {
      const typicalPrice = (bar.h + bar.l + bar.c) / 3;
      return sum + (typicalPrice * bar.v);
    }, 0);
    const totalVolume = bars.reduce((sum, bar) => sum + bar.v, 0);
    const vwap = totalVolume > 0 ? totalPV / totalVolume : 0;
    const vwapDistance = ((currentPrice - vwap) / vwap * 100).toFixed(2);

    console.log('  VWAP: $' + vwap.toFixed(2));
    console.log('  Distance from VWAP:', vwapDistance + '%');
    console.log('  Position:', vwapDistance > 0 ? '📈 Above VWAP' : '📉 Below VWAP');

    // Show last few bars
    console.log('\n📋 RECENT BARS (Last 5):');
    const recentBars = bars.slice(-5);
    recentBars.forEach(bar => {
      const time = new Date(bar.bar_timestamp).toLocaleTimeString();
      const direction = bar.c > bar.o ? '🟢' : bar.c < bar.o ? '🔴' : '⚪';
      console.log(`  ${time} ${direction} O:$${bar.o.toFixed(2)} H:$${bar.h.toFixed(2)} L:$${bar.l.toFixed(2)} C:$${bar.c.toFixed(2)} V:${bar.v.toLocaleString()}`);
    });

    return bars;
  } catch (error) {
    console.error('❌ Error fetching intraday data:', error.message);
  }
}

/**
 * Monitor stock price in real-time
 */
async function monitorRealTime(symbol, intervalSeconds = 60) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🔄 Real-Time Monitoring: ${symbol} (every ${intervalSeconds}s)`);
  console.log(`${'='.repeat(60)}`);
  console.log('Press Ctrl+C to stop\n');

  let previousPrice = null;

  const checkPrice = async () => {
    try {
      const quote = await client.getStockQuote(symbol);
      const currentPrice = quote.price || quote.quote?.last;
      const timestamp = new Date().toISOString();

      if (currentPrice) {
        const change = previousPrice ? currentPrice - previousPrice : 0;
        const changeSymbol = change > 0 ? '📈' : change < 0 ? '📉' : '➡️';
        const changeStr = change !== 0 ? ` (${change > 0 ? '+' : ''}${change.toFixed(2)})` : '';

        console.log(`[${timestamp}] ${changeSymbol} ${symbol}: $${currentPrice.toFixed(2)}${changeStr}`);

        if (quote.data_timestamp) {
          const dataAge = (Date.now() - new Date(quote.data_timestamp).getTime()) / 1000;
          if (dataAge > 60) {
            console.log(`  ⚠️ Warning: Data is ${dataAge.toFixed(0)}s old`);
          }
        }

        previousPrice = currentPrice;
      }
    } catch (error) {
      console.error(`[${new Date().toISOString()}] ❌ Error:`, error.message);
    }
  };

  // Initial check
  await checkPrice();

  // Set up interval
  const intervalId = setInterval(checkPrice, intervalSeconds * 1000);

  // Handle Ctrl+C
  process.on('SIGINT', () => {
    console.log('\n\n👋 Stopping monitor...');
    clearInterval(intervalId);
    process.exit(0);
  });
}

// Main execution
(async () => {
  try {
    // Get command line arguments
    const args = process.argv.slice(2);
    const symbol = args[0] || 'ORCL';
    const command = args[1] || 'quote';

    switch (command) {
      case 'quote':
        // Get current quote
        await getRealTimeStockPrice(symbol);
        break;

      case 'intraday':
        // Get intraday movement
        const interval = parseInt(args[2]) || 5;
        await getIntradayMovement(symbol, interval);
        break;

      case 'monitor':
        // Real-time monitoring
        const monitorInterval = parseInt(args[2]) || 60;
        await monitorRealTime(symbol, monitorInterval);
        break;

      case 'all':
        // Show everything
        await getRealTimeStockPrice(symbol);
        await getIntradayMovement(symbol);
        break;

      default:
        console.log('Usage:');
        console.log('  node realtime-stock-price.js <SYMBOL> [COMMAND] [OPTIONS]');
        console.log('');
        console.log('Commands:');
        console.log('  quote              - Get current quote (default)');
        console.log('  intraday [MIN]     - Get intraday bars (default 5-min)');
        console.log('  monitor [SEC]      - Monitor in real-time (default 60s)');
        console.log('  all                - Show quote + intraday');
        console.log('');
        console.log('Examples:');
        console.log('  node realtime-stock-price.js ORCL');
        console.log('  node realtime-stock-price.js ORCL intraday 1');
        console.log('  node realtime-stock-price.js ORCL monitor 30');
        console.log('  node realtime-stock-price.js AAPL all');
    }
  } catch (error) {
    console.error('Fatal error:', error.message);
    process.exit(1);
  }
})();
