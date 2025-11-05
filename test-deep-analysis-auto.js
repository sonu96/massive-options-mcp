#!/usr/bin/env node

// Test script for deep_options_analysis tool with auto-detection
import { MassiveOptionsClient } from './src/massive-client.js';
import dotenv from 'dotenv';

dotenv.config();

const client = new MassiveOptionsClient(
  process.env.MASSIVE_API_KEY,
  process.env.MASSIVE_API_BASE_URL
);

async function testDeepAnalysisAuto() {
  try {
    console.log('Starting Deep Options Analysis for SPY (Auto Mode)...\n');

    const params = {
      symbol: 'SPY',  // Using SPY which has more liquid options
      // No target_expirations - let it auto-detect
      // No strikes_to_analyze - let it auto-detect
      account_size: 10000,
      mode: 'auto',  // Full auto mode
      strategies: ['bull_call_spread', 'bear_put_spread', 'iron_condor'],
      risk_config: {
        max_risk_pct: 0.03,          // 3% risk per trade
        min_reward_ratio: 1.5,        // Minimum 1.5:1 reward:risk (more lenient)
        min_prob_profit: 0.4,         // Minimum 40% probability (more lenient)
        max_concentration: 0.30       // Max 30% per position
      }
    };

    console.log('Analysis Parameters:');
    console.log(JSON.stringify(params, null, 2));
    console.log('\n' + '='.repeat(80) + '\n');

    const result = await client.deepOptionsAnalysis(params);

    // Display Executive Summary
    console.log('EXECUTIVE SUMMARY');
    console.log('='.repeat(80));
    console.log(`Symbol: ${result.symbol}`);
    console.log(`Current Price: $${result.snapshot.underlying_price}`);
    console.log(`Available Expirations: ${result.snapshot.expirations_available.join(', ')}`);
    console.log(`Account Size: $${result.account_size}`);
    console.log(`\nAnalysis Results:`);
    console.log(`  - Strategies Analyzed: ${result.executive_summary.total_strategies_analyzed}`);
    console.log(`  - Strategies Recommended: ${result.executive_summary.strategies_recommended}`);
    console.log(`  - Unusual Activity Detected: ${result.executive_summary.unusual_activity_detected}`);

    if (result.executive_summary.strategies_recommended > 0) {
      console.log(`\nPortfolio Metrics:`);
      console.log(`  - Total Capital Required: $${result.executive_summary.total_capital_required.toFixed(2)}`);
      console.log(`  - Total Risk: $${result.executive_summary.total_risk.toFixed(2)}`);
      console.log(`  - Potential Profit: $${result.executive_summary.potential_profit.toFixed(2)}`);
      console.log(`  - Portfolio Reward:Risk: ${result.executive_summary.portfolio_reward_ratio.toFixed(2)}:1`);
    }

    console.log(`\nKey Levels:`);
    console.log(`  - Support: ${result.executive_summary.key_support_levels.join(', ') || 'None detected'}`);
    console.log(`  - Resistance: ${result.executive_summary.key_resistance_levels.join(', ') || 'None detected'}`);
    console.log('\n' + '='.repeat(80) + '\n');

    // Display Top Unusual Activity
    if (result.unusual_activity.length > 0) {
      console.log('TOP UNUSUAL ACTIVITY');
      console.log('='.repeat(80));
      result.unusual_activity.slice(0, 10).forEach((activity, i) => {
        console.log(`${i + 1}. ${activity.type.toUpperCase()} $${activity.strike} (${activity.expiration})`);
        console.log(`   Volume: ${activity.volume} | OI: ${activity.open_interest} | V/OI: ${activity.volume_oi_ratio}`);
        console.log(`   Price: $${activity.last_price} | Score: ${activity.unusual_score}`);
      });
      console.log('\n' + '='.repeat(80) + '\n');
    }

    // Display Institutional Magnets
    if (result.institutional_magnets.length > 0) {
      console.log('INSTITUTIONAL MAGNET LEVELS');
      console.log('='.repeat(80));
      const supports = result.institutional_magnets.filter(m => m.type === 'support').slice(0, 5);
      const resistances = result.institutional_magnets.filter(m => m.type === 'resistance').slice(0, 5);

      if (supports.length > 0) {
        console.log('Support Levels:');
        supports.forEach((s, i) => {
          console.log(`  ${i + 1}. $${s.strike} - OI: ${s.open_interest} (${s.strength.toFixed(1)}% of total)`);
        });
      }

      if (resistances.length > 0) {
        console.log('\nResistance Levels:');
        resistances.forEach((r, i) => {
          console.log(`  ${i + 1}. $${r.strike} - OI: ${r.open_interest} (${r.strength.toFixed(1)}% of total)`);
        });
      }
      console.log('\n' + '='.repeat(80) + '\n');
    }

    // Display Top Recommended Strategies
    if (result.recommended_strategies.length > 0) {
      console.log('TOP RECOMMENDED STRATEGIES');
      console.log('='.repeat(80));
      result.recommended_strategies.slice(0, 3).forEach((strategy, i) => {
        console.log(`${i + 1}. ${strategy.strategy_name}`);
        console.log(`   Type: ${strategy.type} | Expiration: ${strategy.expiration} | Score: ${strategy.score}`);
        console.log(`\n   Position Sizing:`);
        console.log(`     Contracts: ${strategy.position_sizing.recommended_contracts}`);
        console.log(`     Total Cost: $${strategy.position_sizing.total_cost.toFixed(2)}`);
        console.log(`     Total Risk: $${strategy.position_sizing.total_risk.toFixed(2)} (${strategy.position_sizing.risk_pct}%)`);
        console.log(`     Potential Profit: $${strategy.position_sizing.potential_profit.toFixed(2)}`);
        console.log(`     Risk/Reward: ${strategy.risk_reward.toFixed(2)}:1`);
        console.log(`\n   Recommendation: ${strategy.pnl_analysis.summary.recommendation}`);
        console.log('\n' + '-'.repeat(80));
      });
      console.log('\n' + '='.repeat(80) + '\n');
    } else {
      console.log('No strategies met the criteria. Try adjusting risk_config parameters.\n');
    }

    // Save full result to file
    const fs = await import('fs');
    fs.writeFileSync(
      './deep-analysis-auto-result.json',
      JSON.stringify(result, null, 2)
    );
    console.log('Full analysis saved to: deep-analysis-auto-result.json\n');

  } catch (error) {
    console.error('Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

testDeepAnalysisAuto();
