#!/usr/bin/env node

// Test script for get_dealer_positioning_matrix tool
import { MassiveOptionsClient } from '../src/massive-client.js';
import dotenv from 'dotenv';

dotenv.config();

const client = new MassiveOptionsClient(
  process.env.MASSIVE_API_KEY,
  process.env.MASSIVE_API_BASE_URL
);

async function testDealerPositioning() {
  try {
    console.log('Starting Dealer Positioning Analysis for IBIT...\n');
    console.log('Replicating HeatSeeker functionality\n');
    console.log('=' .repeat(80) + '\n');

    const params = {
      symbol: 'IBIT',
      expirations: ['2025-11-07', '2025-11-14', '2025-11-21', '2025-11-28'],
      strike_range: {
        min: 49,
        max: 63
      },
      include_vex: false,
      format: 'matrix'
    };

    console.log('Analysis Parameters:');
    console.log(JSON.stringify(params, null, 2));
    console.log('\n' + '='.repeat(80) + '\n');

    const result = await client.getDealerPositioningMatrix(params);

    // Display Summary
    console.log('DEALER POSITIONING SUMMARY');
    console.log('='.repeat(80));
    console.log(`Symbol: ${result.symbol}`);
    console.log(`Current Price: $${result.current_price}`);
    console.log(`Analysis Time: ${result.analysis_time}`);
    console.log(`Expirations Analyzed: ${result.expirations.join(', ')}`);
    console.log(`Strike Range: $${result.strike_range.min} - $${result.strike_range.max} (${result.strike_range.count} strikes)`);
    console.log('\n' + '='.repeat(80) + '\n');

    // Display Key Levels
    console.log('KEY LEVELS (DEALER GAMMA EXPOSURE)');
    console.log('='.repeat(80));

    console.log('\n🎯 MAX POSITIVE GEX (Magnet Level):');
    console.log(`   Strike: $${result.key_levels.max_positive_gex.strike}`);
    console.log(`   Expiration: ${result.key_levels.max_positive_gex.expiration}`);
    console.log(`   GEX Value: $${result.key_levels.max_positive_gex.value.toLocaleString()}`);
    console.log(`   💡 ${result.key_levels.max_positive_gex.interpretation}`);

    console.log('\n⚠️  MAX NEGATIVE GEX (Danger Zone):');
    console.log(`   Strike: $${result.key_levels.max_negative_gex.strike}`);
    console.log(`   Expiration: ${result.key_levels.max_negative_gex.expiration}`);
    console.log(`   GEX Value: $${result.key_levels.max_negative_gex.value.toLocaleString()}`);
    console.log(`   💡 ${result.key_levels.max_negative_gex.interpretation}`);

    console.log('\n📊 Overall Gamma Regime:');
    console.log(`   Zero Gamma Strike: $${result.key_levels.zero_gamma_strike}`);
    console.log(`   Total GEX: $${result.key_levels.total_gex.toLocaleString()}`);
    console.log(`   Regime: ${result.key_levels.regime}`);

    console.log('\n' + '='.repeat(80) + '\n');

    // Display Expiration Summaries
    console.log('EXPIRATION-LEVEL SUMMARIES');
    console.log('='.repeat(80));
    Object.entries(result.expiration_summary).forEach(([exp, summary]) => {
      console.log(`\n${exp}:`);
      console.log(`  Total GEX: $${summary.totalGEX.toLocaleString()}`);
      console.log(`  Call GEX: $${summary.callGEX.toLocaleString()}`);
      console.log(`  Put GEX: $${summary.putGEX.toLocaleString()}`);
      console.log(`  Regime: ${summary.regime}`);
      console.log(`  📝 ${summary.interpretation}`);
    });
    console.log('\n' + '='.repeat(80) + '\n');

    // Display Trading Implications
    console.log('TRADING IMPLICATIONS');
    console.log('='.repeat(80));

    console.log('\n🛡️  Support Levels (High Negative GEX):');
    if (result.trading_implications.support_levels.length > 0) {
      result.trading_implications.support_levels.forEach((level, i) => {
        console.log(`   ${i + 1}. $${level}`);
      });
    } else {
      console.log('   None detected');
    }

    console.log('\n🚧 Resistance Levels (High Positive GEX):');
    if (result.trading_implications.resistance_levels.length > 0) {
      result.trading_implications.resistance_levels.forEach((level, i) => {
        console.log(`   ${i + 1}. $${level}`);
      });
    } else {
      console.log('   None detected');
    }

    console.log('\n🧲 Magnet Levels:');
    if (result.trading_implications.magnet_levels.length > 0) {
      result.trading_implications.magnet_levels.forEach((level, i) => {
        console.log(`   ${i + 1}. $${level}`);
      });
    } else {
      console.log('   None detected');
    }

    if (result.trading_implications.expected_range) {
      console.log('\n📏 Expected Range:');
      console.log(`   Low: $${result.trading_implications.expected_range.low}`);
      console.log(`   Current: $${result.trading_implications.expected_range.current}`);
      console.log(`   High: $${result.trading_implications.expected_range.high}`);
    }

    console.log(`\n⚡ Gamma Squeeze Risk: ${result.trading_implications.gamma_squeeze_risk}`);
    console.log(`📉 Volatility Outlook: ${result.trading_implications.volatility_outlook}`);

    if (result.trading_implications.strategy_recommendations.length > 0) {
      console.log('\n💡 Strategy Recommendations:');
      result.trading_implications.strategy_recommendations.forEach((rec, i) => {
        console.log(`   ${i + 1}. ${rec.type}: ${rec.reason}`);
        console.log(`      Suggested: ${rec.strategies.join(', ')}`);
      });
    }

    console.log('\n' + '='.repeat(80) + '\n');

    // Display Top GEX by Strike
    console.log('TOP 10 STRIKES BY NET GEX (Aggregated Across Expirations)');
    console.log('='.repeat(80));
    result.gex_by_strike.slice(0, 10).forEach((item, i) => {
      const indicator = item.gex > 0 ? '🟢' : '🔴';
      console.log(`${i + 1}. ${indicator} $${item.strike}: ${item.gex >= 0 ? '+' : ''}$${item.gex.toLocaleString()}`);
    });
    console.log('\n' + '='.repeat(80) + '\n');

    // Display GEX Matrix (sample)
    console.log('GEX MATRIX (First 5 expirations x strikes, in millions)');
    console.log('='.repeat(80));
    console.log('Similar to HeatSeeker output:\n');

    const exps = result.expirations.slice(0, 4);
    const strikes = Object.keys(result.gex_matrix[exps[0]] || {})
      .map(s => parseFloat(s))
      .sort((a, b) => b - a)
      .slice(0, 15);

    // Header row
    console.log('Strike'.padEnd(10) + exps.map(e => e.padStart(15)).join(''));
    console.log('-'.repeat(10 + exps.length * 15));

    // Data rows
    strikes.forEach(strike => {
      let row = strike.toString().padEnd(10);
      exps.forEach(exp => {
        const gex = result.gex_matrix[exp]?.[strike] || 0;
        const gexMil = (gex / 1000000).toFixed(1);
        const formattedValue = (gex >= 0 ? '+' : '') + gexMil + 'M';
        row += formattedValue.padStart(15);
      });
      console.log(row);
    });

    console.log('\n' + '='.repeat(80) + '\n');

    // Save full result to file
    const fs = await import('fs');
    fs.writeFileSync(
      './dealer-positioning-result.json',
      JSON.stringify(result, null, 2)
    );
    console.log('Full dealer positioning matrix saved to: dealer-positioning-result.json\n');

    // Display comparison to HeatSeeker
    console.log('✅ HEATSEEKER REPLICATION COMPLETE');
    console.log('='.repeat(80));
    console.log('This tool provides:');
    console.log('  ✓ Dealer GEX matrix across strikes x expirations');
    console.log('  ✓ Key level identification (magnet, danger zones)');
    console.log('  ✓ Support/Resistance from GEX concentrations');
    console.log('  ✓ Gamma regime analysis');
    console.log('  ✓ Trading implications and strategy recommendations');
    console.log('  ✓ Volatility outlook based on dealer positioning');
    console.log('\nUse this data to:');
    console.log('  → Identify where price will be "sticky" (high positive GEX)');
    console.log('  → Find breakout levels (negative GEX zones)');
    console.log('  → Determine if dealers will dampen or amplify moves');
    console.log('  → Select optimal strategies (sell premium vs. directional)');
    console.log('\n');

  } catch (error) {
    console.error('Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

testDealerPositioning();
