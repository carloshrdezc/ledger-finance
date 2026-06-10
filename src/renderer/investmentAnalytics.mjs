/**
 * @file Investment analytics (CAR-353).
 *
 * Pure, deterministic portfolio analytics computed from holdings + trades:
 *   - per-holding cost basis (average-cost method), current value, unrealized
 *     gain/loss ($ and %)
 *   - portfolio totals: invested, current value, unrealized + realized gain,
 *     total return %
 *   - allocation by asset class (falls back to inferred class when a holding
 *     has no explicit assetClass)
 *
 * No React, no storage, no network. Holding shape: { ticker, name, shares,
 * price, chg, assetClass? }. Trade shape: { ticker, type:'buy'|'sell', shares,
 * price, date }.
 *
 * Cost-basis method: average cost. A buy adds to cost pool and share count; a
 * sell removes shares at the running average cost and realizes the difference
 * vs the sale price. This is the simplest defensible method and matches how
 * most personal-finance tools report unrealized gain.
 */

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function round2(value) {
  return Math.round((num(value) + Number.EPSILON) * 100) / 100;
}

/**
 * Infer a coarse asset class for a holding that has no explicit `assetClass`,
 * from common ticker/name patterns. Conservative — anything unrecognized is
 * 'Other' so the user can set it explicitly.
 *
 * @param {{ticker?:string, name?:string}} holding
 * @returns {string}
 */
export function inferAssetClass(holding) {
  const ticker = String(holding?.ticker || '').toUpperCase();
  const name = String(holding?.name || '').toUpperCase();
  const hay = `${ticker} ${name}`;
  if (/\b(BTC|ETH|SOL|DOGE|ADA|XRP|CRYPTO|COIN|BITCOIN|ETHEREUM)\b/.test(hay)) return 'Crypto';
  if (/\b(BND|AGG|TLT|BOND|TREASURY|FIXED INCOME)\b/.test(hay)) return 'Bonds';
  if (/\b(VXUS|VEU|EFA|EEM|INTL|INTERNATIONAL|EMERGING|EX-US)\b/.test(hay)) return 'Intl Stocks';
  if (/\b(GLD|SLV|GOLD|SILVER|COMMODIT)\b/.test(hay)) return 'Commodities';
  if (/\b(VNQ|REIT|REAL ESTATE)\b/.test(hay)) return 'Real Estate';
  if (/\b(VTI|VOO|SPY|QQQ|AAPL|MSFT|STOCK|EQUITY|INDEX)\b/.test(hay)) return 'US Stocks';
  return 'Other';
}

function assetClassOf(holding) {
  const explicit = String(holding?.assetClass || '').trim();
  return explicit || inferAssetClass(holding);
}

/**
 * Average-cost basis for a single ticker from its trade history.
 *
 * @param {Array<Object>} trades
 * @param {string} ticker
 * @returns {{shares:number, costBasis:number, avgCost:number, realizedGain:number, oversold:number}}
 *   shares: net shares held; costBasis: total cost of held shares;
 *   avgCost: per-share; realizedGain: cumulative realized P/L from sells;
 *   oversold: shares sold beyond what was held (data-entry signal; clamped out
 *   of the realized math).
 */
export function costBasisForTicker(trades, ticker) {
  let shares = 0;
  let costBasis = 0;
  let realizedGain = 0;
  let oversold = 0;
  const chron = (trades || [])
    .filter(tr => tr && tr.ticker === ticker)
    .slice()
    // Sort by date; within the same date settle buys before sells so a same-day
    // sell realizes against the day's purchases (not a stale/empty basis).
    .sort((a, b) =>
      String(a.date || '').localeCompare(String(b.date || '')) ||
      ((a.type === 'sell') - (b.type === 'sell')));
  for (const tr of chron) {
    const qty = num(tr.shares);
    const price = num(tr.price);
    if (tr.type === 'sell') {
      const avg = shares > 0 ? costBasis / shares : 0;
      const sold = Math.min(qty, shares);
      if (qty > sold) oversold += round2(qty - sold); // sell beyond held shares
      realizedGain += round2(sold * (price - avg));
      costBasis -= round2(sold * avg);
      shares -= sold;
      if (shares < 1e-9) { shares = 0; costBasis = 0; }
    } else { // buy (default)
      shares += qty;
      costBasis += round2(qty * price);
    }
  }
  return {
    shares: round2(shares),
    costBasis: round2(costBasis),
    avgCost: shares > 0 ? round2(costBasis / shares) : 0,
    realizedGain: round2(realizedGain),
    oversold: round2(oversold),
  };
}

/**
 * Per-holding analytics: current value, cost basis (from trades when available,
 * else value at current price as a fallback), unrealized gain $ and %.
 *
 * @param {Array<Object>} investments
 * @param {Array<Object>} trades
 * @returns {Array<{ticker, name, assetClass, shares, price, value, costBasis,
 *   avgCost, unrealizedGain, unrealizedPct, realizedGain}>}
 */
