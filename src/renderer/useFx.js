import React from 'react';
import { useStore } from './store';
import { toReportingCurrency } from './fx.mjs';

// React hook: binds the store's current FX history and the user's reporting
// currency (typically t.currency from settings) into a helper ready to call
// at the site of an aggregation. Pass `tx.date` as the 3rd arg so per-tx
// conversions use the rate effective on the transaction date (CAR-237);
// account-balance reductions (current valuation) intentionally omit it.
//
// Usage:
//   const { toReporting } = useFx(t.currency || 'USD');
//   const total = items.reduce((s, x) => s + toReporting(x.amt, x.ccy, x.date), 0);
export function useFx(reportingCcy = 'USD') {
  const { rates, ratesUpdated } = useStore();

  const toReporting = React.useCallback(
    (amt, ccy, date) => toReportingCurrency(amt, ccy, rates, reportingCcy, date),
    [rates, reportingCcy],
  );

  return { rates, ratesUpdated, reportingCcy, toReporting };
}
