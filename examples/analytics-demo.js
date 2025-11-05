#!/usr/bin/env node
import { MassiveOptionsClient } from '../src/massive-client.js';
import dotenv from 'dotenv';

dotenv.config();

// Demo script showing how to use the new analytics features
async function demonstrateAnalytics() {
  if (!process.env.MASSIVE_API_KEY) {
    console.error('Please set MASSIVE_API_KEY in your .env file');
    process.exit(1);
  }

  const client = new MassiveOptionsClient(process.env.MASSIVE_API_KEY);
  
  console.log('=== Option Analytics Demo ===\n');
  
  try {
    // Example 1: Basic analytics for a call option
    console.log('Example 1: IBIT $62 Call expiring 2025-11-14');
    console.log('-'.repeat(50));
    
    const analytics1 = await client.getOptionAnalytics(
      'IBIT',     // symbol
      'call',     // type
      62,         // strike
      '2025-11-14' // expiration
    );
    
    console.log(`Underlying Price: $${analytics1.underlying_price}`);
    console.log(`Option Price: $${analytics1.market.last_price}`);
    console.log(`\nValue Breakdown:`);
    console.log(`  Intrinsic Value: $${analytics1.analytics.intrinsicValue}`);
    console.log(`  Time Value: $${analytics1.analytics.timeValue}`);
    console.log(`  Break-even: $${analytics1.analytics.breakeven}`);
    
    console.log(`\nProbability Analysis:`);
    console.log(`  Moneyness: ${analytics1.analytics.moneyness}`);
    console.log(`  Probability ITM: ${(analytics1.analytics.probabilityITM * 100).toFixed(2)}%`);
    console.log(`  Probability OTM: ${(analytics1.analytics.probabilityOTM * 100).toFixed(2)}%`);
    
    console.log(`\nExpected Move (1σ):`);
    console.log(`  Range: $${analytics1.analytics.expectedMove.oneSigmaRange[0]} - $${analytics1.analytics.expectedMove.oneSigmaRange[1]}`);
    console.log(`  Movement: ±${analytics1.analytics.expectedMove.percent.toFixed(2)}% (±$${analytics1.analytics.expectedMove.amount})`);
    
    console.log(`\nRisk Metrics:`);
    console.log(`  Leverage: ${analytics1.analytics.leverage}x`);
    console.log(`  Daily Theta: $${analytics1.analytics.dailyTheta}`);
    console.log(`  Volume/OI Ratio: ${analytics1.analytics.volumeOIRatio}`);
    if (analytics1.analytics.unusualActivity) {
      console.log(`  ⚠️  UNUSUAL ACTIVITY DETECTED`);
    }
    
    console.log('\n' + '='.repeat(50) + '\n');
    
    // Example 2: Analytics with risk/reward for a target price
    console.log('Example 2: SPY $500 Put with $480 target price');
    console.log('-'.repeat(50));
    
    const analytics2 = await client.getOptionAnalytics(
      'SPY',      // symbol
      'put',      // type
      500,        // strike
      '2025-12-19', // expiration
      480         // target price
    );
    
    console.log(`Current Stock Price: $${analytics2.underlying_price}`);
    console.log(`Target Price: $480`);
    console.log(`Option Price: $${analytics2.market.last_price}`);
    
    if (analytics2.risk_reward) {
      console.log(`\nRisk/Reward Analysis:`);
      console.log(`  Max Risk: $${analytics2.risk_reward.maxRisk}`);
      console.log(`  Max Reward: $${analytics2.risk_reward.maxReward}`);
      console.log(`  Profit at Target: $${analytics2.risk_reward.profitAtTarget}`);
      console.log(`  Risk/Reward Ratio: ${analytics2.risk_reward.riskRewardRatio}`);
      console.log(`  Break-even Move: ${analytics2.risk_reward.breakEvenPercent.toFixed(2)}%`);
    }
    
  } catch (error) {
    console.error('Error:', error.message);
    console.error('\nNote: This demo requires a valid MASSIVE_API_KEY and network connection.');
  }
}

// Run the demo
demonstrateAnalytics();