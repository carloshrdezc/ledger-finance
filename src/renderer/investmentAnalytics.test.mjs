import { describe, it, expect } from 'vitest';
import {
  inferAssetClass,
  costBasisForTicker,
  computeHoldingAnalytics,
  computeAllocationByClass,
  computePortfolioReturns,
} from './investmentAnalytics.mjs';

describe('inferAssetClass', () => {
  it('classifies common tickers/names', () => {
    expect(inferAssetClass({ ticker: 'BTC', name: 'BITCOIN' })).toBe('Crypto');
    expect(inferAssetClass({ ticker: 'BND', name: 'TOTAL BOND' })).toBe('Bonds');
    expect(inferAssetClass({ ticker: 'VXUS', name: 'INTL STOCK INDEX' })).toBe('Intl Stocks');
    expect(inferAssetClass({ ticker: 'VTI', name: 'VANGUARD TOTAL MKT' })).toBe('US Stocks');
    expect(inferAssetClass({ ticker: 'AAPL', name: 'APPLE INC' })).toBe('US Stocks');
    expect(inferAssetClass({ ticker: 'ZZZZ', name: 'MYSTERY' })).toBe('Other');
  });
});

describe('costBasisForTicker', () => {
  it('computes average cost across multiple buys', () => {
    const trades = [
      { ticker: 'VTI', type: 'buy', shares: 200, price: 265, date: '2026-02-10' },
      { ticker: 'VTI', type: 'buy', shares: 150, price: 271, date: '2026-03-05' },
      { ticker: 'VTI', type: 'buy', shares: 62.2, price: 277, date: '2026-04-08' },
    ];
    const b = costBasisForTicker(trades, 'VTI');
    expect(b.shares).toBe(412.2);
    // 200*265 + 150*271 + 62.2*277 = 53000 + 40650 + 17229.4 = 110879.4
    expect(b.costBasis).toBe(110879.4);
    expect(b.avgCost).toBe(268.99); // 110879.4 / 412.2 = 268.992... → 268.99
    expect(b.realizedGain).toBe(0);
  });

  it('realizes gain on a sell at average cost', () => {
    const trades = [
      { ticker: 'X', type: 'buy', shares: 10, price: 100, date: '2026-01-01' },
      { ticker: 'X', type: 'buy', shares: 10, price: 200, date: '2026-02-01' }, // avg 150
      { ticker: 'X', type: 'sell', shares: 10, price: 250, date: '2026-03-01' },
    ];
    const b = costBasisForTicker(trades, 'X');
    expect(b.shares).toBe(10);
    expect(b.realizedGain).toBe(1000); // 10 * (250 - 150)
    expect(b.costBasis).toBe(1500);    // 10 remaining * 150 avg
    expect(b.avgCost).toBe(150);
  });

  it('handles selling the entire position back to zero', () => {
    const trades = [
      { ticker: 'X', type: 'buy', shares: 5, price: 100, date: '2026-01-01' },
      { ticker: 'X', type: 'sell', shares: 5, price: 120, date: '2026-02-01' },
    ];
    const b = costBasisForTicker(trades, 'X');
    expect(b.shares).toBe(0);
    expect(b.costBasis).toBe(0);
    expect(b.realizedGain).toBe(100);
  });
});

describe('computeHoldingAnalytics', () => {
  const investments = [
    { ticker: 'VTI', name: 'VANGUARD TOTAL MKT', shares: 412.2, price: 281.4, chg: 1.21, assetClass: 'US Stocks' },
  ];
  const trades = [
    { ticker: 'VTI', type: 'buy', shares: 200, price: 265, date: '2026-02-10' },
    { ticker: 'VTI', type: 'buy', shares: 150, price: 271, date: '2026-03-05' },
    { ticker: 'VTI', type: 'buy', shares: 62.2, price: 277, date: '2026-04-08' },
  ];

  it('computes value, cost basis, and unrealized gain from trades', () => {
    const [h] = computeHoldingAnalytics(investments, trades);
    expect(h.value).toBe(round2(412.2 * 281.4)); // 115993.08
    expect(h.costBasis).toBe(110879.4);
    expect(h.unrealizedGain).toBe(round2(h.value - 110879.4));
    expect(h.unrealizedPct).toBeGreaterThan(0);
    expect(h.assetClass).toBe('US Stocks');
  });

  it('falls back to current value (0 gain) for a holding with no trades', () => {
    const [h] = computeHoldingAnalytics(
      [{ ticker: 'CASH', name: 'MONEY', shares: 100, price: 10 }],
      [],
    );
    expect(h.costBasis).toBe(1000);
    expect(h.unrealizedGain).toBe(0);
    expect(h.unrealizedPct).toBe(0);
    expect(h.assetClass).toBe('Other');
  });
});

