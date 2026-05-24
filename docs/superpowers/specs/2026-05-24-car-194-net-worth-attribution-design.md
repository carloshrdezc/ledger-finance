# CAR-194 — Net-Worth Attribution: Data Model & Calculation Rules

**Status:** Draft → review
**Date:** 2026-05-24
**Linear:** [CAR-194](https://linear.app/carloshrdezc/issue/CAR-194)
**Implements for:** [CAR-87](https://linear.app/carloshrdezc/issue/CAR-87) (UI/feature ticket)
**Dependencies:** CAR-75 (FX rates) — required for cross-currency accuracy.

## Summary

Specifies how to decompose a month-over-month (or arbitrary-range) change in net worth into five attribution buckets — `contributions`, `marketGains`, `spending`, `income`, `transfers` — using only data the app already stores (accounts, transactions, FX rates). Defines the inputs, the bucket rules, the missing-data behavior, and the math invariants. No code; CAR-87 implements.

## Problem

The net-worth chart in `charts.mjs:buildNetWorthTrend` shows a single number per period (sum of opening balances + transaction deltas, FX-converted). When the line moves, the user has no way to see *why*: was it salary deposit, market movement, a transfer in, or just spending? The shape of the chart hides every causal driver.

## Goal

For any range `[fromDate, toDate]` and the existing accounts + transactions + FX rates inputs, produce four invariant buckets — `income`, `spending`, `marketGains`, `transfers` — plus one derived informational metric — `contributions` — such that:

```
income - spending + marketGains + transfers ≈ ΔnetWorth
```

within a small FX-rounding tolerance (see Invariants below). Each bucket has clear inclusion rules so engineers can implement it deterministically and the user can drill down to the source transactions.

## Non-goals

- **Tax-aware attribution.** Cost-basis tracking, realized vs. unrealized gains, and tax-lot math are explicitly out — see CAR-87 "investment phase 2."
- **Per-account attribution.** This spec produces one bucket-set per range. Per-account breakdown can layer on later.
- **Per-day attribution.** Range granularity only.
- **Liability-side decomposition.** Loans/CC are folded into spending/income at this layer; LTV-style separation is a future spec.
- **Forecasting.** This describes *historical* attribution. Forward-looking forecast is CAR-195.

## Inputs

The attribution function consumes the same primitives the rest of the app uses. No new fields on accounts or transactions.

```
attributeNetWorthChange(accounts, transactions, fromDate, toDate, rates, reportingCcy='USD')
  → { contributions, marketGains, spending, income, transfers,
      delta, sumOfBuckets, residual,
      flags: [...] }
```

Where:

- **`accounts`** — same shape as `data.js:ACCOUNTS`. Relevant fields:
  - `id` (string), `type` ∈ `{CHK, SAV, CC, INV, CRY, FX, LOAN, CASH}`
  - `ccy`, `openingBal`, `archived`, `includeInTotals`
- **`transactions`** — array of tx objects. Relevant fields:
  - `id`, `acct` (account id), `amt` (signed; positive = inflow, negative = outflow), `ccy`, `date` (YYYY-MM-DD), `cat` (category root or full path), `path` (optional category path array), `transferId`, `transferPeer`
- **`fromDate`, `toDate`** — inclusive ISO strings (`YYYY-MM-DD`).
- **`rates`** — FX rates map (`{ USD: 1, EUR: 0.92, ... }`) per CAR-75.
- **`reportingCcy`** — defaults to `'USD'`.

### Excluded accounts

An account is excluded from attribution iff `archived === true` OR `includeInTotals === false`. This matches `charts.mjs:countedAccount`. Transactions on excluded accounts are ignored entirely.

## Account classification

Account types group into two roles for attribution purposes:

| Role | Types | Why |
|---|---|---|
| **Investment** | `INV`, `CRY` | Balance can move from market action *without* a transaction. |
| **Cash-like** | `CHK`, `SAV`, `CC`, `FX`, `LOAN`, `CASH` | Balance only changes via recorded transactions; no market gains. |

This is a hard binary in v1. `CC` and `LOAN` are liabilities (negative balances move toward zero on pay-down) but they're still cash-like for attribution: a CC payment shows up as a transfer between checking and CC.

## Bucket rules

For each transaction `tx` whose `tx.date ∈ [fromDate, toDate]` and whose `tx.acct` is a counted account, classify into exactly one bucket. All amounts are converted to `reportingCcy` via `toReportingCurrency(tx.amt, tx.ccy, rates, reportingCcy)`. All bucket totals are reported as positive numbers (signs documented per bucket).

### Decision order

The classifier walks the rules top-to-bottom; first match wins. Order matters because `transfer` overrides `income`/`spending` even if cat looks otherwise.

```
1. Is tx part of a transfer pair?  (tx.cat === 'transfer' OR tx.transferId set)
     → goto Transfer rules
2. Is tx.acct an investment account (INV or CRY)?
     → contribution / withdrawal (sign-dependent)
3. Is tx an income tx?  (cat root === 'income' OR positive non-transfer)
     → income
4. Otherwise (negative non-transfer, non-investment-account)
     → spending
```

### 1. `transfers`

A transaction is a transfer iff `tx.cat === 'transfer'` OR `tx.transferId` is set (per `bulkOps.mjs` convention).

- **Internal transfers (both legs counted):** if both `tx.acct` and the peer `tx.transferPeer`'s account are counted, *and* both legs fall in the range, *and* the *role* of both endpoints is the same (both cash-like, OR both investment), the pair contributes 0 to all buckets. Do NOT add to `transfers`.
- **Cross-role transfers** (cash-like ↔ investment) are reclassified:
  - cash-like → investment leg = **contribution** (positive contributions value).
  - investment → cash-like leg = **withdrawal** (negative contribution; subtracts from `contributions`).
  - The "transfers" bucket does NOT receive these.
- **Asymmetric transfers** (one leg outside range, or one account excluded, or peer missing): the in-range/counted leg lands in `transfers` with its signed amount. This is the **only** thing that ends up in the `transfers` bucket.
- The `transfers` bucket is signed: positive = net transfer in to counted accounts, negative = net out. A non-zero value is a *signal* (data hygiene flag), not necessarily an error.

### 2. `contributions` *(informational, not in the invariant)*

Cash flowing into investment accounts (positive) or out of them (negative). Reported alongside the four invariant buckets for the UI breakdown; **does not** participate in the I1 sum (cross-role transfers are NW-neutral — the cash-like leg already nets it out in the balance delta).

- A transaction `tx` on an `INV` or `CRY` account that is NOT a market-driven adjustment (see Out-of-band balance adjustments below) and IS a transfer leg from a cash-like account contributes `+tx.amt` (positive when money goes in).
- The corresponding cash-like leg is also seen but its contribution to this bucket is the same (already counted on the investment side; do not double-count — implementation must dedupe by `transferId`).
- A direct deposit/withdrawal on an INV/CRY account that is NOT marked as a transfer pair (orphan tx with `cat !== 'transfer'`) — treat as contribution if `cat` is not in the *market-event* set (see below).

The `contributions` value reported is the **signed sum** (positive = net cash in).

### 3. `marketGains`

The residual on each investment account, computed *per account*, then summed.

```
marketGains[acct] = balance(acct, toDate) - balance(acct, fromDate-1)
                    - (contributions touching acct in range)
                    - (recorded gain/loss/interest tx on acct in range, see below)
```

Where `balance(acct, d)` = `openingBal + sum(tx.amt for tx in acct where tx.date <= d)` (in account ccy, then FX-converted at `rates`). This is the **same formula** `charts.mjs:buildNetWorthDailyTrend` already uses, scoped per account.

`marketGains` is the signed residual: positive = market up + dividends + unrecorded growth, negative = market down. Recorded `cat: 'income'` tx with sub-cat `interest` or `dividend` on an investment account go to `income` (not `marketGains`) so the user can see them explicitly.

### 4. `income`

A transaction `tx` is income iff:

- `tx.cat === 'income'` OR `(tx.path && tx.path[0] === 'income')`, OR
- `tx.amt > 0` AND `tx.cat` is not `'transfer'` AND `tx.acct` is not investment (positive non-transfer non-investment treated as income — handles untagged refunds/cashback).

Income contributes `+|tx.amt|` to the bucket. Reported as positive.

### 5. `spending`

Default bucket for everything not matched above:

- `tx.amt < 0` AND `tx.cat !== 'transfer'` AND `tx.acct` is not investment AND not income.

Spending contributes `+|tx.amt|` (positive magnitude). Reported as positive. The invariant subtracts it.

### CC payments

A user paying off their credit card is a transfer `CHK → CC`. Both are cash-like. Per Transfer rules above, intra-cash-like transfers contribute 0 to all buckets. The CC charge that triggered the payment was already counted in `spending` when it occurred (negative tx on the CC account, `cat !== 'transfer'`). No double counting.

### Loan payments

Same as CC: principal portion is a `CHK → LOAN` transfer (zero impact on buckets); interest portion is a separate spending tx categorized appropriately.

## Invariants

These must hold for any valid input. Each is testable.

### I1. Sum-of-buckets matches NW delta (within FX tolerance)

```
delta        = netWorth(toDate) - netWorth(fromDate - 1 day)
sumOfBuckets = income - spending + marketGains + transfers
residual     = delta - sumOfBuckets
|residual|  ≤  max(0.01 * |delta|, 1.00) reportingCcy units
```

`contributions` is a **derived informational metric** for UI display, defined as `Σ amt of investment-side legs of cross-role transfers (signed)`. It is **not** a term in the invariant — cross-role transfers are NW-neutral (the cash-like leg subtracts what the investment leg adds), so adding `contributions` to the sum would double-count. See Example A for the worked derivation that surfaced this.

A residual outside that band gets pushed onto `flags` as `RESIDUAL_OUT_OF_BAND` and the consumer surfaces a warning. The bucket numbers are still returned; this is a *quality* signal, not a hard failure.

The 1% relative / $1 absolute tolerance absorbs FX rounding, the 2-decimal `roundCents` precision, and same-day rate drift. It is generous enough that genuine bookkeeping errors (a missed transfer leg, a deleted tx) will trip it.

### I2. Internal-transfer pairs net to zero

For every `transferId` where both legs are in range AND both accounts are counted AND both have the same role: contribution to every bucket = 0.

### I3. Buckets are non-overlapping

Every transaction lands in exactly zero or one bucket (zero = excluded account, or paired internal transfer). No transaction is ever counted twice.

### I4. FX is applied uniformly

Every amount entering a bucket is converted via `toReportingCurrency(...)` using the *current* rates map. Historical rates are out of scope (see CAR-157 for follow-up). This matches the existing chart behavior.

### I5. Sign discipline

| Bucket | Sign | Meaning |
|---|---|---|
| `income` | positive (magnitude) | always reported as ≥ 0 |
| `spending` | positive (magnitude) | always reported as ≥ 0 |
| `marketGains` | signed | positive = market up |
| `transfers` | signed | residual leakage; ideally 0 |
| `contributions` *(informational)* | signed | positive = net cash into INV/CRY; not in invariant |

The invariant is `income − spending + marketGains + transfers`.

## Edge cases & missing-data behavior

### Out-of-band balance adjustments on INV/CRY

If the user manually edits an investment account's balance (currently not supported in v1 UI but reachable via import), the implementation cannot distinguish "unrecorded market gain" from "user typo." Treat any unexplained balance delta as `marketGains`. This is the right default: it keeps the invariant satisfied and the user can drill in if the number looks wrong.

### Range starts before the account's earliest transaction

`balance(acct, fromDate-1)` falls back to `openingBal` (FX-converted at current rates). Same as `buildNetWorthDailyTrend`. No special-casing needed.

### Range entirely before any transactions exist

All buckets = 0, `delta` = 0. Returns clean zeros, no flag.

### Account opened mid-range

The account's `openingBal` snapshots its state on the day it was opened (per existing convention). Treated as already-present at `fromDate` for attribution purposes. If users actually opened an account mid-range with a non-zero opening balance, that opening balance is a phantom "contribution" the attribution function cannot see. Push `OPENING_BAL_DURING_RANGE` flag if `account.createdAt` (where available) is in `[fromDate, toDate]` AND `openingBal !== 0`. Surface as a warning; do not break.

### Account archived/excluded mid-range

If an account toggles `archived` or `includeInTotals` during the range, attribution uses the current state (per `countedAccount`). The historical balance contribution is not re-derived. Add `ACCOUNT_TOGGLE_DURING_RANGE` flag if any counted account had its toggle changed in range (requires audit trail; if no audit, skip the flag).

### Orphan transfer (peer missing)

If `tx.transferId` is set but no peer with the matching `transferPeer` exists in the data, treat as a single-leg transfer per Transfer rules above (lands in `transfers` bucket with signed amount). Push `ORPHAN_TRANSFER` flag with the offending tx ids.

### Both legs counted but in different roles, mid-range only one leg

E.g., contribution leg falls before `fromDate`, withdrawal leg in range. Withdrawal lands in `contributions` (negative). The historical contribution is implicit in the `fromDate-1` balance. Invariant still holds.

### Cross-currency transfer with rate drift

A `USD CHK → EUR FX` transfer recorded with both legs in their native currencies will have a small mismatch when converted to reporting ccy. This is absorbed by I1's tolerance band. No special handling.

### Same-day pair where one leg has no `transferPeer`

Edge case from older data (pre-bulkOps). Detect by `tx.cat === 'transfer'` AND `!tx.transferId`. Treat as orphan transfer; push `LEGACY_UNPAIRED_TRANSFER` flag.

## Worked examples

### Example A — clean salary + spending month

**Setup:** USD only. CHK 5,000 → 6,500. AMEX −500 → −500 (paid down then re-charged to net zero). VTI 100,000 → 102,200 (2,000 contribution + 200 unrecorded market gain).

**Transactions in range:**

| date | acct | amt | cat | note |
|---|---|---|---|---|
| 2026-04-01 | chk | +4,000 | income/payroll | Salary |
| 2026-04-05 | amex | −200 | dining | Restaurant |
| 2026-04-10 | amex | −300 | shop | Clothing |
| 2026-04-15 | chk | −500 | transfer | (paired) AMEX payment out |
| 2026-04-15 | amex | +500 | transfer | (paired) AMEX payment in |
| 2026-04-20 | chk | −2,000 | transfer | (paired) → VTI contribution |
| 2026-04-20 | vti | +2,000 | transfer | (paired) ← contribution |

**Balance check:**
- ΔCHK = +4,000 − 500 − 2,000 = +1,500 → 5,000 + 1,500 = 6,500 ✓
- ΔAMEX = −200 − 300 + 500 = 0 → −500 + 0 = −500 ✓
- ΔVTI = +2,000 (recorded) + 200 (unrecorded market) = +2,200 → 102,200 ✓
- **`delta` = 1,500 + 0 + 2,200 = +3,700**

**Bucket computation:**
- `income` = 4,000 (the salary tx)
- `spending` = 200 + 300 = 500 (the two AMEX charges)
- `transfers` = 0 (both pairs are intra-cash-like or cross-role *and* both legs are in range and counted, so they net out)
- `marketGains` (VTI residual): balance delta +2,200, minus contributions touching VTI in range +2,000, minus recorded gain/dividend tx 0 → **+200**
- `contributions` (informational) = +2,000 (the VTI side of the CHK→VTI pair)

**Invariant:** 4,000 − 500 + 200 + 0 = **+3,700** = `delta` ✓

### Example B — pure market gain, no activity

VTI 100,000 → 105,000. No transactions. NW delta = +5,000.
- `marketGains` = +5,000 (full residual on VTI account).
- `income` = `spending` = `transfers` = `contributions` = 0.
- Invariant: 0 − 0 + 5,000 + 0 = +5,000. ✓

### Example C — investment withdrawal

VTI 100,000 → 98,000 (after pulling 3,000 cash to CHK; market also gained 1,000).
Transactions: VTI −3,000 transfer (paired), CHK +3,000 transfer (paired).
- VTI balance delta = −2,000. Contributions touching VTI = −3,000. Residual marketGains = −2,000 − (−3,000) = +1,000. ✓
- `contributions` = −3,000 (signed, withdrawal).
- `income` = `spending` = 0. `transfers` = 0 (paired, both counted).
- Invariant: 0 − 0 + 1,000 + 0 = +1,000. NW delta: ΔCHK +3,000 + ΔVTI −2,000 = +1,000. ✓

### Example D — orphan transfer (peer in different range)

January: paired transfer CHK→SAV recorded. Range = February. The Feb side sees only the SAV leg if the user later edited the date on the CHK leg to January. → SAV leg in range, CHK leg outside.
- CHK leg outside range → ignored.
- SAV leg in range, peer not in range → lands in `transfers` bucket (positive, the SAV inflow).
- Invariant absorbs it: NW delta in February will include the SAV inflow in delta; transfers covers it. ✓
- Push `ORPHAN_TRANSFER` flag.

### Example E — cross-currency, FX rate drift

EUR FX account: 1,000 EUR opening. Range covers month where USD/EUR rate moves from 1.08 to 1.10. No transactions. Reporting ccy = USD.
- NW delta in USD = (1,000 × 1.10) − (1,000 × 1.08) = 20.
- But `rates` is "current" so both balances re-evaluated at 1.10: NW delta = 0 in attribution.

This is a spec consequence of "use current rates, not historical." The attribution will under-report rate-drift effects. CAR-157 (effective-date FX) fixes it. For now, `flags` does NOT track this — it's silent and intentional.

## Pseudocode

Reference algorithm. Implementation (CAR-87) may differ in structure but must match the rules and pass the invariant tests.

```
function attributeNetWorthChange(accounts, transactions, fromDate, toDate, rates, reportingCcy = 'USD'):
    counted = accounts.filter(a => !a.archived && a.includeInTotals !== false)
    countedIds = new Set(counted.map(a => a.id))
    isInvestment = (a) => a.type === 'INV' || a.type === 'CRY'
    role = (a) => isInvestment(a) ? 'inv' : 'cash'
    accountById = Map(counted.map(a => [a.id, a]))

    inRange = transactions.filter(tx =>
        countedIds.has(tx.acct) && tx.date >= fromDate && tx.date <= toDate)

    income = 0; spending = 0; transfers = 0; contributions = 0
    flags = []
    seenTransferIds = new Set()
    investmentTxByAcct = Map()  // for marketGains residual

    for tx in inRange:
        amtUsd = toReportingCurrency(tx.amt, tx.ccy, rates, reportingCcy)
        acct = accountById.get(tx.acct)
        isTransfer = tx.cat === 'transfer' || !!tx.transferId

        if isTransfer:
            if !tx.transferId:
                transfers += amtUsd
                flags.push({type: 'LEGACY_UNPAIRED_TRANSFER', txId: tx.id})
                continue
            if seenTransferIds.has(tx.transferId):
                continue  // skip the second leg, already handled
            seenTransferIds.add(tx.transferId)

            peer = inRange.find(t => t.transferId === tx.transferId && t.id !== tx.id)
            if !peer:
                // peer outside range or on excluded account
                transfers += amtUsd
                flags.push({type: 'ORPHAN_TRANSFER', txId: tx.id})
                continue

            peerAcct = accountById.get(peer.acct)
            if !peerAcct:
                transfers += amtUsd  // peer account excluded
                flags.push({type: 'ORPHAN_TRANSFER', txId: tx.id})
                continue

            if role(acct) === role(peerAcct):
                continue  // intra-role pair: NW-neutral, contribute nothing
            else:
                // cross-role: contribute to contributions on the investment side
                invLeg = isInvestment(acct) ? tx : peer
                invAmt = toReportingCurrency(invLeg.amt, invLeg.ccy, rates, reportingCcy)
                contributions += invAmt  // signed
                investmentTxByAcct.add(invLeg.acct, invAmt)
                continue

        // not a transfer
        if isInvestment(acct):
            // direct deposit/withdrawal on INV/CRY without transfer pair
            // treat as contribution
            contributions += amtUsd
            investmentTxByAcct.add(tx.acct, amtUsd)
            continue

        catRoot = (tx.path && tx.path[0]) || tx.cat
        if catRoot === 'income' || (tx.amt > 0):
            income += abs(amtUsd)
        else:
            spending += abs(amtUsd)

    // marketGains = sum over investment accounts of (balance delta − contributions to that account)
    marketGains = 0
    for acct in counted.filter(isInvestment):
        balStart = balance(acct, fromDate - 1 day, transactions, rates, reportingCcy)
        balEnd = balance(acct, toDate, transactions, rates, reportingCcy)
        contribOnAcct = investmentTxByAcct.get(acct.id, 0)
        marketGains += (balEnd - balStart) - contribOnAcct

    delta = netWorth(toDate, accounts, transactions, rates, reportingCcy)
          - netWorth(fromDate - 1 day, accounts, transactions, rates, reportingCcy)
    sumOfBuckets = income - spending + marketGains + transfers
    residual = delta - sumOfBuckets
    if abs(residual) > max(0.01 * abs(delta), 1.00):
        flags.push({type: 'RESIDUAL_OUT_OF_BAND', residual})

    return {
        income, spending, marketGains, transfers,
        contributions,  // informational
        delta, sumOfBuckets, residual,
        flags,
    }
```

`balance(acct, d, ...)` and `netWorth(d, ...)` reuse the existing logic in `charts.mjs` (`buildNetWorthDailyTrend` / `countedAccount` / `toReportingCurrency`). No new infrastructure required.

## Test plan (for CAR-87 implementer)

The spec's invariants and edge cases translate directly into test cases:

1. **I1 unit tests:** for each of the five worked examples, assert `|residual| ≤ tolerance`.
2. **I2 paired-transfer test:** seed two CHK accounts, one paired transfer in-range; assert all buckets = 0.
3. **I3 non-overlap:** for a synthetic dataset, count transactions whose `id` appears in any bucket's source list; expect each tx to appear ≤ 1 time.
4. **Orphan transfer flag:** seed transfer with peer dated outside range; assert `transfers !== 0` and `ORPHAN_TRANSFER` in flags.
5. **Cross-currency tolerance:** seed a USD account and a EUR account with rate change; assert residual within band.
6. **Property test (optional, fast-check):** for random valid (accounts, transactions, range) inputs, assert I1 always holds.
7. **Snapshot test:** run attribution against existing demo data for a few real ranges and snapshot the bucket totals; future regressions caught.

## Open questions (for CAR-87 phase)

These are design choices the spec deliberately defers to the implementation ticket:

- **API shape: pure function vs. hook.** Match the FX module pattern (pure in `attribution.mjs` + `useAttribution()` hook in `store.jsx`)? Likely yes for testability.
- **Reporting cadence in UI.** Per-month bars? Single range total? Current chart uses monthly periods — natural to compute attribution per period and stack-bar the buckets.
- **Drill-down.** Clicking a bucket in the UI should list its source transactions. Function should optionally return `{ income: { total, txIds }, ... }` shape — TBD in CAR-87.
- **Label "marketGains" in UI.** "Market gains" is fine on the up-side; "market loss" on negative? Or just a single label that handles sign? UI copy decision in CAR-87.
- **Stable sort for floating-point reproducibility.** When summing many tx amounts, naive forward sum is fine for v1. Kahan summation if residuals get persistent.

## Follow-up issues to file (when this spec lands)

- **Effective-date FX rates** (already tracked: CAR-157). Eliminates the cross-currency drift caveat documented above.
- **Per-account attribution view.** Drill into one account's contribution to each bucket. Same machinery, just don't aggregate.
- **Investment phase 2: realized vs. unrealized gains.** Cost-basis tracking on INV/CRY. Splits `marketGains` into `realized` + `unrealized`. Out of scope here.
- **Audit-trail for account-toggle changes.** Required to actually emit `ACCOUNT_TOGGLE_DURING_RANGE` flag. Currently flag is documented but unimplemented.

## Acceptance criteria for this spec (CAR-194)

- [x] Inputs documented (accounts, transactions, range, rates, reportingCcy).
- [x] Bucket rules unambiguous and ordered (decision tree).
- [x] Invariant I1 holds across the worked examples.
- [x] Edge cases enumerated with deterministic behavior + flags.
- [x] Pseudocode that an engineer can implement against.
- [x] Test plan that maps spec rules to assertions.
- [x] Cross-references to upstream (CAR-75, CAR-87) and follow-ups (CAR-157).
