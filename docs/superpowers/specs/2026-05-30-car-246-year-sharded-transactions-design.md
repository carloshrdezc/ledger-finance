# CAR-246 — Year-Sharded Transaction Storage: Design & Migration Plan

**Status:** Draft → review
**Date:** 2026-05-30
**Linear:** [CAR-246](https://linear.app/carloshrdezc/issue/CAR-246)
**Implements:** spike only — design and migration plan. Implementation will follow as a separate epic with sub-issues (see §11 *Implementation epic*).
**Dependencies:** none. Once shipped, makes [CAR-245](https://linear.app/carloshrdezc/issue/CAR-245) (off-thread stringify stopgap) obsolete.

## Summary

Shard the transaction list out of the single `store.json` blob into per-year files (`tx/tx-YYYY.json`). Boot loads `store.json` + the current year only. Other years lazy-load on demand and stay cached for the session. Closing balances per `(accountId, year)` are persisted in `store.json` so net-worth-as-of-boot can be computed without loading any historical year.

This is a disk-layout change — no API surface change for the renderer beyond the persistence layer (`store.jsx` + `disk-store.mjs`). All higher-level helpers (`buildNetWorthTrend`, `filterTransactionsForPeriod`, `attributeNetWorthChange`, `buildBudgetRows`, etc.) keep operating on a flat `transactions` array; the persistence layer is responsible for hydrating the right slice and writing back only the affected shards.

## Problem

Today the entire app state — accounts, transactions, bills, budgets, goals, investments, trades, rules, saved views, and the slice2/slice3 security config — lives in a single `store.json` blob written by `src/main/disk-store.mjs:atomicWriteJson`. Every renderer-side state change (`useLS(key, …)`) triggers a 250 ms-debounced write of the *entire* snapshot via the `ledger-db:write` IPC.

`atomicWriteJson` does:
1. `JSON.stringify(state, null, 2)` — synchronous, on the main process event loop. **This is the freeze.**
2. `writeFile` to `store.json.tmp`.
3. `handle.sync()` (fsync the file).
4. `rename(tmp, final)`.
5. `fsyncDir(parent)`.

Stringify cost grows linearly with transaction count. At ~10k transactions the JSON blob is around 1.5 MB (rough: 150 bytes/tx including the FX-rates and category seed). Realistic 5-year usage at ~200 tx/month = 12 000 tx pushes stringify into the multi-hundred-ms range, with the renderer also re-mirroring the full blob to `localStorage` on every `setKey` call. The UI freezes because every `setKey` runs the reducer over the entire snapshot, debounces a 1.5 MB stringify, and React commits dependent memos that re-derive over the same array.

Beyond the perf hit, every write rewrites every byte. A partial-write event (mitigated today by `tmp` + `rename`) replaces *every year's* history. Backups (`buildBackup`, `importExport.js`) round-trip a single multi-MB blob.

The working set in 95% of UI flows is bounded by month or year (`filterTransactionsForPeriod`, `monthKey`, `getRecentPeriods`, `txPeriod`). Sharding by year is the natural cut.

## Goals

1. **Bounded boot working set.** Reading `store.json` + `tx/tx-{currentYear}.json` is O(1 year) regardless of history size. The other years are not parsed until the user navigates to a period that needs them.
2. **Bounded write cost on common edits.** Adding/editing/deleting a transaction in the current year writes one shard (`tx-{currentYear}.json`) plus `store.json` only when `closingBalances` changes (it doesn't, unless the edit straddles a year boundary or rewrites a previous-year tx). The 95% case writes ≤ 1 shard.
3. **Atomicity preserved.** Single-shard writes use the existing `tmp` + `rename` + dir-fsync pattern. Cross-shard writes (transfers across Dec 31 → Jan 1, edits to a prior-year tx that change closing balance) are made consistent via a journal-then-apply pattern (§7 *Atomicity*).
4. **Net-worth at boot is correct without loading every year.** Boot computes `netWorth(today) = Σ_account (openingBal + Σ_year < currentYear closingBalances[year][acct] + Σ_currentYearTx of acct)`. No history shard is read.
5. **Backwards compatibility.** A pre-shard `store.json` is recognized on first launch and one-shot migrated to the sharded layout. The old blob is preserved as `store.json.preshard.YYYYMMDD-HHMMSS.bak` until the user clears it.
6. **Backup and restore parity.** `buildBackup` continues to emit a single self-contained payload (multi-shard internally, single file on disk). Restore writes the shards back in one atomic ceremony (§9).

## Non-goals (this issue)

- Implementation. This is a spike — design only. A throwaway prototype to validate the closing-balance math is acceptable; production code is not.
- List virtualization for the transactions screen — separate `Improvement` issue.
- SQLite migration — rejected as overkill at this volume (year-sharded JSON is already O(1 year) per common operation; SQL would buy index scans we don't need given fully in-memory rendering).
- Sub-year sharding (month, quarter). Year is the natural cut against the existing `monthKey`/`txPeriod` helpers; finer sharding adds bookkeeping without payoff.
- A separate write-thread or worker. The motivating freeze is `JSON.stringify` of the *full* tx array; sharding eliminates the hot path. CAR-245 (off-thread stringify) is a stopgap that becomes obsolete once this lands.

## 1. Disk layout

```
<userData>/ledger/
  store.json                # everything except transactions; small (~50 KB even with rules+savedViews)
  tx/
    tx-2024.json
    tx-2025.json
    tx-2026.json
    ...
  journal/
    pending-{txnGroupId}.json  # cross-shard transaction journal entries (rare; see §7)
```

**`store.json` schema (sharded layout, version 2):**

```jsonc
{
  "schemaVersion": 2,
  "ledger:_migratedToDisk": true,
  "ledger:_shardLayout": "year-v1",
  "ledger:onboarded": true,

  // existing slices, unchanged in shape:
  "ledger:accounts":     [ ... ],
  "ledger:bills":        [ ... ],
  "ledger:goals":        [ ... ],
  "ledger:budgets":      [ ... ],
  "ledger:investments":  [ ... ],
  "ledger:trades":       [ ... ],
  "ledger:catTree":      { ... },
  "ledger:rules":        [ ... ],
  "ledger:savedViews":   [ ... ],
  "ledger:welcomeSeen":  true,

  // NEW: per-(year, account) reporting-currency closing balances. See §3.
  "ledger:closingBalances": {
    "2024": { "chk": -1142.55, "sav": 28614.20, "amex": 188.00, ... },
    "2025": { "chk":  -912.10, "sav": 30518.40, ... }
  },

  // NEW: the set of years for which a tx-{YYYY}.json shard exists.
  // Used by §6 *Reports / multi-year ranges* and §8 *Search* to know what
  // shards exist without an `fs.readdir` round-trip on every period change.
  "ledger:shards": {
    "years": ["2024", "2025", "2026"],
    "earliestTxDate": "2024-01-04",
    "latestTxDate":   "2026-05-14"
  }
}
```

**`tx/tx-{YYYY}.json` schema:**

```jsonc
{
  "schemaVersion": 1,
  "year": "2026",
  "transactions": [
    { "id": "t01", "date": "2026-05-14", "name": "WHOLE FOODS MKT", "acct": "amex",
      "cat": "food", "path": ["food","produce"], "amt": -87.42, "ccy": "USD" },
    { "id": "xfer_seed01_out", "date": "2026-05-04", "name": "TRANSFER → ALLY SAVINGS",
      "acct": "chk", "ccy": "USD", "cat": "transfer", "path": [], "amt": -1000.00,
      "transferId": "xfer_seed01", "transferPeer": "xfer_seed01_in" },
    ...
  ]
}
```

Shard files contain **only** transactions whose `tx.date` parses to the file's year. The `transferPeer` cross-reference may point into another shard for cross-year transfers; see §5.

### Why a separate `tx/` directory

Two reasons:

1. **`fs.readdir(tx/)` is the canonical "what shards exist" query.** Walking a flat `<userData>/ledger/` directory works but mixes shards with `store.json`, journal files, backups, and the slice2/slice3 security config (`store.config.json`, `store.bin`). A dedicated `tx/` dir is unambiguous: every file in it is a shard.
2. **`fsync(parent_dir)` after `rename` is cheaper.** Today `disk-store.mjs:fsyncDir` syncs the directory containing the file. Having shards in `tx/` means writing a shard fsyncs `tx/`, not the parent (which holds `store.json` and other unrelated files). Fewer dirent updates, less write amplification.

## 2. File format and versioning

Both `store.json` and shard files carry a `schemaVersion` integer at top level. The current pre-shard format is implicitly **schema 1** (no version field on `store.json`, transactions live under `ledger:tx`). The sharded layout is **schema 2**.

**Migration trigger.** On boot, `disk-store.mjs:read` examines `store.json`:
- `store.json` has `ledger:tx` array (regardless of `schemaVersion`) → **migrate** (one-shot, see §10).
- `store.json` has `schemaVersion === 2` and `ledger:_shardLayout === "year-v1"` → **already sharded**; load shards normally.
- `store.json` is absent and `tx/` is absent → **fresh install**, write empty schema-2 store on first save.
- `store.json` has `schemaVersion >= 3` → **future format**; refuse to start, prompt user to upgrade the app. (Defensive — protects against a downgrade after a future schema bump.)

**Forward compatibility.** Renderer-side store hydration treats unknown `ledger:*` keys as opaque pass-throughs (existing behaviour — `useLS` only reads keys it knows). Adding new top-level fields to either file is non-breaking. Removing a field requires a migration (rare; security config already follows this discipline).

**Rollback.** §10 *Migration* preserves the pre-shard blob until the user clears it manually. To roll back, the app reads the `.preshard.bak`, deletes `tx/`, deletes `store.json`, and renames the bak back. A "Roll back to pre-shard layout" button in `WebSettings` for the first 30 days post-upgrade is enough; afterwards the bak can be deleted (`Cleanup` button reveals the `.bak`'s size and offers deletion).

## 3. Closing-balance reconciliation

This is the only really subtle bit; get it right or net worth at boot will drift.

### 3.1 Definition

For each `(accountId, year)` pair, `closingBalances[year][accountId]` is the **reporting-currency** value of:

```
Σ tx ∈ tx-{year}.json where tx.acct === accountId
   of toReportingCurrency(tx.amt, tx.ccy ?? account.ccy, ratesAtBoot, 'USD')
```

i.e. the sum of every transaction in that account in that year, converted at the boot-time FX rate. **It is NOT cumulative** — each year stores only that year's net delta. Cumulative balance at end-of-year is `openingBal + Σ_y ≤ year closingBalances[y][acct]`.

This decision matters: storing year-deltas (not cumulative) means an FX-rate update doesn't require rewriting every year's closing balance. Reporting-currency totals are recomputed on the fly at boot from the year-delta closing balances using the current rates: `Σ_y closingBalances[y][acct]` only needs reconversion if the underlying tx ccy ≠ reporting ccy. We solve that by storing closing balances **already in reporting currency** at write time, accepting that a later FX-rate change shifts historical net-worth-as-of-Jan-1 by the rate delta — same as today's behaviour, since today's net-worth-as-of-any-date already converts every historical tx at the *current* rate (`netWorthAttribution.mjs:balanceAsOf` calls `toReportingCurrency(tx.amt, ..., rates, ...)` with current rates, not as-of-then rates).

**Open question: rate-as-of-then vs. rate-as-of-now for closing balances.** CAR-157 (`effective-date-fx-design.md`) addresses time-varying rates for the live tx list. If/when that lands, the closing-balance store can be re-derived from same-day rates and stored as a multi-currency map (`closingBalances[year][acct] = { USD: 30000, EUR: 1316.25, ... }`). For schema v2 we store reporting-currency only and rebuild on FX-rate change (see 3.4).

### 3.2 Computation at write time

When the renderer writes a year shard, the persistence layer:
1. Re-reads the shard's transactions (now the in-memory new state).
2. For each `account.id`, computes `Σ tx.amt where tx.acct === id`, FX-converted to reporting currency at current rates.
3. Stores the result as `closingBalances[year][id]` in `store.json`.
4. Writes both files (sharded write — see §7).

This is O(year-tx-count) per shard write, not O(total-tx-count). For a typical 200-tx year it is microseconds.

### 3.3 Net worth at boot

```
function netWorthAtBoot(state, currentYearShard, accounts, rates):
  return accounts.reduce((sum, a) => {
    if (!countedAccount(a)) return sum
    const opening = toReportingCurrency(a.openingBal, a.ccy, rates, 'USD')
    const priorYears = Object.entries(state.closingBalances)
      .filter(([y]) => Number(y) < currentYear)
      .reduce((s, [, byAcct]) => s + (byAcct[a.id] || 0), 0)
    const currentYearDelta = currentYearShard.transactions
      .filter(tx => tx.acct === a.id)
      .reduce((s, tx) => s + toReportingCurrency(tx.amt, tx.ccy ?? a.ccy, rates, 'USD'), 0)
    return sum + opening + priorYears + currentYearDelta
  }, 0)
```

**Critical:** `priorYears` reads `state.closingBalances` only — no shard files read. `currentYearDelta` walks the already-loaded `currentYearShard`. This is the boot-time fast path.

### 3.4 Reconciliation rules (the subtle bit)

Closing balances must be recomputed in these cases:

| Trigger | What changes | Recompute |
|---|---|---|
| Add tx to year Y | Y's closing balance | Just Y |
| Edit tx amount/account/ccy in year Y | Y's closing balance | Just Y |
| Delete tx in year Y | Y's closing balance | Just Y |
| Move tx between dates within year Y | nothing (date doesn't affect closing) | nothing |
| Move tx from year Y → year Z | both Y and Z change | Y and Z |
| Add cross-year transfer (Dec 31 → Jan 1) | both years' shards change | both years |
| FX rate change (CAR-75 user refresh) | every year's reporting-ccy closing balance shifts | **all years** — but lazily; see below |
| Account's `openingBal` edited | nothing in shards/closing balances | nothing — opening is read live from `accounts[]` |
| Account archived / `includeInTotals` toggled | nothing | nothing — filter applied at read time |

**FX-rate change.** A rate refresh shifts every year's closing balance (because they're stored in reporting currency). Rather than rewriting every shard on rate change, we:

1. Mark `state.closingBalances._fxStale = true` and persist `state.ratesAtClosingTime = { USD: 1, EUR: 0.92, ... }` (the rates that *were* in effect when closing balances were last written).
2. At boot, if `_fxStale === true` OR if `ratesAtClosingTime !== currentRates`, lazily rebuild closing balances from shards. This requires reading every shard once, which is the same work as today's load-everything boot path — but only happens after a rate refresh. Once rebuilt, future boots are O(1 year) again.
3. Alternative for low-friction: rebuild on first idle frame after rate change, in the background, write to disk. User never blocks.

This is a deliberate tradeoff: FX rate refreshes are user-triggered and infrequent (CAR-75 docs say weekly is the expected cadence). The post-refresh boot pays a one-time full-history walk; subsequent boots are bounded.

### 3.4.1 Edit-an-old-tx flow (worked example)

User in May 2026 opens the transactions screen, sets date filter = 2024, finds an old tx with the wrong amount, edits it.

1. Renderer dispatches `updateTx(id, { amt: -newAmount })`.
2. Persistence layer detects `tx.date` parses to year 2024, which is **not the current year**. Two sub-cases:
   - **Shard 2024 already loaded** (the date filter loaded it; §6) — `setKey('ledger:tx', updater)` runs the updater on the in-memory flat array; persistence writes `tx-2024.json` (only that shard) and recomputes `closingBalances[2024]` because amount changed. `store.json` is rewritten with the updated `closingBalances[2024]`.
   - **Shard 2024 not loaded** — should not happen because the user must have loaded it to see the row. Defensive: if it does, refuse the edit and re-trigger the date-filter shard load before retrying.
3. The 2024 closing-balance change cascades into net-worth-as-of-2024-12-31 displayed on the Reports screen. No other shards need rewriting because `closingBalances[Y]` is the year-delta, not cumulative.
4. Charts re-render: `buildNetWorthTrend` is called with the updated transaction list and recomputes period values. Only the 2024-and-later periods change; pre-2024 net-worth is unaffected.

## 4. Renderer-side persistence layer

### 4.1 Today (pre-shard)

`store.jsx` keeps a single `snapshot` object containing every `ledger:*` key. `useLS(key, def)` reads `snapshot[key]` and returns a setter that updates the snapshot, mirrors to `localStorage`, and debounces a full-snapshot write to `ledgerDB.write` (which calls `ledger-db:write` IPC → `disk-store.mjs:atomicWriteJson`).

### 4.2 Sharded layer (proposed)

The renderer-facing API stays identical: `useLS('ledger:tx', [])` still returns a flat transaction array. The change is internal:

- `StoreProvider` initially loads `store.json` + the **current year shard** synchronously at boot.
- `snapshot['ledger:tx']` is the **union** of all currently-loaded shards' transactions, deduped by `id`. At boot it contains only the current year.
- A new `loadShardForYear(year)` Promise hydrates a non-current year on demand and merges its transactions into `snapshot['ledger:tx']`. Memoized so a year is loaded at most once per session. See §6 for triggers.
- A new `loadedShards: Set<string>` tracks which years are present in the in-memory `ledger:tx`.
- `setKey('ledger:tx', updater)` invokes a custom write path (not the generic snapshot writer): it diffs the previous flat array against the new one to determine **which year shards are dirty**, updates `closingBalances` for each dirty year, and writes only those shards plus `store.json`.

### 4.3 New IPC surface

`preload/index.js` exposes today: `ledgerDB.read()`, `ledgerDB.write(state)`, `ledgerDB.flush()`. Sharded layer adds:

```ts
interface LedgerDB {
  // unchanged signatures, new behaviour:
  read(): Promise<{
    store: object;                   // store.json contents minus ledger:tx
    currentYearShard: object | null; // tx-{currentYear}.json contents, null if absent
  }>;
  flush(): Promise<void>;

  // NEW:
  loadShard(year: string): Promise<{ year: string; transactions: object[] }>;
  writeShards(payload: {
    store: object;        // updated store.json (with refreshed closingBalances + shards index)
    shards: { [year: string]: object[] };  // year → tx array; only dirty years
  }): Promise<void>;
  listShards(): Promise<string[]>;        // years for which a shard file exists
}
```

`writeShards` accepts the *whole* updated `store.json` plus a partial map of `{ year → transactions[] }` for dirty years. The main process writes each in turn using the existing atomic-write helper. The renderer can call `writeShards` with `shards: {}` if only `store.json` changed.

### 4.4 Dirty-shard detection

When `setKey('ledger:tx', updater)` runs, the layer compares the new array to the previous and computes the set of dirty years:

```js
function dirtyYears(prevTxs, nextTxs) {
  const prevById = new Map(prevTxs.map(t => [t.id, t]));
  const dirty = new Set();
  for (const next of nextTxs) {
    const prev = prevById.get(next.id);
    if (!prev) {
      dirty.add(year(next.date));
    } else if (prev !== next) {
      // shallow ref change is enough — bulk ops produce new objects
      dirty.add(year(next.date));
      if (year(prev.date) !== year(next.date)) dirty.add(year(prev.date));
    }
    prevById.delete(next.id);
  }
  for (const removed of prevById.values()) {
    dirty.add(year(removed.date));
  }
  return dirty;
}
```

This is O(prevTxs + nextTxs) per save, not O(prevTxs × nextTxs), and runs in the renderer (no IPC). For typical edits (one row touched) it returns a single year and persistence writes one shard.

**Edge case:** `bulkOps.mjs:convertToTransferInArray` synthesizes new tx objects with new `id`s for the transfer legs. `dirtyYears` correctly marks both legs' years as dirty (one or two distinct years).

### 4.5 Hydration race

The boot-time effect in `StoreProvider` already merges synchronous initial state (read from `localStorage`) with disk state and prefers in-flight user changes (the `userChanges` diff). The sharded version preserves the same logic, scoped to the loaded shards: `userChanges` for `ledger:tx` only includes transactions in already-loaded years, so no race exists for non-loaded years.

If a user makes a tx edit during boot (rare; boot is < 100 ms typically), and the edit happens to touch a year that hasn't loaded yet, the rule is: **the boot reader merges shards in, then re-applies the user edit** (which is held in `userChanges`). The dirty-shard detector marks both years (the new year and the old year if it moved) and writes them.

## 5. Cross-year operations

### 5.1 Transfers spanning Dec 31 → Jan 1

Today, transfers (`bulkOps.mjs:convertToTransferInArray`, `addTransfer` in `store.jsx`) create two legs sharing a `transferId`. Both legs are written together as part of the same `setTxs(prev => [...prev, outLeg, inLeg])` update. They share the *same date* in 95% of cases, so they live in the same shard and there's no cross-year wrinkle.

The 5% case: a user manually edits one leg's date such that the two legs land in different years — say, an `out` leg dated `2025-12-31` and an `in` leg dated `2026-01-02` (real, e.g. wire transfers that cleared the next business day). Then:

- **Both legs reference each other** via `transferPeer`. The peer reference may now point into a different shard.
- Reading: when shard 2025 is loaded, `xfer_seed01_out` is in scope; its `transferPeer === 'xfer_seed01_in'` points into shard 2026. The renderer needs both shards loaded to render the transfer pair.
- Writing: editing one leg requires writing both shards (because closing balances change in both years).
- The dirty-shard detector handles this naturally — moving a tx from year Y to year Z marks both years dirty (§4.4).

**Rule:** the persistence layer detects "this update touches a transfer whose peer is in another shard" by walking the modified transactions and looking for `transferId` whose peer has a date in a year ≠ the modified leg's year. If detected:

1. Load both years' shards (if not already loaded — usually a no-op since the user is editing from a screen that loaded them).
2. Use the cross-shard journal pattern in §7.

### 5.2 Reports spanning multiple years (1Y, MAX, year-over-year)

Charts and reports that compute series for `[fromDate, toDate]` ranges spanning multiple years (`buildNetWorthTrend(accounts, transactions, periods)` where `periods` includes months from different years) need every relevant shard loaded.

Trigger points (see §6): when the user picks a `1Y`, `MAX`, `last12`, `lastYear`, or custom-range that spans more than the current year, the renderer calls `loadShardsForRange(start, end)`, which `await`s every needed shard via `loadShard(year)` (parallelizable). Once loaded, `transactions` (the in-memory union) contains everything; the existing helpers compute as before.

### 5.3 Boot net-worth without loading every year (revisited)

For the **dashboard sparkline** (`buildNetWorthDailyTrend(accounts, transactions, todayIso, 30, rates)` — 30 days only) and the **dashboard net-worth number**, only the current year's shard is needed because the trend only walks back 30 days from today and `state.closingBalances` provides every prior year's contribution.

If the dashboard configuration shows >365-day windows, the dashboard triggers a lazy load like the reports screen.

## 6. Lazy load triggers and search strategy

### 6.1 When to load a non-current shard

| Trigger | Years loaded |
|---|---|
| Boot | current year only |
| User picks period in past year (period switcher, prev arrow, command palette) | the picked period's year |
| Reports screen opens with `trendPeriods` covering older years | every year in the trend window |
| User sets a date filter on Transactions (`txFilter.date`) | the filter date's year |
| User imports a backup whose tx span multiple years | every year in the backup, all at once |
| **User searches** in the transactions screen text input | see §6.3 below |
| Net-worth attribution opens for a range covering older years | every year in the range |

A loaded shard stays in memory for the rest of the session. We do **not** evict — even 10 years × 200 tx/month × 150 bytes ≈ 3.5 MB, trivial. Eviction would just trigger reloads on revisit.

### 6.2 Optimistic prefetch on idle

After boot, on `requestIdleCallback`, prefetch the prior year's shard. Most Reports views show "last 12 months", which always crosses one year boundary. Prefetching prior-year on idle removes the chart-render hitch when the user opens Reports.

### 6.3 Search strategy

Today the transactions screen has a text input that filters on `tx.name.toLowerCase().includes(q) || (tx.cat || '').includes(q)`. Source defaults to `periodTransactions` (current period only) UNLESS `txFilter.date` is set, in which case source is the full `transactions` array.

**Decision: load-all-shards-on-first-search, cached for the session.**

Rationale:
- A merchant/category index would need to be maintained on every tx mutation, doubled bookkeeping for marginal value.
- Search is user-initiated and infrequent; the cost of "first search loads 4-9 shards in parallel" is acceptable, especially with optimistic prior-year prefetch.
- The flat in-memory tx array stays the renderer's source of truth — every existing helper (`fuzzy.mjs:matchAndRank`, future search refinements, the command palette) just works.

UX: when the user types in the search input on the transactions screen and shards are missing, show a tiny "loading history…" hint inline (no spinner overlay) until shards arrive. Most of the time the user is searching the current period and there's no wait.

If we ever ship full-text search across all fields (currently we don't — only `name` and `cat`), revisit and consider an inverted index.

### 6.4 Period switcher prev/next

The period chevrons (`<` `>`) on Dashboard / Reports / Budgets often walk one period back. Pre-fetch the *prior* year on idle (§6.2) means most prev clicks have the shard ready. If not, the await is 5-20 ms for a JSON parse — trivial.

## 7. Atomicity

### 7.1 Single-shard write (the 95% case)

`writeShards({ store, shards: { '2026': txs } })` writes:
1. `tx-2026.json.tmp` ← stringify(`{schemaVersion:1, year:'2026', transactions: txs}`); `handle.sync()`; close.
2. `rename(tx-2026.json.tmp, tx-2026.json)`; `fsyncDir(tx/)`.
3. `store.json.tmp` ← stringify(updated store with refreshed `closingBalances[2026]`); `handle.sync()`; close.
4. `rename(store.json.tmp, store.json)`; `fsyncDir(parent)`.

If a crash happens between steps 2 and 4, `tx-2026.json` and `store.json` disagree on closing balance. **This is recoverable on next boot:** when boot reads the current-year shard, it always recomputes `closingBalances[currentYear]` from the shard's contents and compares against `store.json`. If they differ, the shard wins (it was written more recently, since order is shard-then-store) and `store.json` is rewritten.

### 7.2 Multi-shard write (cross-year transfer, prior-year edit)

When `dirtyYears(prev, next).size > 1`, we have a cross-shard write. Naive sequential writes risk partial application. The journal pattern:

1. Renderer assembles the full update payload: `{ store: updatedStoreJson, shards: { '2025': [...], '2026': [...] } }`.
2. Write `journal/pending-{txnGroupId}.json` with the full payload + a `committed: false` marker. fsync. This is the "intent log."
3. Write each shard via `tmp` + `rename` + `fsyncDir(tx/)` in dirty-year order.
4. Write `store.json` via `tmp` + `rename` + `fsyncDir(parent)`.
5. Delete `journal/pending-{txnGroupId}.json`.

On boot:
- If any `journal/pending-*.json` files exist, the boot path replays them: re-applies each pending payload (idempotent since shards are recompute-from-scratch), then deletes the journal entry. Rare — only after a crash mid-multi-shard-write.
- If a journal exists but the payload's `txnGroupId` matches a tx already present in the relevant shards (i.e. write completed but journal cleanup didn't), the replay is a no-op rewrite.

`txnGroupId` is a fresh UUID per multi-shard write, not tied to `transferId`. It's purely a journal-entry name.

### 7.3 Why not 2-phase commit per shard

A full 2PC would require shard-side prepare/commit markers. The journal pattern is simpler:
- The journal IS the atomic write (single-file `tmp`+`rename`).
- Replays are idempotent because every shard write is a full overwrite, and `closingBalances` is fully derivable from shard contents.
- Crash window: the only inconsistency is "shard A is new but shard B is old and store.json is old"; replay overwrites both with the journal's payload, restoring consistency.

### 7.4 Concurrent writes

The existing `disk-store.mjs` enqueues writes via `tail = tail.then(task, task)` — they serialize. The sharded layer keeps the same queue: `writeShards` is a single enqueue that internally writes multiple files in sequence under one task. No interleaving with another `writeShards` call.

`flush()` awaits the queue's tail, same as today.

## 8. Backwards compatibility — boot reading old format

`disk-store.mjs:read` (post-shard) reads `store.json` and inspects:

```js
function classifyStore(store) {
  if (!isPlainObject(store) || Object.keys(store).length === 0) return 'fresh';
  if (store.schemaVersion === 2 && store['ledger:_shardLayout'] === 'year-v1') return 'sharded';
  if (Array.isArray(store['ledger:tx'])) return 'preshard';
  if (store.schemaVersion >= 3) return 'future';
  return 'unknown';
}
```

- `'fresh'` → return empty store, empty current-year shard.
- `'sharded'` → return store + load `tx/tx-{currentYear}.json` (may not exist if user has no current-year tx → return empty shard).
- `'preshard'` → trigger one-shot migration (§10), then return as `'sharded'`.
- `'future'` → throw. Renderer surfaces a "this app version is older than your data — please update" modal.
- `'unknown'` → log warning, treat as `'fresh'` and rename the unparseable `store.json` to `store.json.unrecognized.{ts}.bak` so the user can recover.

## 9. Backup and restore

### 9.1 `buildBackup`

Today's `buildBackup` (`src/renderer/backup.mjs`) returns a single JSON object containing every `ledger:*` slice. Sharded layer extends:

```jsonc
{
  "version": "ledger-backup-v2",
  "exportedAt": "2026-05-30T12:00:00Z",
  "schemaVersion": 2,
  "store": { /* store.json minus closingBalances and shards index — those are derived */ },
  "transactionsByYear": {
    "2024": [ ... ],
    "2025": [ ... ],
    "2026": [ ... ]
  }
}
```

The backup file is still a single JSON file (one download/upload). The shard structure is encoded inside it.

### 9.2 Restore

Restore from backup is a **wholesale replace**:
1. Validate the backup envelope.
2. Compute `closingBalances` from `transactionsByYear` (re-derive — never trust the input).
3. Compute `shards.years`, `earliestTxDate`, `latestTxDate`.
4. Use the journal pattern (§7.2) to write `store.json` + every shard atomically.
5. Delete shard files for years not in the backup (clean slate).

Restore from a v1 (pre-shard) backup is identical to the migration in §10: parse `ledger:tx` into per-year buckets, derive closing balances, write sharded layout.

### 9.3 Backup auto-reminder

The backup-reminder logic (CAR-77) is unaffected — `lastBackupAt` lives in `store.json` already and the reminder timer doesn't care about shape.

## 10. One-shot migration

### 10.1 Trigger

On boot, `disk-store.mjs:read` returns `'preshard'`. The renderer's `StoreProvider` boot effect detects this via the new shape (the read returns a single envelope `{ classification, store, currentYearShard }`), shows a brief "Migrating data — one moment…" overlay, and dispatches a migration IPC.

### 10.2 Algorithm (main process)

```js
async function migratePreshardToSharded(filePath) {
  const old = await readJsonFile(filePath);  // pre-shard store.json
  const txs = Array.isArray(old['ledger:tx']) ? old['ledger:tx'] : [];

  // 1. Bucket by year.
  const byYear = new Map();
  for (const tx of txs) {
    if (!tx?.date || typeof tx.date !== 'string') continue;
    const y = tx.date.slice(0, 4);
    if (!/^\d{4}$/.test(y)) continue;  // defensive — date migration ran in CAR-91
    if (!byYear.has(y)) byYear.set(y, []);
    byYear.get(y).push(tx);
  }

  // 2. Derive closingBalances from txs + accounts.
  const accounts = Array.isArray(old['ledger:accounts']) ? old['ledger:accounts'] : [];
  const rates = old['ledger:fxRates']?.rates || { USD: 1 };
  const closingBalances = {};
  for (const [year, yearTxs] of byYear) {
    closingBalances[year] = {};
    for (const a of accounts) {
      const sum = yearTxs
        .filter(tx => tx.acct === a.id)
        .reduce((s, tx) => s + toReportingCurrency(tx.amt || 0, tx.ccy ?? a.ccy, rates, 'USD'), 0);
      closingBalances[year][a.id] = round2(sum);
    }
  }

  // 3. Build new store.json.
  const newStore = {
    ...old,
    schemaVersion: 2,
    'ledger:_shardLayout': 'year-v1',
    'ledger:closingBalances': closingBalances,
    'ledger:shards': {
      years: [...byYear.keys()].sort(),
      earliestTxDate: txs.reduce((m, t) => !m || t.date < m ? t.date : m, null),
      latestTxDate:   txs.reduce((m, t) => !m || t.date > m ? t.date : m, null),
    },
  };
  delete newStore['ledger:tx'];

  // 4. Backup the old file.
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  await rename(filePath, `${filePath}.preshard.${ts}.bak`);

  // 5. Write all shards + new store via the multi-shard journal pattern (§7.2).
  await writeShardsAtomic({
    store: newStore,
    shards: Object.fromEntries(byYear),
  });
}
```

### 10.3 Properties

- **Idempotent.** Running the migration twice with the same input produces the same output. If the user copies an old `.bak` back over `store.json`, migration runs again and yields the same shards.
- **Loss-resistant.** The `.preshard.{ts}.bak` is preserved until the user manually deletes it. Even after a successful migration, the original is recoverable for 30+ days (per §2 *Rollback*).
- **Bounded time.** O(total tx count). 12 000 tx ≈ 50-100 ms for the bucket-and-stringify pass. Single-frame migration overlay is sufficient; no progress bar needed at this scale.
- **Tested on a real snapshot before shipping.** Migration tooling sub-issue (§11) requires a test with a 10 k-tx synthetic snapshot AND a fixture from Carlos's actual `store.json` (sanitized) before shipping.

### 10.4 Failure modes

| Failure | Effect | Recovery |
|---|---|---|
| Crash after rename to `.bak`, before any shard written | `store.json` is gone, `.bak` exists | Boot detects "no store.json, .bak present" → renames bak back, retries migration. |
| Crash mid-shard-write | Some shards written, some not | Boot detects journal entry → replays (§7.2). |
| Crash after shards written, before new store.json | Shards exist, store.json missing → looks like fresh install | Boot detects "shards exist but no store.json" → reads shards, rebuilds store.json from `.bak`'s non-tx fields + recomputed closingBalances. |
| Disk full mid-migration | First-shard `tmp` write fails | Restore `.bak` to `store.json`, surface error toast, abort migration. App continues in pre-shard mode (no harm done). |

The "shards exist but no store.json" case is rare but the recovery is well-defined: walk `tx/`, parse each shard, re-bucket, rederive closing balances, and combine with the `.bak` to write a fresh `store.json`. (The migration code can call this "recovery rebuild" and it's the same code path as restore-from-backup.)

## 11. Implementation epic — sub-issues

The implementation epic should split into these sub-issues, ordered by dependency:

1. **CAR-XXX: Disk-store API for sharded layout** (foundation)
   - Update `src/main/disk-store.mjs` to expose `read()` returning `{ classification, store, currentYearShard }`, plus `loadShard(year)`, `writeShards(payload)`, `listShards()`.
   - Internal: extract shared `atomicWriteJson` helper, introduce journal write/replay helpers.
   - Tests: unit tests covering single-shard write, multi-shard write, journal replay, classify-old-vs-new-store, missing-shard handling.

2. **CAR-XXX: Migration tooling and tests**
   - Implement `migratePreshardToSharded`.
   - Test on a 10 k-tx synthetic fixture + Carlos's sanitized real-data fixture.
   - Test `.bak` preservation, rollback, recovery from each failure mode in §10.4.

3. **CAR-XXX: Renderer persistence layer (loadShard / writeShards plumbing)**
   - Update `src/renderer/store.jsx` to track `loadedShards`, expose `loadShardForYear`, route `setKey('ledger:tx', …)` through dirty-shard detection + `writeShards`.
   - Update `preload/index.js` IPC bridge.
   - Tests: persistence unit tests for dirty-year detection, cross-year transfer write, current-year vs. prior-year edit, hydration race.

4. **CAR-XXX: Boot path — load store.json + current year only**
   - Wire `StoreProvider` to call the new `read()` shape and seed `snapshot['ledger:tx']` with current-year shard only.
   - Net-worth at boot uses `closingBalances` (verify via test: zero non-current shards loaded after boot).

5. **CAR-XXX: Lazy load on period change + idle prefetch**
   - `loadShardForYear` triggers in: period switcher, Reports trend window, date filter, txFilter.date, attribution range pickers.
   - Idle prefetch of prior year on boot.
   - Tests: simulate period nav and assert which shards load when.

6. **CAR-XXX: Closing-balance reconciliation**
   - Compute on every shard write.
   - Lazy rebuild on FX-rate change (mark stale, rebuild in idle frame, write back).
   - Boot-time consistency check (shard wins over `store.json` per §7.1).
   - Tests: edit-old-tx flow, FX-rate-change flow, multi-currency account flow.

7. **CAR-XXX: Cross-year transfer handling**
   - Verify transferPeer cross-shard load.
   - Use journal pattern for the write.
   - Tests: Dec-31-Jan-1 transfer, edit one leg, delete one leg, convert-existing-pair-to-transfer across years.

8. **CAR-XXX: Search across all shards**
   - On first search input keystroke, kick `loadShardsForRange(earliest, latest)` (parallel `loadShard`).
   - Show inline "loading history…" hint while pending.
   - Tests: search before shards load, search after, command palette period-jump.

9. **CAR-XXX: Backup format v2 + restore**
   - `buildBackup` emits `transactionsByYear` map.
   - Restore re-derives closing balances, writes journal-style.
   - Backwards compat: restore from v1 backup runs the migration logic.
   - Tests: round-trip a v1 backup, round-trip a v2 backup, restore from cross-version.

10. **CAR-XXX: Settings UI — rollback button + bak cleanup**
    - "Roll back to single-file layout" button (prominent for 30 days post-upgrade, then less prominent).
    - "Clean up legacy backup" reveals `.preshard.bak` size and offers deletion.

Testing across the epic includes property-based tests for `closingBalances ↔ transactions` round-trip consistency, a stress test inserting 50 k tx and asserting boot < 200 ms with 10 years of history, and integration tests that drive the renderer's lazy load triggers via Vitest + jsdom.

## 12. Open questions

1. **FX-rate change cost.** Lazy rebuild after rate change (§3.4) means the next boot pays a one-time full-shard walk. For 50 k tx that could be ~500 ms. Acceptable, or should we rebuild eagerly in a worker after rate update so boot stays bounded? Lean: lazy is simpler; revisit if telemetry shows post-rate-update boots dominate.
2. **Per-currency closing balances vs. reporting-currency.** Storing `closingBalances[year][acct] = { USD: ..., EUR: ... }` (per-original-currency) eliminates the FX-rate-change rebuild entirely. Cost: schema bump and slightly more bytes. Lean: defer to schema v3 if/when CAR-157 lands; v2 ships reporting-currency only.
3. **Year boundary edge: timezone.** `tx.date` is a naive `'YYYY-MM-DD'` string today, no TZ. Year extraction is just `tx.date.slice(0, 4)`. If/when we add TZ-aware dates, sharding bucket becomes "the date as displayed to the user," not "UTC midnight." For v2 we keep naive strings — same as the rest of the app.
4. **Rule-derived txs (recurring bills, goal contributions).** `createRecurringPayment` synthesizes future-dated tx objects in `setTxs(prev => [...prev, tx])`. If a generated tx is dated next year, it's correctly bucketed into next year's shard, but next year's shard may not exist yet. Trivial: `writeShards` creates missing shard files on demand.
5. **Schema evolution.** When we eventually need a v3 (e.g., per-currency closing balances per Q2), do we migrate eagerly at boot or lazily on first write? Lean: eager, like the v1→v2 path here. The cost scales with history once.
6. **Per-shard compression.** Shards are JSON; gzip would cut size 3-4×. Trade-off: complexity + lose human-readability for tiny disk savings. Skip for v2; revisit if storage ever matters.
7. **Stress test target.** Carlos doesn't have 50 k tx today. Set a target of "boot < 200 ms with 10 years × 200 tx/month = 24 k tx" for the implementation epic's perf bar. Adjust if real-world data exceeds.

## 13. Validation prototype

Before the implementation epic begins, a throwaway prototype validates the closing-balance math (the only really subtle piece). The prototype:

1. Loads a real `store.json` snapshot (sanitized).
2. Splits transactions by year into in-memory buckets.
3. Computes closing balances per year per account.
4. Computes net worth using the new fast-path formula (§3.3).
5. Computes net worth using the existing `buildNetWorthDailyTrend` walk over the full tx list.
6. Asserts the two values match within $0.01 per account, per year-end.

If they match, the closing-balance contract is solid. If they don't, the FX-conversion ordering or transfer accounting needs another pass. The prototype is throwaway — its only output is a `pass/fail` report on the issue, not production code.

## 14. Acceptance criteria for this spike

- [x] Spec written and committed to `docs/superpowers/specs/2026-05-30-car-246-year-sharded-transactions-design.md`.
- [ ] Spec reviewed by Carlos and approved before any implementation issue is started.
- [ ] Throwaway closing-balance prototype runs against a real-data snapshot and passes (§13).
- [ ] Implementation epic (CAR-XXX umbrella) created with the 10 sub-issues from §11, each carrying acceptance criteria derived from the relevant spec section.

## 15. References

- `src/main/disk-store.mjs` — current persistence layer (atomicWriteJson, fsyncDir, queue).
- `src/renderer/store.jsx` — `StoreProvider`, `useLS`, `flushPendingWrite`, `pagehide` durability handler.
- `src/renderer/period.mjs` — `monthKey`, `addMonths`, `filterTransactionsForPeriod`, `getPeriodBoundaries`, `resolveRangePreset` — period helpers that already implicitly bucket by year.
- `src/renderer/charts.mjs` — `buildNetWorthTrend`, `buildNetWorthDailyTrend`, `buildIncomeExpenseSeries`, `getRecentPeriods` — chart helpers that walk full tx list today.
- `src/renderer/netWorthAttribution.mjs` — `balanceAsOf`, `attributeNetWorthChange` — attribution math; consumes flat tx array, no internal year awareness.
- `src/renderer/bulkOps.mjs` — `convertToTransferInArray`, `updateTxsIndividuallyInArray` — bulk operations that produce new tx objects (compatible with dirty-shard detection by ref change).
- `src/renderer/backup.mjs` — `buildBackup` — backup envelope (will become v2).
- `src/renderer/data.js` — demo data including the seed transfer pair (`xfer_seed01_out` / `xfer_seed01_in`) showing the `transferId` + `transferPeer` shape.
- CAR-91 (durable quit), CAR-75 (FX rates), CAR-157 (effective-date FX), CAR-77 (backup/restore), CAR-194 (net-worth attribution) — all interact with this design without conflict.
