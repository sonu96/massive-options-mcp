import { calculateTimeDecay } from '../src/pnl-calculator.js';
import { calculateScenarioPnL } from '../src/portfolio-greeks.js';

describe('P&L and Greeks Calculation Fixes', () => {
  describe('calculateTimeDecay - Theta Bug Fix', () => {
    test('should use theta values, not delta values', () => {
      const strategy = {
        legs: [
          { action: 'sell', delta: 0.65, theta: -0.05 }, // Short call
          { action: 'buy', delta: 0.45, theta: -0.03 }  // Long call
        ]
      };

      const result = calculateTimeDecay(strategy, 7, 1);

      // net_theta calculation:
      // Sell leg: -(-0.05) = +0.05 (flip sign when selling)
      // Buy leg: +(-0.03) = -0.03
      // Total: 0.05 - 0.03 = 0.02
      expect(result.net_theta).toBeCloseTo(0.02, 4);

      // If it was using delta instead (OLD BUG):
      // Would be: -(0.65) + 0.45 = -0.20
      expect(result.net_theta).not.toBeCloseTo(-0.20, 1);
    });

    test('delta-neutral iron condor with negative theta shows earning time decay', () => {
      // Delta-neutral position (delta ~0) but negative theta (earns time decay when selling options)
      const ironCondor = {
        legs: [
          { action: 'sell', delta: -0.25, theta: -0.08 }, // Short put
          { action: 'buy', delta: -0.15, theta: -0.02 },  // Long put
          { action: 'sell', delta: 0.25, theta: -0.08 },  // Short call
          { action: 'buy', delta: 0.15, theta: -0.02 }    // Long call
        ]
      };

      const result = calculateTimeDecay(ironCondor, 7, 1);

      // Net delta: -(-0.25) + (-0.15) - 0.25 + 0.15 = 0 (delta neutral)
      // Net theta: -(-0.08) + (-0.02) - (-0.08) + (-0.02) = 0.08 - 0.02 + 0.08 - 0.02 = 0.12
      // Wait, let me recalculate...
      // sell put: -(-0.08) = +0.08 (theta benefit)
      // buy put: +(-0.02) = -0.02 (theta cost)
      // sell call: -(-0.08) = +0.08 (theta benefit)
      // buy call: +(-0.02) = -0.02 (theta cost)
      // Total: 0.08 - 0.02 + 0.08 - 0.02 = 0.12

      expect(result.net_theta).toBeGreaterThan(0); // Should earn theta
      expect(result.interpretation).toContain('benefits');
    });

    test('theta fallback to 0 when missing', () => {
      const strategy = {
        legs: [
          { action: 'sell', delta: 0.65 }, // No theta provided
          { action: 'buy', delta: 0.45, theta: -0.03 }
        ]
      };

      const result = calculateTimeDecay(strategy, 7, 1);

      // Sell leg: theta defaults to 0
      // Buy leg: +(-0.03) = -0.03
      // Total: 0 - 0.03 = -0.03
      expect(result.net_theta).toBeCloseTo(-0.03, 4);

      // If it was using delta (OLD BUG), would be:
      // -(0.65) + 0.45 = -0.20
      expect(result.net_theta).not.toBeCloseTo(-0.20, 1);
    });

    test('per-contract multiplier is correct', () => {
      const strategy = {
        legs: [
          { action: 'sell', theta: -0.05 }
        ]
      };

      const result = calculateTimeDecay(strategy, 1, 1);

      // net_theta = -(-0.05) = 0.05
      // daily_decay_per_contract = 0.05 * 100 = 5.00
      expect(result.daily_decay_per_contract).toBeCloseTo(5.00, 2);
    });
  });

  describe('calculateScenarioPnL - Delta P&L Bug Fix', () => {
    test('delta P&L should multiply by dollar move, not percentage', () => {
      const portfolioGreeks = {
        net_delta: 100, // 100 shares worth of delta
        net_gamma: 0,
        net_theta: 0,
        net_vega: 0
      };

      const underlying_price = 100; // $100 stock
      const scenarios = {
        price_move_pct: 0.05 // 5% move
      };

      const result = calculateScenarioPnL(portfolioGreeks, scenarios, underlying_price);

      // 5% of $100 = $5 move
      // 100 delta * $5 move = $500 P&L
      expect(result.pnl_breakdown.delta_pnl).toBeCloseTo(500, 2);

      // OLD BUG: Would have been 100 * 0.05 = 5 (100x too small!)
      expect(result.pnl_breakdown.delta_pnl).not.toBeCloseTo(5, 2);
    });

    test('severe crash scenario shows realistic delta loss', () => {
      const portfolioGreeks = {
        net_delta: 500, // Long 500 delta
        net_gamma: 0,
        net_theta: 0,
        net_vega: 0
      };

      const underlying_price = 150; // $150 stock
      const scenarios = {
        price_move_pct: -0.20 // -20% crash
      };

      const result = calculateScenarioPnL(portfolioGreeks, scenarios, underlying_price);

      // -20% of $150 = -$30 move
      // 500 delta * -$30 = -$15,000 loss
      expect(result.pnl_breakdown.delta_pnl).toBeCloseTo(-15000, 2);

      // OLD BUG: Would have been 500 * -0.20 = -100 (severely understated!)
      expect(Math.abs(result.pnl_breakdown.delta_pnl)).toBeGreaterThan(1000);
    });

    test('gamma P&L also uses dollar move', () => {
      const portfolioGreeks = {
        net_delta: 0,
        net_gamma: 10, // Some gamma exposure
        net_theta: 0,
        net_vega: 0
      };

      const underlying_price = 200; // $200 stock
      const scenarios = {
        price_move_pct: 0.10 // 10% move = $20
      };

      const result = calculateScenarioPnL(portfolioGreeks, scenarios, underlying_price);

      // Gamma P&L = 0.5 * gamma * (dollar_move)^2
      // = 0.5 * 10 * (20)^2 = 0.5 * 10 * 400 = 2000
      expect(result.pnl_breakdown.gamma_pnl).toBeCloseTo(2000, 2);

      // OLD BUG: Would have been 0.5 * 10 * (0.10)^2 * 100 = 0.5
      expect(result.pnl_breakdown.gamma_pnl).toBeGreaterThan(100);
    });

    test('cheap stock vs expensive stock shows proportional risk', () => {
      const portfolioGreeks = {
        net_delta: 100,
        net_gamma: 0,
        net_theta: 0,
        net_vega: 0
      };

      const scenarios = {
        price_move_pct: 0.05 // 5% move
      };

      // $10 stock
      const result1 = calculateScenarioPnL(portfolioGreeks, scenarios, 10);
      // 5% of $10 = $0.50, 100 delta * $0.50 = $50
      expect(result1.pnl_breakdown.delta_pnl).toBeCloseTo(50, 2);

      // $1000 stock
      const result2 = calculateScenarioPnL(portfolioGreeks, scenarios, 1000);
      // 5% of $1000 = $50, 100 delta * $50 = $5000
      expect(result2.pnl_breakdown.delta_pnl).toBeCloseTo(5000, 2);

      // Should be 100x difference for 100x price difference
      expect(result2.pnl_breakdown.delta_pnl / result1.pnl_breakdown.delta_pnl).toBeCloseTo(100, 0);
    });

    test('negative delta (short position) shows correct loss on rally', () => {
      const portfolioGreeks = {
        net_delta: -200, // Short 200 delta
        net_gamma: 0,
        net_theta: 0,
        net_vega: 0
      };

      const underlying_price = 450; // SPY at $450
      const scenarios = {
        price_move_pct: 0.10 // +10% rally
      };

      const result = calculateScenarioPnL(portfolioGreeks, scenarios, underlying_price);

      // +10% of $450 = +$45
      // -200 delta * +$45 = -$9000 loss
      expect(result.pnl_breakdown.delta_pnl).toBeCloseTo(-9000, 2);
    });

    test('default underlying_price of 100 when not provided', () => {
      const portfolioGreeks = {
        net_delta: 50,
        net_gamma: 0,
        net_theta: 0,
        net_vega: 0
      };

      const scenarios = {
        price_move_pct: 0.05
      };

      // Not passing underlying_price, should default to 100
      const result = calculateScenarioPnL(portfolioGreeks, scenarios);

      // 5% of $100 = $5, 50 delta * $5 = $250
      expect(result.pnl_breakdown.delta_pnl).toBeCloseTo(250, 2);
    });

    test('theta and vega P&L remain unchanged', () => {
      const portfolioGreeks = {
        net_delta: 0,
        net_gamma: 0,
        net_theta: -50, // Losing $50/day to theta
        net_vega: 100 // $100 per 1pt IV change
      };

      const scenarios = {
        price_move_pct: 0,
        iv_change_pts: 10, // +10% IV
        days_forward: 7
      };

      const result = calculateScenarioPnL(portfolioGreeks, scenarios, 150);

      // Theta: -50 * 7 days = -350
      expect(result.pnl_breakdown.theta_pnl).toBeCloseTo(-350, 2);

      // Vega: 100 * (10/100) = 10
      expect(result.pnl_breakdown.vega_pnl).toBeCloseTo(10, 2);
    });
  });

  describe('Combined scenario tests', () => {
    test('complex position with all Greeks in crash scenario', () => {
      const portfolioGreeks = {
        net_delta: 300, // Long delta
        net_gamma: -5, // Short gamma (bad in crashes)
        net_theta: 50, // Collecting theta
        net_vega: -200 // Short vega
      };

      const underlying_price = 100;
      const scenarios = {
        price_move_pct: -0.15, // -15% crash
        iv_change_pts: 20, // IV spikes 20%
        days_forward: 1
      };

      const result = calculateScenarioPnL(portfolioGreeks, scenarios, underlying_price);

      // Delta P&L: 300 * (-15) = -4500
      expect(result.pnl_breakdown.delta_pnl).toBeCloseTo(-4500, 1);

      // Gamma P&L: 0.5 * -5 * (-15)^2 = -562.5
      expect(result.pnl_breakdown.gamma_pnl).toBeCloseTo(-562.5, 1);

      // Theta P&L: 50 * 1 = 50
      expect(result.pnl_breakdown.theta_pnl).toBeCloseTo(50, 1);

      // Vega P&L: -200 * 0.20 = -40
      expect(result.pnl_breakdown.vega_pnl).toBeCloseTo(-40, 1);

      // Total should be very negative
      expect(result.total_estimated_pnl).toBeLessThan(-5000);
    });
  });
});
