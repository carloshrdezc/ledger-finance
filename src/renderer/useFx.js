import React from 'react';
import { useStore } from './store';
import { toReportingCurrency } from './fx.mjs';

// React hook: binds the store's current FX history and the user's reporting
// currency (typically t.currency from settings) into helpers ready to call
// at the site of an aggregation.
//
// Usage:
//   const { toReporting, toReportingAt } = useFx(t.currency || 'USD');
//   const total = items.reduce((s, x) => s + toReporting(x.amt, x.ccy, x.date), 0);
export function useFx(reportingCcy = 'USD') {
  const { rates, ratesUpdated } = useStore();

  const toReportingAt = React.useCallback(
    (date) => (amt, ccy) => toReportingCurrency(amt, ccy, rates, reportingCcy, date),
    [rates, reportingCcy],
  );

  const toReporting = React.useCallback(
    (amt, ccy, date) => toReportingCurrency(amt, ccy, rates, reportingCcy, date),
    [rates, reportingCcy],
  );

  return { rates, ratesUpdated, reportingCcy, toReporting, toReportingAt };
}
