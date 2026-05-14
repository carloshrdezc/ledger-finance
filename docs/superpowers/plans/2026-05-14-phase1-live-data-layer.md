# Phase 1 — Live Data Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace static hardcoded account balances with values computed live from transactions, fix the lossy date format, and upgrade the Money Manager importer to read real accounts and full dates.

**Architecture:** `data.js` becomes seed-only (no derived constants). `store.jsx` gains an `accounts` state with an `accountsWithBalance` memo that computes live balances. All screens switch from importing statics to reading from the store. The MMBAK importer is upgraded to parse Money Manager's ACCOUNT table and return full ISO dates.

**Tech Stack:** React 19, Vite, Electron, sql.js (WASM), localStorage via `useLS`.

**Note:** No test framework is configured. Each task ends with a manual verification step using `npm run dev`.

---

## File Map

| File | Change |
|------|--------|
| `src/renderer/data.js` | Remove `bal`/`delta` from ACCOUNTS, add `openingBal`; replace `d: number` with `date: string`; remove derived constants |
| `src/renderer/store.jsx` | Add `accounts` state + `accountsWithBalance` memo; migration shim; updated dedup key |
| `src/renderer/importExport.js` | Full ISO dates; ACCOUNT table reading; linked transaction accounts |
| `src/renderer/components/ImportExport.jsx` | Handle accounts in import/export |
| `src/renderer/screens/mobile/Transactions.jsx` | Group by `tx.date` |
| `src/renderer/screens/mobile/Home.jsx` | Live hero metrics from store |
| `src/renderer/screens/mobile/Accounts.jsx` | Live balances from store |
| `src/renderer/screens/web/Dashboard.jsx` | Live NET_WORTH and accounts |
| `src/renderer/screens/web/WebAccounts.jsx` | Live balances from store |
| `src/renderer/screens/mobile/DetailScreens.jsx` | Account lookups from store |

---

## Task 1: Update `data.js` — dates and opening balances

**Files:** Modify `src/renderer/data.js`

- [ ] **Step 1: Replace the ACCOUNTS array**

Remove `bal` and `delta` fields; add `openingBal` (back-calculated so `openingBal + sum(acct transactions)` equals the original hardcoded balance):

```js
export const ACCOUNTS = [
  { id: 'chk',  name: 'CHASE CHECKING',   type: 'CHK', code: '··4218', openingBal:  -1223.33, ccy: 'USD' },
  { id: 'sav',  name: 'ALLY SAVINGS',     type: 'SAV', code: '··9931', openingBal:  24618.00, ccy: 'USD' },
  { id: 'amex', name: 'AMEX PLATINUM',    type: 'CC',  code: '··1009', openingBal:    150.46, ccy: 'USD' },
  { id: 'csp',  name: 'CHASE SAPPHIRE',   type: 'CC',  code: '··7720', openingBal:    453.40, ccy: 'USD' },
  { id: 'vti',  name: 'VANGUARD VTI',     type: 'INV', code: 'BROK',   openingBal: 187201.00, ccy: 'USD' },
  { id: '401k', name: 'FIDELITY 401(K)',  type: 'INV', code: 'IRA',    openingBal:  92140.00, ccy: 'USD' },
  { id: 'btc',  name: 'COINBASE BTC',     type: 'CRY', code: '0.612',  openingBal:  42180.00, ccy: 'USD' },
  { id: 'eur',  name: 'WISE EUR',         type: 'FX',  code: 'EUR',    openingBal:   1316.25, ccy: 'EUR' },
];
```

- [ ] **Step 2: Replace the TRANSACTIONS array**

Replace all `d: N` offsets with `date: "YYYY-MM-DD"` (offsets relative to 2026-05-14):

