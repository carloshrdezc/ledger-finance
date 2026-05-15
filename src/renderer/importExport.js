import sqlWasm from 'sql.js/dist/sql-wasm.wasm?url';

// ─── Category key normaliser ───────────────────────────────────────────────

function toCatKey(cat) {
  if (!cat) return 'other';
  const c = cat.toLowerCase().split(':')[0].trim();
  if (/food|grocer|supermarket/.test(c)) return 'food';
  if (/dining|restaurant|café|cafe|coffee/.test(c)) return 'dining';
  if (/transport|transit|uber|lyft|gas|auto/.test(c)) return 'trans';
  if (/shop|retail|amazon|clothing/.test(c)) return 'shop';
  if (/health|medical|pharma|doctor/.test(c)) return 'health';
  if (/edu|school|tuition/.test(c)) return 'edu';
  if (/travel|hotel|flight|airbnb/.test(c)) return 'travel';
  if (/sub|streaming|netflix|spotify/.test(c)) return 'subs';
  if (/income|salary|payroll/.test(c)) return 'income';
  return c || 'other';
}

// ─── QIF ──────────────────────────────────────────────────────────────────

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

export function parseQIF(text) {
  const txs = [];
  const blocks = text.replace(/\r\n/g, '\n').split(/\^[ \t]*\n?/);

  for (const block of blocks) {
    let date = '', amt = NaN, name = '', cat = '', memo = '';
    for (const line of block.split('\n')) {
      if (!line) continue;
      const code = line[0], val = line.slice(1).trim();
      if (code === 'D') date = val;
      else if (code === 'T' || code === 'U') amt = parseFloat(val.replace(/,/g, ''));
      else if (code === 'P') name = val;
      else if (code === 'L') cat = val;
      else if (code === 'M') memo = val;
    }
    if (!name || isNaN(amt)) continue;
    txs.push({
      id: 'qif_' + Math.random().toString(36).slice(2),
      name, amt,
      date: qifIso(date),
      cat: toCatKey(cat),
      ccy: 'USD', acct: 'chk1',
      memo: memo || undefined,
    });
  }
  return txs;
}

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

// ─── CSV ──────────────────────────────────────────────────────────────────

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

export function parseCSV(text) {
  const lines = text.replace(/\r\n/g, '\n').trim().split('\n');
  if (lines.length < 2) throw new Error('CSV has no data rows');

  const headers = csvSplit(lines[0]).map(h => h.toLowerCase().trim());
  const col = (...pats) => headers.findIndex(h => pats.some(p => h.includes(p)));

  const dateI = col('date', 'time', 'posted');
  const nameI = col('description', 'name', 'merchant', 'payee', 'narrative', 'details', 'memo');
  const amtI  = col('amount', 'amt', 'sum', 'value', 'debit', 'credit');
  const catI  = col('category', 'cat', 'type', 'group');
  const acctI = col('account', 'acct');
  const ccyI  = col('currency', 'ccy', 'cur');
  const noteI = col('note', 'notes', 'reference', 'remark');

  if (nameI < 0 || amtI < 0)
    throw new Error(`Required columns missing. Found: ${headers.join(', ')}`);

  return lines.slice(1).flatMap((line, i) => {
    if (!line.trim()) return [];
    const c = csvSplit(line);
    const amt = parseFloat((c[amtI] || '').replace(/[$£€, ]/g, ''));
    const name = c[nameI]?.trim();
    if (!name || isNaN(amt)) return [];
    return [{
      id: `csv_${i}_${Math.random().toString(36).slice(2, 6)}`,
      name, amt,
      date: dateI >= 0 ? csvIso(c[dateI]) : new Date().toISOString().slice(0, 10),
      cat: catI >= 0 ? toCatKey(c[catI]) : 'other',
      ccy: ccyI >= 0 ? (c[ccyI]?.trim() || 'USD') : 'USD',
      acct: acctI >= 0 ? (c[acctI]?.trim() || 'chk1') : 'chk1',
      memo: noteI >= 0 ? c[noteI]?.trim() : undefined,
    }];
  });
}

function csvSplit(line) {
  const r = []; let cur = '', q = false;
  for (const ch of line) {
    if (ch === '"') q = !q;
    else if (ch === ',' && !q) { r.push(cur.trim()); cur = ''; }
    else cur += ch;
  }
  return [...r, cur.trim()];
}

