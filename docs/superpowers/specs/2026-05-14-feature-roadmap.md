# LEDGER Feature Roadmap

Generated: 2026-05-14

## Phase 1 — Live data layer
Account balances update as you add/edit/delete transactions. Currently balances are static in `data.js`; they need to be computed from an opening balance + transaction history.

## Phase 2 — Transaction CRUD + search
Edit, delete, search, and filter transactions. Includes a proper "add transaction" flow that actually persists correctly end-to-end.

## Phase 3 — Period navigation
Month/date switcher across all screens (transactions, budgets, reports). Budget periods reset per month and carry rollover logic.

## Phase 4 — Bill tracking
Bills show paid/unpaid/upcoming status. Mark a bill as paid (creates a transaction). Due-date awareness.

## Phase 5 — Goal contributions
Add money toward a goal. Track contribution history. Link contributions to transactions.

## Phase 6 — Reports with charts
Spending by category over time, income vs. expenses, net worth trend — rendered as proper SVG charts (building on the existing `AsciiSpark` primitive).

## Dependencies
- Phase 1 is a prerequisite for all others (balances must be live before CRUD, period nav, etc. are meaningful)
- Phase 2 should follow Phase 1 (CRUD is the most-used daily feature)
- Phases 3–6 are largely independent of each other once Phase 2 is done
