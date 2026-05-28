# CAR-157 — Effective-date FX rates: design note

**Status:** implementation note
**Date:** 2026-05-26
**Linear:** CAR-157

## Scope

Move FX storage from a flat `rate-by-currency` map to a per-currency history table and make every conversion date-aware.

## Storage + migration

- Persist rates at `ledger:fxRates` as:
  `ratesHistory: Record<ccy, Array<{ rate, effectiveFrom, source? }>>`
- Keep USD as a single always-present entry with `effectiveFrom: '1900-01-01'`.
- On hydrate:
  - flat legacy shape `{ EUR: 0.921, ... }` migrates to one history entry per currency stamped with today’s ISO date (`YYYY-MM-DD`) and `source: 'seed'`
  - already-historical data stays unchanged
  - malformed / partial entries are repaired into a valid array shape when possible, otherwise dropped in favor of a safe default
- Migration is idempotent: once written back, subsequent hydrates keep the same shape.

## Lookup rules

- `rateFor(history, ccy, date)` returns the entry whose `effectiveFrom` is the latest value `<= date`.
- If `date` is earlier than the first known entry, use the earliest entry.
- If a currency has no history at all, fall back to `DEFAULT_RATES[ccy]`.
- If the currency is unknown or the chosen rate is invalid, warn and return the original amount unchanged.

## Same-day write policy

- `setRate(ccy, rate, { effectiveFrom, source })` appends a new entry when the chosen `effectiveFrom` does not already exist.
- If a history entry already exists for that exact day, update that entry instead of duplicating it.
- Manual edits win over fetched rates on the same day.
- Auto-fetch appends `source: 'fetched'` entries for today unless a manual entry already exists for that day.

## Backups

- Backup export/import continues to carry `fxRates`, but the payload now contains the history shape.
- Old backups with flat `fxRates` restore through the same migration path used on hydrate.

## Validation strategy

- Add pure-function tests for:
  - before-earliest lookup
  - exact-date lookup
  - in-between lookup
  - no-history fallback
  - missing currency fallback
  - USD identity
  - migration from flat → history
  - partial/corrupt repair
- Add end-to-end regression coverage proving that editing today’s rate does not change a past month’s totals.