export function exportCSV(transactions) {
  const esc = s => `"${(s || '').replace(/"/g, '""')}"`;
  return [
    'Date,Description,Amount,Category,Account,Currency,Memo',
    ...transactions.map(tx =>
      [
        tx.date || new Date().toISOString().slice(0, 10),
        esc(tx.name),
        tx.amt.toFixed(2),
        tx.cat || '',
        tx.acct || '',
        tx.ccy || 'USD',
        esc(tx.memo),
      ].join(',')
    ),
  ].join('\n');
}

// ─── MMBAK: JSON backup (our own format) ──────────────────────────────────

export function exportMMBAK(store) {
  return JSON.stringify({
    _type: 'ledger-backup',
    version: 1,
    exported: new Date().toISOString(),
    transactions: store.allTransactions,
    accounts: store.accounts,
    categoryTree: store.categoryTree,
    budgets: store.budgets,
    bills: store.bills,
    goals: store.goals,
    goalContributions: store.goalContributions,
  }, null, 2);
}

// Detects SQLite magic header bytes
function isSQLite(buffer) {
  const magic = 'SQLite format 3\0';
  const view = new Uint8Array(buffer, 0, 16);
  return [...magic].every((c, i) => view[i] === c.charCodeAt(0));
}

// Lazy-loaded sql.js instance
let _SQL = null;
async function getSQLjs() {
  if (_SQL) return _SQL;
  const mod = await import('sql.js');
  // CJS interop: may be mod / mod.default / mod.default.default
  const init = typeof mod === 'function' ? mod
             : typeof mod.default === 'function' ? mod.default
             : mod.default?.default;
  if (typeof init !== 'function') throw new Error('Failed to load sql.js');
  _SQL = await init({ locateFile: () => sqlWasm });
  return _SQL;
}

