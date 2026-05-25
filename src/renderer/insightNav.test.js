// CAR-217: unit tests for the insight drill-down helper. Locks the
// (filter, route) contract that Dashboard, WebAlerts, and the mobile App
// all consume via applyInsightDrillDown.
import { describe, it, expect, vi } from 'vitest';
import { buildInsightTxFilter, applyInsightDrillDown } from './insightNav';

describe('buildInsightTxFilter', () => {
  it('returns null for non-transactions routes (caller should defer)', () => {
    expect(buildInsightTxFilter({ route: 'recurring' })).toBeNull();
    expect(buildInsightTxFilter({ route: 'budgets' })).toBeNull();
    expect(buildInsightTxFilter(null)).toBeNull();
    expect(buildInsightTxFilter(undefined)).toBeNull();
  });

  it('builds an expense filter with category for category-spike insights', () => {
    const filter = buildInsightTxFilter({
      route: 'transactions',
      routeParams: { cat: 'food' },
    });
    expect(filter).toEqual({ type: 'expense', category: 'food' });
  });

  it('builds an expense filter with merchant for new-merchant insights', () => {
    const filter = buildInsightTxFilter({
      route: 'transactions',
      routeParams: { merchant: 'NEW STORE' },
    });
    expect(filter).toEqual({ type: 'expense', merchant: 'NEW STORE' });
  });

  it('combines category and merchant when both are present', () => {
    const filter = buildInsightTxFilter({
      route: 'transactions',
      routeParams: { cat: 'food', merchant: 'CAFÉ' },
    });
    expect(filter).toEqual({ type: 'expense', category: 'food', merchant: 'CAFÉ' });
  });

  it('returns just type=expense when routeParams is missing', () => {
    expect(buildInsightTxFilter({ route: 'transactions' })).toEqual({ type: 'expense' });
    expect(buildInsightTxFilter({ route: 'transactions', routeParams: {} })).toEqual({
      type: 'expense',
    });
  });

  it('ignores extra routeParams that aren\u2019t cat or merchant', () => {
    // period is consumed by other surfaces (Reports), not by tx-filter.
    const filter = buildInsightTxFilter({
      route: 'transactions',
      routeParams: { cat: 'food', period: 'this-week' },
    });
    expect(filter).toEqual({ type: 'expense', category: 'food' });
  });
});

describe('applyInsightDrillDown', () => {
  it('sets tx filter and navigates to tx for transactions route', () => {
    const setTxFilter = vi.fn();
    const navigate = vi.fn();
    applyInsightDrillDown(
      { route: 'transactions', routeParams: { cat: 'food' } },
      { setTxFilter, navigate },
    );
    expect(setTxFilter).toHaveBeenCalledWith({ type: 'expense', category: 'food' });
    expect(navigate).toHaveBeenCalledWith('tx');
  });

  it('defers to navigate(route, routeParams) for non-transactions routes', () => {
    const setTxFilter = vi.fn();
    const navigate = vi.fn();
    applyInsightDrillDown(
      { route: 'recurring', routeParams: { ruleId: 'r1' } },
      { setTxFilter, navigate },
    );
    expect(setTxFilter).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith('recurring', { ruleId: 'r1' });
  });

  it('is a no-op for null/undefined insight (defensive)', () => {
    const setTxFilter = vi.fn();
    const navigate = vi.fn();
    applyInsightDrillDown(null, { setTxFilter, navigate });
    applyInsightDrillDown(undefined, { setTxFilter, navigate });
    expect(setTxFilter).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });
});
