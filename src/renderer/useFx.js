import React from 'react';
import { useStore } from './store';
import { toReportingCurrency } from './fx.mjs';

// React hook: binds the store's current rates and the user's reporting
// currency (typically t.currency from settings) into helpers ready to
// call at the site of an aggregation.
//
// Usage:
//   const { toReporting } = useFx(t.currency || 'USD');
//   const total = items.reduce((s, x) => s + toReporting(x.amt, x.ccy), 0);
export function useFx(reportingCcy = 'USD') {
  const { rates, ratesUpdated } = useStore();

  const toReporting = React.useCallback(
    (amt, ccy) => toReportingCurrency(amt, ccy, rates, reportingCcy),
    [rates, reportingCcy],
  );

  return { rates, ratesUpdated, reportingCcy, toReporting };
}