// Parse MoneyMoney (or generic) SQLite .mmbak
async function parseSQLiteMMBAK(buffer) {
  const SQL = await getSQLjs();

  let db;
  try {
    db = new SQL.Database(new Uint8Array(buffer));
  } catch {
    throw new Error(
      'Cannot open this .mmbak file — it may be password-encrypted. ' +
      'In MoneyMoney: File → Export → Transactions (CSV) instead.'
    );
  }

  const tableRows = db.exec("SELECT name FROM sqlite_master WHERE type='table'");
  const tables = tableRows[0]?.values.flat().map(String) || [];

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
      const pkCol   = pickA('Z_PK', 'ZPRIMARYKEY', 'ZID', 'ID');
      const nameCol = pickA('ZNAME', 'ZTITLE', 'ZDISPLAYNAME', 'NAME', 'TITLE');
      const balCol  = pickA('ZINITIALBALANCE', 'ZOPENINGBALANCE', 'ZAMOUNT', 'ZBALANCE', 'BALANCE');
      const ccyCol  = pickA('ZCURRENCY', 'ZCURRENCYCODE', 'CURRENCY');
      const typeCol = pickA('ZKIND', 'ZTYPE', 'ZACCOUNTTYPE', 'TYPE', 'KIND');

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

  // Skip auxiliary/template tables and pick the best candidate by priority,
  // then by row count so we do not accidentally land on an empty or FAV table.
  const SKIP = /FAV|TEMPLATE|RULE|BUDGET|ACCOUNT|CURRENCY|CATEGORY|PAYEE|SYNC|ASSET|META|SETTING/i;
  const WANT = /TRANSACTION|ENTRY|BOOKING|STATEMENT/i;

  const candidates = tables.filter(t => WANT.test(t) && !SKIP.test(t));

  // If filtering left nothing, fall back to any TRANSACTION/ENTRY table (including FAV)
  const pool = candidates.length > 0 ? candidates : tables.filter(t => WANT.test(t));

  // Pick the table with the most rows (most likely the main ledger)
  let txTable = null, bestCount = -1;
  for (const t of pool) {
    try {
      const r = db.exec(`SELECT COUNT(*) FROM "${t}"`);
      const n = Number(r[0]?.values[0]?.[0] ?? 0);
      if (n > bestCount) { bestCount = n; txTable = t; }
    } catch { /* skip unreadable tables */ }
  }

  if (!txTable) {
    db.close();
    throw new Error(`SQLite opened but no transaction table found. Tables: ${tables.join(', ')}`);
  }

  const colInfo = db.exec(`PRAGMA table_info("${txTable}")`)[0];
  if (!colInfo) { db.close(); throw new Error('Could not read table schema'); }

  const cols = colInfo.values.map(r => String(r[1]).toUpperCase());

  const pick = (...candidates) => candidates.find(c => cols.includes(c));

  const amtCol  = pick('ZAMOUNT', 'ZAMOUNTSUB', 'ZAMOUNT_SUB', 'ZVALUE', 'ZSUM', 'AMOUNT', 'VALUE', 'SUM');
  const dateCol = pick('ZBOOKINGDATE', 'ZDATE', 'ZVALUEDATE', 'ZPOSTINGDATE', 'ZUTIME', 'ZTIME', 'ZTIMESTAMP', 'DATE', 'BOOKINGDATE');
  const nameCol = pick('ZPURPOSE', 'ZPAYEE', 'ZNAME', 'ZDESCRIPTION', 'ZMEMO', 'ZTEXT', 'PURPOSE', 'PAYEE', 'NAME', 'DESCRIPTION', 'MEMO');
  const ccyCol  = pick('ZCURRENCY', 'ZCURRENCYCODE', 'ZCURRENCYUID', 'CURRENCY');
  const acctFkCol = pick('ZACCOUNT', 'ZACCOUNTID', 'ZACCOUNTREF', 'ACCOUNT_ID', 'ACCOUNTID');

  if (!amtCol) {
    db.close();
    throw new Error(`No amount column found in "${txTable}" (${bestCount} rows). Columns: ${cols.join(', ')}`);
  }

  const result = db.exec(`SELECT * FROM "${txTable}"`)[0];
  db.close();

  if (!result) return { transactions: [], accounts: importedAccounts };

  const idx = Object.fromEntries(result.columns.map((c, i) => [c.toUpperCase(), i]));

  const transactions = result.values
    .map((row, i) => {
      const amt = parseFloat(row[idx[amtCol]] ?? 0);
      if (isNaN(amt) || amt === 0) return null;

      // Core Data timestamps = seconds since 2001-01-01 (add 978307200 to get Unix)
      let date = new Date().toISOString().slice(0, 10);
      if (dateCol && row[idx[dateCol]] != null) {
        const raw = Number(row[idx[dateCol]]);
        // Heuristic: if > 1e9 it is a Unix ts, if < 1e9 it is Core Data ts
        const unix = raw > 1_000_000_000 ? raw : raw + 978_307_200;
        const dt = new Date(unix * 1000);
        date = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
      }

      const name = String(row[nameCol ? idx[nameCol] : 0] ?? '').trim() || 'Transaction';
      const ccy  = ccyCol ? String(row[idx[ccyCol]] ?? 'EUR').trim() : 'EUR';

      const acctFk = acctFkCol ? String(row[idx[acctFkCol]] ?? '') : '';
      const acct = acctIdMap[acctFk] || (importedAccounts[0]?.id ?? 'imported');

      return {
        id: `mm_${i}_${Math.random().toString(36).slice(2, 6)}`,
        name, amt, date, cat: 'other', ccy, acct,
      };
    })
    .filter(Boolean);

  return { transactions, accounts: importedAccounts };
}

// Main entry point — handles both JSON (our backup) and SQLite (MoneyMoney)
export async function parseMMBAK(text, buffer) {
  // Try our own JSON format first
  const trimmed = text.trimStart();
  if (trimmed.startsWith('{')) {
    const d = JSON.parse(text);
    if (d._type !== 'ledger-backup')
      throw new Error('Not a valid LEDGER backup. Expected a file exported from LEDGER.');
    return { isLedgerBackup: true, ...d };
  }

  // Fall back to SQLite (MoneyMoney native format)
  if (buffer && isSQLite(buffer)) {
    const { transactions, accounts } = await parseSQLiteMMBAK(buffer);
    return { isLedgerBackup: false, transactions, accounts };
  }

  throw new Error(
    `Unexpected token '${trimmed[0]}' — file is neither a LEDGER JSON backup nor a SQLite database.`
  );
}