```js
export const TRANSACTIONS = [
  { id: 't01', date: '2026-05-14', name: 'WHOLE FOODS MKT',     acct: 'amex', cat: 'food',   path:['food','produce'],                   amt:  -87.42, ccy: 'USD' },
  { id: 't02', date: '2026-05-14', name: 'BLUE BOTTLE COFFEE',  acct: 'csp',  cat: 'dining', path:['dining','cafe'],                    amt:   -6.50, ccy: 'USD' },
  { id: 't03', date: '2026-05-14', name: 'UBER · DOWNTOWN',     acct: 'csp',  cat: 'trans',  path:['trans','rideshare'],                amt:  -18.20, ccy: 'USD' },
  { id: 't04', date: '2026-05-13', name: 'NETFLIX',             acct: 'chk',  cat: 'subs',   path:['subs','media'],                     amt:  -15.49, ccy: 'USD' },
  { id: 't05', date: '2026-05-13', name: 'TARTINE BAKERY',      acct: 'csp',  cat: 'dining', path:['dining','cafe'],                    amt:  -22.10, ccy: 'USD' },
  { id: 't06', date: '2026-05-12', name: 'PG&E ELECTRIC',       acct: 'chk',  cat: 'bills',  path:['bills','elec'],                     amt: -112.00, ccy: 'USD' },
  { id: 't07', date: '2026-05-12', name: 'SPOTIFY FAMILY',      acct: 'amex', cat: 'subs',   path:['subs','media'],                     amt:  -16.99, ccy: 'USD' },
  { id: 't08', date: '2026-05-11', name: 'PAYROLL · STRIPE',    acct: 'chk',  cat: 'income', path:['income','payroll'],                 amt: 6840.00, ccy: 'USD' },
  { id: 't09', date: '2026-05-11', name: 'TRADER JOES',         acct: 'amex', cat: 'food',   path:['food','pantry'],                    amt:  -54.80, ccy: 'USD' },
  { id: 't10', date: '2026-05-10', name: 'BART · EMBARCADERO',  acct: 'csp',  cat: 'trans',  path:['trans','transit'],                  amt:   -4.40, ccy: 'USD' },
  { id: 't11', date: '2026-05-10', name: 'AMAZON · 4 ITEMS',    acct: 'amex', cat: 'shop',   path:['shop','home'],                      amt: -128.30, ccy: 'USD' },
  { id: 't12', date: '2026-05-09', name: 'CHEZ PANISSE',        acct: 'csp',  cat: 'dining', path:['dining','dinner'],                  amt: -184.20, ccy: 'USD' },
  { id: 't13', date: '2026-05-08', name: 'COMCAST XFINITY',     acct: 'chk',  cat: 'bills',  path:['bills','internet'],                 amt:  -89.00, ccy: 'USD' },
  { id: 't14', date: '2026-05-07', name: 'KAISER · COPAY',      acct: 'amex', cat: 'health', path:['health','medical'],                 amt:  -45.00, ccy: 'USD' },
  { id: 't15', date: '2026-05-06', name: 'APPLE STORE',         acct: 'amex', cat: 'shop',   path:['shop','tech'],                      amt: -249.00, ccy: 'USD' },
  { id: 't16', date: '2026-05-05', name: 'TARTINE BAKERY',      acct: 'csp',  cat: 'dining', path:['dining','cafe'],                    amt:  -18.40, ccy: 'USD' },
  { id: 't17', date: '2026-05-04', name: 'TRANSFER → SAVINGS',  acct: 'chk',  cat: 'income', path:['income','payroll'],                 amt:-1000.00, ccy: 'USD' },
  { id: 't18', date: '2026-05-03', name: 'RENT · GREENPOINT',   acct: 'chk',  cat: 'rent',   path:['rent'],                             amt:-2400.00, ccy: 'USD' },
  { id: 't19', date: '2026-05-02', name: 'LUFTHANSA · SFO→BER', acct: 'csp',  cat: 'travel', path:['travel','flights'],                 amt: -812.40, ccy: 'USD' },
  { id: 't20', date: '2026-05-01', name: 'BERLIN · KAFFEE',     acct: 'eur',  cat: 'dining', path:['dining','cafe'],                    amt:   -4.20, ccy: 'EUR' },
  { id: 't21', date: '2026-05-01', name: 'BVG TICKET',          acct: 'eur',  cat: 'trans',  path:['trans','transit'],                  amt:   -3.50, ccy: 'EUR' },
  { id: 't22', date: '2026-04-30', name: 'BIO COMPANY',         acct: 'eur',  cat: 'food',   path:['food','produce'],                   amt:  -28.10, ccy: 'EUR' },
  { id: 't23', date: '2026-04-29', name: 'NYTIMES',             acct: 'amex', cat: 'subs',   path:['subs','news'],                      amt:  -17.00, ccy: 'USD' },
  { id: 't24', date: '2026-04-28', name: 'COSTCO',              acct: 'amex', cat: 'food',   path:['food','pantry'],                    amt: -212.80, ccy: 'USD' },
  { id: 't25', date: '2026-04-26', name: 'CHEVRON',             acct: 'amex', cat: 'trans',  path:['trans','fuel'],                     amt:  -52.30, ccy: 'USD' },
  { id: 't26', date: '2026-04-25', name: 'PAYROLL · STRIPE',    acct: 'chk',  cat: 'income', path:['income','payroll'],                 amt: 6840.00, ccy: 'USD' },
  { id: 't27', date: '2026-04-23', name: 'CLAUDE PRO',          acct: 'amex', cat: 'subs',   path:['subs','software'],                  amt:  -20.00, ccy: 'USD' },
  { id: 't28', date: '2026-04-22', name: 'EQUINOX',             acct: 'amex', cat: 'health', path:['health','fitness'],                 amt: -245.00, ccy: 'USD' },
  { id: 't29', date: '2026-04-20', name: 'MUJI',                acct: 'amex', cat: 'shop',   path:['shop','home'],                      amt:  -68.20, ccy: 'USD' },
  { id: 't30', date: '2026-04-18', name: 'WHOLE FOODS MKT',     acct: 'amex', cat: 'food',   path:['food','produce'],                   amt:  -94.10, ccy: 'USD' },
  { id: 't31', date: '2026-05-12', name: 'STAPLES · PENCILS',   acct: 'amex', cat: 'edu',    path:['edu','school','supplies','pencils'], amt:   -8.40, ccy: 'USD' },
  { id: 't32', date: '2026-05-09', name: 'STAPLES · NOTEBOOKS', acct: 'amex', cat: 'edu',    path:['edu','school','supplies','paper'],   amt:  -14.20, ccy: 'USD' },
  { id: 't33', date: '2026-05-05', name: 'AMAZON · TEXTBOOK',   acct: 'amex', cat: 'edu',    path:['edu','school','supplies','books'],   amt:  -82.50, ccy: 'USD' },
  { id: 't34', date: '2026-04-27', name: 'UC EXTENSION',        acct: 'chk',  cat: 'edu',    path:['edu','courses'],                    amt: -420.00, ccy: 'USD' },
];
```