describe('computeAllocationByClass', () => {
  it('groups holdings by asset class with fractional pct summing to 1', () => {
    const investments = [
      { ticker: 'VTI', shares: 100, price: 100, assetClass: 'US Stocks' },  // 10000
      { ticker: 'AAPL', shares: 50, price: 100, assetClass: 'US Stocks' },  // 5000
      { ticker: 'BND', shares: 50, price: 100, assetClass: 'Bonds' },       // 5000
    ];
    const alloc = computeAllocationByClass(investments);
    expect(alloc[0]).toMatchObject({ assetClass: 'US Stocks', value: 15000 });
    expect(alloc[0].tickers).toEqual(['VTI', 'AAPL']);
    expect(alloc[1]).toMatchObject({ assetClass: 'Bonds', value: 5000 });
    const totalPct = alloc.reduce((s, c) => s + c.pct, 0);
    expect(Math.abs(totalPct - 1)).toBeLessThan(1e-9);
    expect(alloc[0].pct).toBeCloseTo(0.75, 5);
  });

  it('infers asset class when not set explicitly', () => {
    const alloc = computeAllocationByClass([{ ticker: 'BTC', name: 'BITCOIN', shares: 1, price: 50000 }]);
    expect(alloc[0].assetClass).toBe('Crypto');
  });

  it('ignores zero/negative-value holdings', () => {
    expect(computeAllocationByClass([{ ticker: 'X', shares: 0, price: 100 }])).toEqual([]);
  });
});

describe('computePortfolioReturns', () => {
  it('aggregates value, invested, unrealized and total return', () => {
    const investments = [
      { ticker: 'X', shares: 10, price: 150, assetClass: 'US Stocks' }, // value 1500
    ];
    const trades = [
      { ticker: 'X', type: 'buy', shares: 10, price: 100, date: '2026-01-01' }, // cost 1000
    ];
    const r = computePortfolioReturns(investments, trades);
    expect(r.value).toBe(1500);
    expect(r.costBasis).toBe(1000);
    expect(r.invested).toBe(1000);
    expect(r.unrealizedGain).toBe(500);
    expect(r.totalReturnPct).toBe(50);
    expect(r.realizedGain).toBe(0);
    expect(r.totalGain).toBe(500);
  });

  it('includes realized gain from sells in totalGain and reduces invested', () => {
    const investments = [{ ticker: 'X', shares: 5, price: 200 }]; // value 1000
    const trades = [
      { ticker: 'X', type: 'buy', shares: 10, price: 100, date: '2026-01-01' },  // +1000 invested
      { ticker: 'X', type: 'sell', shares: 5, price: 150, date: '2026-02-01' },  // -750 invested, realized +250
    ];
    const r = computePortfolioReturns(investments, trades);
    expect(r.invested).toBe(250);           // 1000 - 750
    expect(r.realizedGain).toBe(250);        // 5 * (150 - 100)
    expect(r.costBasis).toBe(500);           // 5 remaining * 100
    expect(r.unrealizedGain).toBe(500);      // value 1000 - basis 500
    expect(r.totalGain).toBe(750);           // 500 unrealized + 250 realized
  });

  it('returns zeros for an empty portfolio', () => {
    const r = computePortfolioReturns([], []);
    expect(r).toMatchObject({ value: 0, costBasis: 0, invested: 0, unrealizedGain: 0, totalGain: 0, totalReturnPct: 0 });
  });
});

// local helper mirroring the module's rounding for expectations
function round2(v) {
  return Math.round((v + Number.EPSILON) * 100) / 100;
}