export function computeHoldingAnalytics(investments, trades) {
  return (investments || []).map(h => {
    const shares = num(h.shares);
    const price = num(h.price);
    const value = round2(shares * price);
    const basis = costBasisForTicker(trades, h.ticker);
    // A ticker "has trades" if its history left a position or realized a gain.
    const hasTrades = basis.shares > 0 || basis.realizedGain !== 0 || basis.oversold > 0;
    // The holding's declared `shares` is the source of truth for *value*. When
    // it diverges from the net shares implied by the trade history (incomplete
    // import, or the user edited shares directly), scale the trade-derived cost
    // basis to the holding's actual share count so value and basis are measured
    // on the same shares — otherwise unrealizedGain/avgCost compare mismatched
    // quantities. Flag the divergence so the UI can surface it.
    const sharesMismatch = hasTrades && Math.abs(basis.shares - shares) > 1e-6;
    let costBasis;
    if (!hasTrades) {
      costBasis = value; // entered directly, no trade history → 0 unrealized
    } else if (basis.shares > 0) {
      const perShare = basis.costBasis / basis.shares;
      costBasis = round2(perShare * shares); // scale basis to holding shares
    } else {
      // Position fully exited per trades but the holding still lists shares —
      // we have no basis for them; fall back to current value (0 unrealized).
      costBasis = value;
    }
    const avgCost = shares > 0 ? round2(costBasis / shares) : price;
    const unrealizedGain = round2(value - costBasis);
    const unrealizedPct = costBasis > 0 ? round2((unrealizedGain / costBasis) * 100) : 0;
    return {
      ticker: h.ticker,
      name: h.name || h.ticker,
      assetClass: assetClassOf(h),
      shares,
      price,
      value,
      costBasis,
      avgCost,
      unrealizedGain,
      unrealizedPct,
      realizedGain: basis.realizedGain,
      oversold: basis.oversold,
      sharesMismatch,
    };
  });
}

/**
 * Allocation grouped by asset class.
 *
 * @param {Array<Object>} investments
 * @param {Array<Object>} [trades] (unused for allocation, kept for symmetry)
 * @returns {Array<{assetClass:string, value:number, pct:number, tickers:string[]}>}
 *   sorted by value descending. pct is a fraction (0..1).
 */
export function computeAllocationByClass(investments) {
  const byClass = new Map();
  let total = 0;
  for (const h of investments || []) {
    const value = round2(num(h.shares) * num(h.price));
    if (value <= 0) continue;
    total = round2(total + value);
    const cls = assetClassOf(h);
    const cur = byClass.get(cls) || { assetClass: cls, value: 0, tickers: [] };
    cur.value = round2(cur.value + value);
    cur.tickers.push(h.ticker);
    byClass.set(cls, cur);
  }
  return [...byClass.values()]
    .map(c => ({ ...c, pct: total > 0 ? c.value / total : 0 }))
    .sort((a, b) => b.value - a.value);
}

/**
 * Portfolio-level return summary.
 *
 * @param {Array<Object>} investments
 * @param {Array<Object>} trades
 * @returns {{
 *   value:number, costBasis:number, invested:number,
 *   unrealizedGain:number, unrealizedPct:number,
 *   realizedGain:number, totalGain:number, totalReturnPct:number
 * }}
 */
export function computePortfolioReturns(investments, trades) {
  const holdings = computeHoldingAnalytics(investments, trades);
  let value = 0;
  let costBasis = 0;
  let unrealizedGain = 0;
  let realizedGain = 0;
  for (const h of holdings) {
    value = round2(value + h.value);
    costBasis = round2(costBasis + h.costBasis);
    unrealizedGain = round2(unrealizedGain + h.unrealizedGain);
    realizedGain = round2(realizedGain + h.realizedGain);
  }
  // "Invested" = net cash put in across all trades (buys − sells at trade
  // price). For holdings without trades, costBasis stands in.
  let tradedInvested = 0;
  let hasAnyTrade = false;
  for (const tr of trades || []) {
    hasAnyTrade = true;
    const amt = round2(num(tr.shares) * num(tr.price));
    tradedInvested = round2(tradedInvested + (tr.type === 'sell' ? -amt : amt));
  }
  const invested = hasAnyTrade ? tradedInvested : costBasis;
  const totalGain = round2(unrealizedGain + realizedGain);
  // unrealizedPct: gain on currently-held shares vs their cost basis.
  const unrealizedPct = costBasis > 0 ? round2((unrealizedGain / costBasis) * 100) : 0;
  // totalReturnPct: total P/L (unrealized + realized) against net invested
  // capital — the headline "how is the portfolio doing overall" number.
  const totalReturnPct = invested > 0 ? round2((totalGain / invested) * 100) : 0;

  return {
    value,
    costBasis,
    invested,
    unrealizedGain,
    unrealizedPct,
    realizedGain,
    totalGain,
    totalReturnPct,
  };
}