- [ ] **Step 3: Update `dayLabel` and remove stale exports**

Remove the `TODAY` constant. Replace `dayLabel`:

```js
export function dayLabel(iso) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: '2-digit' }).toUpperCase();
}
```

Delete these exports entirely (computed in components going forward):
`NET_WORTH`, `MONTH_SPEND`, `CASH`, `SAFE_DAY`, `HERO_METRICS`

Keep: `SPARK_NW`, `SPARK_SPEND`, `MOM_SPEND`, `BUDGETS`, `GOALS`, `BILLS`, `INVESTMENTS`, `MERCHANTS`, `CATEGORIES`, `CATEGORY_TREE`, `catBreadcrumb`, `catGlyph`, `fmtMoney`, `fmtSigned`, `fmtPct`.

- [ ] **Step 4: Commit**

```
git add src/renderer/data.js
git commit -m "feat: ISO dates + openingBal accounts + remove derived constants from data.js"
```

---

## Task 2: Update `store.jsx` — accounts state and live balance computation

**Files:** Modify `src/renderer/store.jsx`

- [ ] **Step 1: Update import at the top**

```js
import { TRANSACTIONS, CATEGORY_TREE, BUDGETS, ACCOUNTS } from './data';
```

- [ ] **Step 2: Add migration helper above `StoreProvider`**

```js
function migrateTransactions(txs) {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  return txs.map(tx => {
    if (tx.date) return tx;
    const { d, ...rest } = tx;
    return { ...rest, date: `${yyyy}-${mm}-${String(d || 1).padStart(2, '0')}` };
  });
}
```

- [ ] **Step 3: Add `accounts` state inside `StoreProvider`**

After the existing `useLS` state declarations, add:

```js
const [accounts, setAccounts] = useLS('ledger:accounts', ACCOUNTS);
```

- [ ] **Step 4: Add one-time migration effect**

After the state declarations:

```js
React.useEffect(() => {
  if (txs.some(tx => !tx.date)) {
    setTxs(prev => migrateTransactions(prev));
  }
}, []); // migrates old localStorage data once
```

- [ ] **Step 5: Add `accountsWithBalance` memo**

After the existing `hiddenSet` and `transactions` memos:

```js
const accountsWithBalance = React.useMemo(() => {
  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  return accounts.map(acct => {
    const acctTxs = transactions.filter(tx => tx.acct === acct.id);
    const balance = acct.openingBal + acctTxs.reduce((s, tx) => s + tx.amt, 0);
    const delta = acctTxs
      .filter(tx => tx.date?.startsWith(thisMonth))
      .reduce((s, tx) => s + tx.amt, 0);
    return { ...acct, balance, delta };
  });
}, [accounts, transactions]);
```

- [ ] **Step 6: Add `addAccount` helper**

```js
const addAccount = React.useCallback(acct => setAccounts(prev => {
  const idx = prev.findIndex(a => a.id === acct.id);
  if (idx >= 0) { const next = [...prev]; next[idx] = acct; return next; }
  return [...prev, acct];
}), [setAccounts]);
```

- [ ] **Step 7: Update dedup key in `addTransactions`**

Change `|${t.d}` to `|${t.date}`:

