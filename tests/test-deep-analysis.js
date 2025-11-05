#!/usr/bin/env node

// Test script for deep_options_analysis tool
import { MassiveOptionsClient } from './src/massive-client.js';
import dotenv from 'dotenv';

dotenv.config();

const client = new MassiveOptionsClient(
  process.env.MASSIVE_API_KEY,
  process.env.MASSIVE_API_BASE_URL
);

async function testDeepAnalysis() {
  try {
    console.log('Starting Deep Options Analysis for IBIT...\n');

    const params = {
      symbol: 'IBIT',
      target_expirations: ['2026-01-16', '2026-03-20'],
      strikes_to_analyze: [58, 65, 70, 75, 80],
      account_size: 4000,
      mode: 'both',
      strategies: ['bull_call_spread', 'bear_put_spread'],
      risk_config: {
        max_risk_pct: 0.02,          // 2% risk per trade
        min_reward_ratio: 2.0,        // Minimum 2:1 reward:risk
        min_prob_profit: 0.5,         // Minimum 50% probability
        max_concentration: 0.40       // Max 40% per position
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
    console.log(`Account Size: $${result.account_size}`);
    console.log(`\nAnalysis Results:`);
    console.log(`  - Strategies Analyzed: ${result.executive_summary.total_strategies_analyzed}`);
    console.log(`  - Strategies Recommended: ${result.executive_summary.strategies_recommended}`);
    console.log(`  - Unusual Activity Detected: ${result.executive_summary.unusual_activity_detected}`);
    console.log(`\nPortfolio Metrics:`);
    console.log(`  - Total Capital Required: $${result.executive_summary.total_capital_required.toFixed(2)}`);
    console.log(`  - Total Risk: $${result.executive_summary.total_risk.toFixed(2)}`);
    console.log(`  - Potential Profit: $${result.executive_summary.potential_profit.toFixed(2)}`);
    console.log(`  - Portfolio Reward:Risk: ${result.executive_summary.portfolio_reward_ratio.toFixed(2)}:1`);
    console.log(`\nKey Levels:`);
    console.log(`  - Support: ${result.executive_summary.key_support_levels.join(', ')}`);
    console.log(`  - Resistance: ${result.executive_summary.key_resistance_levels.join(', ')}`);
    console.log('\n' + '='.repeat(80) + '\n');

    // Display Top Unusual Activity
    if (result.unusual_activity.length > 0) {
      console.log('TOP UNUSUAL ACTIVITY');
      console.log('='.repeat(80));
      result.unusual_activity.slice(0, 5).forEach((activity, i) => {
        console.log(`${i + 1}. ${activity.type.toUpperCase()} $${activity.strike} (${activity.expiration})`);
        console.log(`   Volume: ${activity.volume} | OI: ${activity.open_interest} | V/OI: ${activity.volume_oi_ratio}`);
        console.log(`   Score: ${activity.unusual_score}`);
      });
      console.log('\n' + '='.repeat(80) + '\n');
    }

    // Display Top Recommended Strategies
    if (result.recommended_strategies.length > 0) {
      console.log('TOP RECOMMENDED STRATEGIES');
      console.log('='.repeat(80));
      result.recommended_strategies.slice(0, 5).forEach((strategy, i) => {
        console.log(`${i + 1}. ${strategy.strategy_name}`);
        console.log(`   Type: ${strategy.type}`);
        console.log(`   Expiration: ${strategy.expiration}`);
        console.log(`   Score: ${strategy.score}`);
        console.log(`\n   Position Sizing:`);
        console.log(`     - Contracts: ${strategy.position_sizing.recommended_contracts}`);
        console.log(`     - Total Cost: $${strategy.position_sizing.total_cost.toFixed(2)}`);
        console.log(`     - Total Risk: $${strategy.position_sizing.total_risk.toFixed(2)} (${strategy.position_sizing.risk_pct}% of account)`);
        console.log(`     - Potential Profit: $${strategy.position_sizing.potential_profit.toFixed(2)}`);
        console.log(`     - Risk/Reward: ${strategy.risk_reward.toFixed(2)}:1`);
        console.log(`\n   P&L Analysis:`);
        console.log(`     - Breakeven: $${strategy.pnl_analysis.breakeven_analysis.breakevens[0]?.price || 'N/A'}`);
        console.log(`     - Recommendation: ${strategy.pnl_analysis.summary.recommendation}`);
        console.log(`\n   Legs:`);
        strategy.legs.forEach(leg => {
          console.log(`     - ${leg.action.toUpperCase()} ${leg.type} $${leg.strike} @ $${leg.price}`);
        });
        console.log('\n' + '-'.repeat(80));
      });
      console.log('\n' + '='.repeat(80) + '\n');
    }

    // Display Allocation Report
    if (result.allocation_report) {
      console.log('PORTFOLIO ALLOCATION');
      console.log('='.repeat(80));
      console.log(`Total Capital Allocated: $${result.allocation_report.total_capital_allocated.toFixed(2)} (${result.allocation_report.allocation_pct.toFixed(2)}%)`);
      console.log(`Total Risk: $${result.allocation_report.total_risk.toFixed(2)} (${result.allocation_report.risk_pct.toFixed(2)}%)`);
      console.log(`Expected Value: $${result.allocation_report.expected_value.toFixed(2)}`);

      if (result.allocation_report.diversification?.by_strategy_type) {
        console.log(`\nBy Strategy Type:`);
        result.allocation_report.diversification.by_strategy_type.forEach(type => {
          console.log(`  - ${type.type}: ${type.count} positions, $${type.capital.toFixed(2)} (${type.capital_pct.toFixed(1)}%)`);
        });
      }

      if (result.allocation_report.diversification?.by_expiration) {
        console.log(`\nBy Expiration:`);
        result.allocation_report.diversification.by_expiration.forEach(exp => {
          console.log(`  - ${exp.expiration}: ${exp.count} positions, $${exp.capital.toFixed(2)} (${exp.capital_pct.toFixed(1)}%)`);
        });
      }
      console.log('\n' + '='.repeat(80) + '\n');
    }

    // Save full result to file
    const fs = await import('fs');
    fs.writeFileSync(
      './deep-analysis-result.json',
      JSON.stringify(result, null, 2)
    );
    console.log('Full analysis saved to: deep-analysis-result.json\n');

  } catch (error) {
    console.error('Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

testDeepAnalysis();
