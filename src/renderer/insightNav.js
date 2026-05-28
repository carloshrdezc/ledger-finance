// CAR-217: insight drill-down navigation helper.
//
// Single source of truth for resolving an insight row to a (filter, route)
// pair. Three surfaces consume this — Dashboard (web), WebAlerts, and the
// mobile App — so we keep it here to prevent drift when new insight `route`
// values are added.
//
// Pure helper module. No React, no localStorage, no DOM.

/**
 * @typedef {{ type: 'expense', category?: string, merchant?: string }} InsightTxFilter
 */

/**
 * Build the tx-filter shape used by setTxFilter for `route: 'transactions'`
 * insights. Returns null for non-transactions routes so callers can defer.
 *
 * @param {{ route: string, routeParams?: Record<string,string> }} insight
 * @returns {InsightTxFilter|null}
 */
export function buildInsightTxFilter(insight) {
  if (!insight || insight.route !== 'transactions') return null;
  const params = insight.routeParams || {};
  /** @type {InsightTxFilter} */
  const filter = { type: 'expense' };
  if (params.cat) filter.category = params.cat;
  if (params.merchant) filter.merchant = params.merchant;
  return filter;
}

/**
 * Apply an insight's drill-down: either set a tx filter and switch to the
 * transactions tab, or defer to the generic navigate(route, routeParams).
 *
 * Caller passes in the imperative side-effects so this stays test-free of
 * React. `navigate(route, routeParams?)` is the surface-specific resolver
 * (WebShell uses string keys, mobile uses goToRoute).
 *
 * @param {{ route: string, routeParams?: Record<string,string> }} insight
 * @param {{ setTxFilter: (f: InsightTxFilter) => void, navigate: (route: string, routeParams?: Record<string,string>) => void }} hooks
 */
export function applyInsightDrillDown(insight, { setTxFilter, navigate }) {
  if (!insight) return;
  const filter = buildInsightTxFilter(insight);
  if (filter) {
    setTxFilter(filter);
    navigate('tx');
    return;
  }
  navigate(insight.route, insight.routeParams);
}