```js
const addTransactions = React.useCallback(incoming => setTxs(prev => {
  const keys = new Set(prev.map(t => `${t.name}|${t.amt}|${t.date}`));
  return [...prev, ...incoming.filter(t => !keys.has(`${t.name}|${t.amt}|${t.date}`))];
}), [setTxs]);
```

- [ ] **Step 8: Add new values to context and update `reset`**

Add to the `StoreCtx.Provider value={{...}}`:

```js
accounts,
accountsWithBalance,
setAccounts,
addAccount,
```

Update `reset`:

```js
const reset = React.useCallback(() => {
  setTxs(TRANSACTIONS);
  setCatTree(CATEGORY_TREE);
  setBudgets(BUDGETS);
  setAccounts(ACCOUNTS);
  setHidden([]);
}, [setTxs, setCatTree, setBudgets, setAccounts, setHidden]);
```

- [ ] **Step 9: Run the app and verify it loads without errors**

```
npm run dev
```

The app should open. Screens still import from data.js directly — that is fine, they'll be updated in later tasks.

- [ ] **Step 10: Commit**

```
git add src/renderer/store.jsx
git commit -m "feat: accounts state + accountsWithBalance + migration shim in store"
```

---

## Task 3: Update `importExport.js` — full ISO dates, ACCOUNT table, and linked transactions

**Files:** Modify `src/renderer/importExport.js`

- [ ] **Step 1: Replace `csvDay` with `csvIso`**

Remove `csvDay`. Add:

```js
function csvIso(s) {
  if (!s) return new Date().toISOString().slice(0, 10);
  s = s.replace(/['"]/g, '').trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const p = s.split(/[\/\-\.]/);
  if (p.length >= 3) {
    const yr = p[2].length === 2 ? '20' + p[2] : p[2];
    const [m, d] = +p[0] > 12 ? [p[1], p[0]] : [p[0], p[1]];
    return `${yr}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
  }
  return new Date().toISOString().slice(0, 10);
}
```

- [ ] **Step 2: Replace `qifDay` with `qifIso`**

Remove `qifDay`. Add:

```js
function qifIso(s) {
  if (!s) return new Date().toISOString().slice(0, 10);
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const now = new Date();
  const mdy = s.match(/^(\d{1,2})[\/\-\.']\s*(\d{1,2})[\/\-\.']\s*(\d{2,4})?/);
  if (mdy) {
    const yr = mdy[3] ? (mdy[3].length === 2 ? '20' + mdy[3] : mdy[3]) : now.getFullYear();
    return `${yr}-${String(mdy[1]).padStart(2,'0')}-${String(mdy[2]).padStart(2,'0')}`;
  }
  return now.toISOString().slice(0, 10);
}
```

- [ ] **Step 3: Update `parseQIF` to use `date` field**

In the returned object inside `parseQIF`, change:
```js
d: qifDay(date),
// to:
date: qifIso(date),
```

- [ ] **Step 4: Update `parseCSV` to use `date` field**

In the returned object inside `parseCSV`, change:
```js
d: dateI >= 0 ? csvDay(c[dateI]) : new Date().getDate(),
// to:
date: dateI >= 0 ? csvIso(c[dateI]) : new Date().toISOString().slice(0, 10),
```

- [ ] **Step 5: Update `exportQIF` to read `tx.date`**

```js
export function exportQIF(transactions) {
  const lines = ['!Type:Bank'];
  for (const tx of transactions) {
    lines.push(`D${tx.date || new Date().toISOString().slice(0, 10)}`);
    lines.push(`T${tx.amt.toFixed(2)}`);
    lines.push(`P${tx.name}`);
    if (tx.cat) lines.push(`L${tx.cat}`);
    if (tx.memo) lines.push(`M${tx.memo}`);
    lines.push('^');
  }
  return lines.join('\n');
}
```

- [ ] **Step 6: Update `exportCSV` to read `tx.date`**

Replace the date field in the CSV row builder:
```js
// was: `${yr}-${mo}-${String(tx.d || 1).padStart(2, '0')}`,
// becomes:
tx.date || new Date().toISOString().slice(0, 10),
```

Remove the `yr`/`mo` variables above it if they are now unused.

- [ ] **Step 7: Add ACCOUNT table reader inside `parseSQLiteMMBAK`**

After the `tables` array is built (from `sqlite_master`) and before the transaction table selection logic, add:

```js
// Read Money Manager ACCOUNT table
const ACCT_SKIP = /TRANSACTION|ENTRY|BOOKING/i;
const ACCT_WANT = /ACCOUNT/i;
const acctTableName = tables.find(t => ACCT_WANT.test(t) && !ACCT_SKIP.test(t)) || null;

let importedAccounts = [];
const acctIdMap = {};

if (acctTableName) {
  const acctSchema = db.exec(`PRAGMA table_info("${acctTableName}")`)[0];
  if (acctSchema) {
    const aCols = acctSchema.values.map(r => String(r[1]).toUpperCase());
    const pickA = (...cs) => cs.find(c => aCols.includes(c));
    const pkCol    = pickA('Z_PK', 'ZPRIMARYKEY', 'ZID', 'ID');
    const nameCol  = pickA('ZNAME', 'ZTITLE', 'ZDISPLAYNAME', 'NAME', 'TITLE');
    const balCol   = pickA('ZINITIALBALANCE', 'ZOPENINGBALANCE', 'ZAMOUNT', 'ZBALANCE', 'BALANCE');
    const ccyCol   = pickA('ZCURRENCY', 'ZCURRENCYCODE', 'CURRENCY');
    const typeCol  = pickA('ZKIND', 'ZTYPE', 'ZACCOUNTTYPE', 'TYPE', 'KIND');

    const acctResult = db.exec(`SELECT * FROM "${acctTableName}"`)[0];
    if (acctResult) {
      const aIdx = Object.fromEntries(acctResult.columns.map((c, i) => [c.toUpperCase(), i]));
      importedAccounts = acctResult.values.map((row, i) => {
        const pk = pkCol ? String(row[aIdx[pkCol]]) : String(i);
        const name = nameCol ? String(row[aIdx[nameCol]] ?? `Account ${i + 1}`).trim() : `Account ${i + 1}`;
        const openingBal = balCol ? parseFloat(row[aIdx[balCol]] ?? 0) || 0 : 0;
        const ccy = ccyCol ? String(row[aIdx[ccyCol]] ?? 'EUR').trim() : 'EUR';
        const rawType = typeCol ? String(row[aIdx[typeCol]] ?? '').toLowerCase() : '';
        const type = /credit|card|cc/.test(rawType) ? 'CC'
                   : /saving/.test(rawType) ? 'SAV'
                   : /invest|broker/.test(rawType) ? 'INV'
                   : /crypto/.test(rawType) ? 'CRY' : 'CHK';
        const id = `mm_acct_${i}`;
        acctIdMap[pk] = id;
        return { id, name, type, code: '', openingBal, ccy };
      });
    }
  }
}
```

- [ ] **Step 8: Add account FK column detection for transactions**

After the existing `pick(...)` calls for `amtCol`, `dateCol`, `nameCol`, `ccyCol`, add:

```js
const acctFkCol = pick('ZACCOUNT', 'ZACCOUNTID', 'ZACCOUNTREF', 'ACCOUNT_ID', 'ACCOUNTID');
```

- [ ] **Step 9: Fix date extraction in the row mapper**

Replace:
```js
let day = new Date().getDate();
if (dateCol && row[idx[dateCol]] != null) {
  const raw = Number(row[idx[dateCol]]);
  const unix = raw > 1_000_000_000 ? raw : raw + 978_307_200;
  day = new Date(unix * 1000).getDate();
}
```
With:
```js
let date = new Date().toISOString().slice(0, 10);
if (dateCol && row[idx[dateCol]] != null) {
  const raw = Number(row[idx[dateCol]]);
  const unix = raw > 1_000_000_000 ? raw : raw + 978_307_200;
  const dt = new Date(unix * 1000);
  date = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
}
```

- [ ] **Step 10: Update the transaction return object**

Replace:
```js
return {
  id: `mm_${i}_${Math.random().toString(36).slice(2, 6)}`,
  name, amt,
  d: day,
  cat: 'other',
  ccy,
  acct: 'chk1',
};
```
With:
```js
const acctFk = acctFkCol ? String(row[idx[acctFkCol]] ?? '') : '';
const acct = acctIdMap[acctFk] || (importedAccounts[0]?.id ?? 'imported');
return {
  id: `mm_${i}_${Math.random().toString(36).slice(2, 6)}`,
  name, amt, date, cat: 'other', ccy, acct,
};
```

- [ ] **Step 11: Update `parseSQLiteMMBAK` return value**

At the bottom of `parseSQLiteMMBAK`, change:
```js
return result.values.map(...).filter(Boolean);
```
To:
```js
const transactions = result.values.map(...).filter(Boolean);
return { transactions, accounts: importedAccounts };
```

- [ ] **Step 12: Update `parseMMBAK` SQLite branch**

```js
const { transactions, accounts } = await parseSQLiteMMBAK(buffer);
return { isLedgerBackup: false, transactions, accounts };
```

- [ ] **Step 13: Update `exportMMBAK` to include accounts**

```js
export function exportMMBAK(store) {
  return JSON.stringify({
    _type: 'ledger-backup',
    version: 1,
    exported: new Date().toISOString(),
    transactions: store.allTransactions,
    accounts: store.accounts,
    categoryTree: store.categoryTree,
    budgets: store.budgets,
  }, null, 2);
}
```

- [ ] **Step 14: Commit**

```
git add src/renderer/importExport.js
git commit -m "feat: full ISO dates, ACCOUNT table parsing, linked accts in MMBAK importer"
```

---

## Task 4: Update `ImportExport.jsx` — handle accounts

**Files:** Modify `src/renderer/components/ImportExport.jsx`

- [ ] **Step 1: Update the MMBAK import branch**

Replace the `else if (ext === 'mmbak')` block:

```js
} else if (ext === 'mmbak') {
  const data = await parseMMBAK(text, buffer);
  if (data.isLedgerBackup) {
    if (data.accounts?.length) store.setAccounts(data.accounts);
    if (data.transactions) store.setTransactions(data.transactions);
    if (data.categoryTree) store.setCategoryTree(data.categoryTree);
    if (data.budgets) store.setBudgets(data.budgets);
    setStatus({ ok: true, msg: `Backup restored · ${data.transactions?.length ?? 0} transactions` });
  } else {
    if (data.accounts?.length) store.setAccounts(data.accounts);
    store.addTransactions(data.transactions);
    const acctNote = data.accounts?.length ? ` · ${data.accounts.length} accounts` : '';
    setStatus({ ok: true, msg: `Imported ${data.transactions.length} transactions${acctNote} from MoneyMoney` });
  }
}
```

- [ ] **Step 2: Verify import and export work**

Run `npm run dev`. Open Import/Export (⇅ on desktop). Test:
1. Import a `.mmbak` MoneyMoney file → success message shows account count
2. Export → MMBAK → open the downloaded file in a text editor → confirm it contains an `"accounts"` key

- [ ] **Step 3: Commit**

```
git add src/renderer/components/ImportExport.jsx
git commit -m "feat: ImportExport handles accounts from MMBAK import/export"
```

---

## Task 5: Update `Transactions.jsx` — group by date

**Files:** Modify `src/renderer/screens/mobile/Transactions.jsx`

- [ ] **Step 1: Replace day-grouping with date-grouping**

Find (around line 17):
```js
const byDay = {};
visible.forEach(tx => { (byDay[tx.d] = byDay[tx.d] || []).push(tx); });
const days = Object.keys(byDay).map(Number).sort((a, b) => a - b);
```
Replace with:
```js
const byDate = {};
visible.forEach(tx => { (byDate[tx.date] = byDate[tx.date] || []).push(tx); });
const dates = Object.keys(byDate).sort((a, b) => b.localeCompare(a));
```

- [ ] **Step 2: Update the render loop**

Replace `{days.map(d => (` and all inner `byDay[d]` / `dayLabel(d)` references:

```jsx
{dates.map(date => (
  <div key={date}>
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0 4px', borderTop: '1px solid ' + A.rule2 }}>
      <ALabel>{dayLabel(date)}</ALabel>
      <ALabel>{fmtSigned(byDate[date].reduce((s, x) => s + x.amt, 0), 'USD', t.decimals)}</ALabel>
    </div>
    {byDate[date].map(tx => (
      <SwipeRow key={tx.id} t={t} tx={tx} onHide={() => hideTx(tx.id)} />
    ))}
  </div>
))}
```

- [ ] **Step 3: Verify**

Run `npm run dev`. Go to Transactions tab. Dates should appear as "MAY 14", "MAY 13", etc., newest first.

- [ ] **Step 4: Commit**

```
git add src/renderer/screens/mobile/Transactions.jsx
git commit -m "feat: group transactions by ISO date, newest first"
```

---

## Task 6: Update `Home.jsx` — live hero metrics

**Files:** Modify `src/renderer/screens/mobile/Home.jsx`

- [ ] **Step 1: Update imports**

```js
// Remove: ACCOUNTS, HERO_METRICS from the data.js import
// Keep: BILLS, SPARK_NW, SPARK_SPEND, fmtMoney, fmtSigned, fmtPct from '../../data'
// Add:
import { useStore } from '../../store';
import { BILLS, SPARK_NW, SPARK_SPEND, fmtMoney, fmtSigned, fmtPct } from '../../data';
```

- [ ] **Step 2: Add store + computed metrics inside the component**

Add at the top of `Home`:

```js
const { accountsWithBalance, transactions } = useStore();
const now = new Date();
const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
const todayLabel = now.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }).toUpperCase();

const NET_WORTH   = accountsWithBalance.reduce((s, a) => s + (a.ccy === 'USD' ? a.balance : a.balance * 1.08), 0);
const MONTH_SPEND = transactions
  .filter(tx => tx.cat !== 'income' && tx.amt < 0 && tx.date?.startsWith(thisMonth))
  .reduce((s, tx) => s + Math.abs(tx.ccy === 'USD' ? tx.amt : tx.amt * 1.08), 0);
const CASH        = accountsWithBalance
  .filter(a => ['CHK', 'SAV', 'FX'].includes(a.type))
  .reduce((s, a) => s + (a.ccy === 'USD' ? a.balance : a.balance * 1.08), 0);
const NW_DELTA    = accountsWithBalance.reduce((s, a) => s + (a.ccy === 'USD' ? a.delta : a.delta * 1.08), 0);

const HERO_METRICS = [
  { key: 'nw',    label: 'NET WORTH',      value: NET_WORTH,   delta: NW_DELTA, deltaPct: NET_WORTH ? (NW_DELTA / Math.abs(NET_WORTH - NW_DELTA)) * 100 : 0, spark: SPARK_NW,                        ccy: 'USD' },
  { key: 'spend', label: 'MONTH SPENDING', value: MONTH_SPEND, delta: 0,        deltaPct: 0,                                                                   spark: SPARK_SPEND, ccy: 'USD', invert: true },
  { key: 'cash',  label: 'CASH ON HAND',   value: CASH,        delta: 0,        deltaPct: 0,                                                                   spark: SPARK_NW.map(v => v * 0.12),    ccy: 'USD' },
  { key: 'safe',  label: 'SAFE TO SPEND',  value: CASH / 30,   delta: 0,        deltaPct: 0,                                                                   spark: SPARK_NW.map(v => v * 0.0006),  ccy: 'USD', unit: '/ DAY' },
];
```

- [ ] **Step 3: Replace the scrub date label**

```js
// Remove:
const dateLbl = scrub != null ? dayLabel(29 - scrub) : 'MAY 11 · 2026';

// Add:
const dateLbl = scrub != null
  ? (() => { const d = new Date(); d.setDate(d.getDate() - (29 - scrub)); return d.toLocaleDateString('en-US', { month: 'short', day: '2-digit' }).toUpperCase(); })()
  : todayLabel;
```

- [ ] **Step 4: Update the hardcoded date in the header**

Find `11 MAY · 2026` in the JSX and replace with `{todayLabel}`.

- [ ] **Step 5: Update the account list**

Replace `ACCOUNTS.slice(0, 5).map(a => (` with `accountsWithBalance.slice(0, 5).map(a => (`.

In the row JSX, replace `a.bal` with `a.balance` (both the color check `a.bal < 0` and `fmtMoney(a.bal, ...)`).

Replace the hardcoded `[02] ACCOUNTS · 8` label with:
```jsx
[02] ACCOUNTS · {accountsWithBalance.length}
```

- [ ] **Step 6: Verify**

Run `npm run dev` (mobile width). Home screen shows live net worth. Account rows show computed balances.

- [ ] **Step 7: Commit**

```
git add src/renderer/screens/mobile/Home.jsx
git commit -m "feat: Home screen computes hero metrics from live store"
```

---

## Task 7: Update `Accounts.jsx` — live account data (mobile)

**Files:** Modify `src/renderer/screens/mobile/Accounts.jsx`

- [ ] **Step 1: Update imports**

Remove `ACCOUNTS` and `NET_WORTH` from the data.js import. Add `useStore`:

```js
import { fmtMoney, fmtSigned, dayLabel, catBreadcrumb } from '../../data';
import { useStore } from '../../store';
```

- [ ] **Step 2: Update `Accounts` component body**

```js
export function Accounts({ t, onAcct }) {
  const { accountsWithBalance } = useStore();
  const NET_WORTH = accountsWithBalance.reduce((s, a) => s + (a.ccy === 'USD' ? a.balance : a.balance * 1.08), 0);

  const groups = [
    ['CASH',        accountsWithBalance.filter(a => ['CHK','SAV','FX'].includes(a.type))],
    ['CREDIT',      accountsWithBalance.filter(a => a.type === 'CC')],
    ['INVESTMENTS', accountsWithBalance.filter(a => a.type === 'INV')],
    ['CRYPTO',      accountsWithBalance.filter(a => a.type === 'CRY')],
  ];
  // ... rest unchanged
```

- [ ] **Step 3: Replace `a.bal` with `a.balance` in the JSX**

In the account row render, update:
- `a.bal < 0` → `a.balance < 0`
- `fmtMoney(a.bal, ...)` → `fmtMoney(a.balance, ...)`
- Group subtotal: `a.bal * 1.08` → `a.balance * 1.08`

- [ ] **Step 4: Update `AccountDetail`**

In `AccountDetail`, switch from `ACCOUNTS.find(...)` to store:

```js
export function AccountDetail({ t, acct: acctId, onBack }) {
  const { accountsWithBalance, transactions } = useStore();
  const account = accountsWithBalance.find(a => a.id === acctId);
  // Replace any account.bal with account.balance
  // Replace dayLabel(tx.d) with dayLabel(tx.date)
```

- [ ] **Step 5: Commit**

```
git add src/renderer/screens/mobile/Accounts.jsx
git commit -m "feat: Accounts screen reads live balances from store"
```

---

## Task 8: Update `Dashboard.jsx` and `WebAccounts.jsx` — desktop screens

**Files:** Modify `src/renderer/screens/web/Dashboard.jsx`, `src/renderer/screens/web/WebAccounts.jsx`

- [ ] **Step 1: Update `Dashboard.jsx` imports**

```js
import { BILLS, CATEGORIES, SPARK_NW, fmtMoney, fmtSigned, fmtPct, catGlyph } from '../../data';
// useStore is already imported
```

- [ ] **Step 2: Add live computations in `Dashboard`**

```js
const { transactions, budgets, accountsWithBalance } = useStore();
const now = new Date();
const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
const NET_WORTH  = accountsWithBalance.reduce((s, a) => s + (a.ccy === 'USD' ? a.balance : a.balance * 1.08), 0);
const NW_DELTA   = accountsWithBalance.reduce((s, a) => s + (a.ccy === 'USD' ? a.delta  : a.delta  * 1.08), 0);
const NW_PCT     = NET_WORTH ? (NW_DELTA / Math.abs(NET_WORTH - NW_DELTA)) * 100 : 0;
const todayLabel = now.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }).toUpperCase();
```

- [ ] **Step 3: Update Dashboard JSX**

- Replace `fmtSigned(3412.40, 'USD', t.decimals)` → `fmtSigned(NW_DELTA, 'USD', t.decimals)`
- Replace `fmtPct(1.21)` → `fmtPct(NW_PCT)`
- Replace `MAY 11 2026` in the `[01] NET WORTH` label → `{todayLabel}`
- Replace `ACCOUNTS.map(a => (` → `accountsWithBalance.map(a => (`
- Replace `a.bal` → `a.balance` (both color check and `fmtMoney`)

- [ ] **Step 4: Update `WebAccounts.jsx`**

Open `src/renderer/screens/web/WebAccounts.jsx`. Apply the same pattern:
- Remove `ACCOUNTS`/`NET_WORTH` from data.js imports
- Add `useStore`, read `accountsWithBalance`
- Compute `NET_WORTH` locally
- Replace `a.bal` → `a.balance`

- [ ] **Step 5: Verify desktop layout**

Run `npm run dev` (window width ≥ 1024px). Dashboard shows live net worth. Accounts page shows computed balances.

- [ ] **Step 6: Commit**

```
git add src/renderer/screens/web/Dashboard.jsx src/renderer/screens/web/WebAccounts.jsx
git commit -m "feat: Dashboard and WebAccounts read live balances from store"
```

---

## Task 9: Sweep remaining stale references

**Files:** `src/renderer/screens/mobile/DetailScreens.jsx` and any other remaining files

- [ ] **Step 1: Find all remaining stale references**

Run this search and fix every file listed:

```
grep -rn "ACCOUNTS\|NET_WORTH\|HERO_METRICS\|\.d\b" src/renderer/screens --include="*.jsx"
```

For each hit:
- `ACCOUNTS` import → use `store.accountsWithBalance`
- `NET_WORTH` → compute locally from `accountsWithBalance`
- `tx.d` / `dayLabel(tx.d)` → `tx.date` / `dayLabel(tx.date)`
- `a.bal` → `a.balance`

- [ ] **Step 2: Fix `DetailScreens.jsx`**

Open `src/renderer/screens/mobile/DetailScreens.jsx`. For any component using `ACCOUNTS.find(a => a.id === ...)`:

```js
const { accountsWithBalance } = useStore();
const account = accountsWithBalance.find(a => a.id === someId);
// replace account.bal with account.balance
// replace dayLabel(tx.d) with dayLabel(tx.date)
```

- [ ] **Step 3: Final end-to-end verification**

Run `npm run dev`. Walk through every screen:
1. Home — net worth and account list update correctly
2. Accounts (mobile) — grouped balances, NET_WORTH total shown
3. Transactions — grouped by date header, newest first
4. Dashboard (desktop, >1024px) — live net worth and accounts table
5. Import/Export → RESET TO DEFAULTS → all balances return to seed values
6. Import a `.mmbak` → accounts and transactions appear with correct balances

- [ ] **Step 4: Final commit**

```
git add src/renderer/screens/
git commit -m "feat: sweep stale data.js refs — all screens on live store (Phase 1 complete)"
```
