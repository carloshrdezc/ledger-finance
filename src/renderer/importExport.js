import sqlWasm from 'sql.js/dist/sql-wasm.wasm?url';

import * as XLSX from 'xlsx';

// ─── Category key normaliser ───────────────────────────────────────────────

function toCatKey(cat) {
  if (!cat) return 'other';
  const c = cat.toLowerCase().split(':')[0].trim();
  if (/food|grocer|supermarket|comida|pantry|produce|market/.test(c)) return 'food';
  if (/dining|restaurant|café|cafe|coffee|lunch|dinner|social life|eating out/.test(c)) return 'dining';
  if (/rent|housing|mortgage|renta/.test(c)) return 'rent';
  if (/transport|transit|uber|lyft|gas|auto|gasolina|bus|subway|taxi|parking|car/.test(c)) return 'trans';
  if (/shop|retail|amazon|clothing|apparel|gift|household|beauty/.test(c)) return 'shop';
  if (/health|medical|pharma|doctor|medicina/.test(c)) return 'health';
  if (/edu|school|tuition|education|self-development|courses|books/.test(c)) return 'edu';
  if (/travel|hotel|flight|airbnb/.test(c)) return 'travel';
  if (/sub|streaming|netflix|spotify|apps|music|culture/.test(c)) return 'subs';
  if (/income|salary|payroll|bonus|refund|reimbursement|reembolso|nomina|interest|allowance/.test(c)) return 'income';
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

function splitPathValue(value) {
  return String(value || '')
    .split(/\s*(?:>|\/|\||:)\s*/)
    .map(part => part.trim())
    .filter(Boolean);
}

function pathToString(path) {
  return Array.isArray(path) ? path.join(' > ') : String(path || '');
}

function flattenCategoryTree(tree, path = []) {
  const rows = [];
  for (const [key, node] of Object.entries(tree || {})) {
    const nextPath = [...path, key];
    rows.push({
      Path: nextPath.join(' > '),
      Label: node?.label || key,
    });
    if (node?.children && Object.keys(node.children).length) {
      rows.push(...flattenCategoryTree(node.children, nextPath));
    }
  }
  return rows;
}

function buildCategoryTreeFromRows(rows) {
  const tree = {};

  const ensureNode = (scope, seg, label) => {
    if (!scope[seg]) scope[seg] = { label: label || seg };
    if (label) scope[seg].label = label;
    return scope[seg];
  };

  for (const row of rows || []) {
    const rawPath = row.Path ?? row.path ?? row.CategoryPath ?? row['Category Path'] ?? '';
    const parts = splitPathValue(rawPath);
    if (!parts.length) continue;
    let scope = tree;
    parts.forEach((part, idx) => {
      const node = ensureNode(scope, part, idx === parts.length - 1 ? (row.Label ?? row.label ?? part) : part);
      if (idx < parts.length - 1) {
        if (!node.children) node.children = {};
        scope = node.children;
      }
    });
  }

  return tree;
}

function mergeCategoryPathsFromTransactions(transactions) {
  const rows = [];
  for (const tx of transactions || []) {
    if (Array.isArray(tx.path) && tx.path.length) {
      rows.push({ Path: tx.path.join(' > '), Label: tx.path.at(-1) || tx.cat || 'Category' });
      continue;
    }
    if (tx.cat) {
      rows.push({ Path: tx.cat, Label: tx.cat });
    }
  }
  return buildCategoryTreeFromRows(rows);
}

function moneyMoneyIsoDate(raw) {
  if (raw == null || raw === '') return new Date().toISOString().slice(0, 10);
  const n = Number(raw);
  if (!Number.isFinite(n)) return new Date().toISOString().slice(0, 10);
  const unix = n > 1_000_000_000 ? n : n + 978_307_200;
  const dt = new Date(unix * 1000);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

function moneyMoneySign(type) {
  switch (Number(type)) {
    case 0: return 1;
    case 1: return -1;
    case 3: return -1;
    case 4: return 1;
    default: return 0;
  }
}

function moneyMoneyAccountType(name) {
  const n = String(name || '').toLowerCase();
  if (/btc|bitcoin|crypto/.test(n)) return 'CRY';
  if (/save|ahorro|cetes|skandia|vanguard|fidelity|broker|invest|plan/.test(n)) return 'INV';
  if (/card|amex|rappi|visa|master|credit/.test(n)) return 'CC';
  if (/wallet|cash|vales|debit|débito|debito|checking|chequ|santander|bancomer|banorte|openbank|invex|bbva/.test(n)) return 'CHK';
  return 'CHK';
}

function moneyMoneyCurrency(currencyMap, uid) {
  const key = String(uid ?? '').trim();
  return currencyMap.get(key) || 'MXN';
}

function buildMoneyMoneyCategory(categoryMap, rawCat, uid) {
  const direct = String(rawCat || '').trim();
  if (direct) return { cat: toCatKey(direct), rawCat: direct };
  const lookedUp = categoryMap.get(String(uid ?? '').trim()) || '';
  return lookedUp ? { cat: toCatKey(lookedUp), rawCat: lookedUp } : { cat: 'other', rawCat: '' };
}

function slugKey(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'cat';
}

function buildMoneyMoneyCategoryTree(categoryRows) {
  const items = new Map();
  const order = [];

  categoryRows.forEach((row, i) => {
    const uid = String(row[4] ?? row[1] ?? row[0] ?? '').trim();
    const name = String(row[2] ?? '').trim() || `Category ${i + 1}`;
    const parentUid = String(row[3] ?? '').trim();
    const key = `mm_cat_${slugKey(name)}_${uid || i}`;
    const item = { uid, name, parentUid, key, children: [] };
    if (uid) items.set(uid, item);
    order.push(item);
  });

  const roots = [];
  for (const item of order) {
    const parent = item.parentUid ? items.get(item.parentUid) : null;
    if (parent && parent !== item) parent.children.push(item);
    else roots.push(item);
  }

  const pathByUid = new Map();
  const tree = {};

  const attach = (item, parentPath = []) => {
    const path = [...parentPath, item.key];
    pathByUid.set(item.uid, path);
    const node = { label: item.name };
    if (item.children.length) {
      const childTree = {};
      for (const child of item.children) {
        childTree[child.key] = attach(child, path);
      }
      node.children = childTree;
    }
    return node;
  };

  for (const root of roots) {
    tree[root.key] = attach(root);
  }

  return { tree, pathByUid };
}

function moneyMoneyBillType(type) {
  return Number(type) === 0 ? 'income' : 'expense';
}

function moneyMoneyMonthDay(raw) {
  const iso = moneyMoneyIsoDate(raw);
  return Number(iso.slice(8, 10)) || 1;
}

function parseMoneyMoneySQLite(db) {
  const currencyRows = db.exec('SELECT ZUID, ZISO, ZMAINISO FROM ZCURRENCY')[0]?.values || [];
  const currencyMap = new Map();
  for (const row of currencyRows) {
    const uid = String(row[0] ?? '').trim();
    const iso = String(row[1] ?? row[2] ?? 'MXN').trim() || 'MXN';
    if (uid) currencyMap.set(uid, iso);
  }

  const categoryRows = db.exec('SELECT Z_PK, ZAID, ZNAME, ZUID FROM ZCATEGORY')[0]?.values || [];
  const categoryMap = new Map();
  const { tree: categoryTree, pathByUid } = buildMoneyMoneyCategoryTree(categoryRows);
  for (const row of categoryRows) {
    const name = String(row[2] ?? '').trim();
    for (const key of [row[0], row[1], row[3]]) {
      const uid = String(key ?? '').trim();
      if (uid && name && !categoryMap.has(uid)) categoryMap.set(uid, name);
    }
  }

  const acctRows = db.exec('SELECT Z_PK, ZAID, ZORDER, ZISDEL, ZNICNAME, ZCARD_ACCOUNT_NAME, ZCURRENCYUID, ZLEFTMONEY, ZUID FROM ZASSET ORDER BY ZORDER, Z_PK')[0]?.values || [];
  const importedAccounts = [];
  const acctIdMap = new Map();

  for (const [i, row] of acctRows.entries()) {
    const uid = String(row[8] ?? row[1] ?? row[0] ?? `acct_${i}`).trim();
    const name = String(row[4] ?? row[5] ?? `Account ${i + 1}`).trim() || `Account ${i + 1}`;
    const id = `mm_acct_${uid || i}`;
    importedAccounts.push({
      id,
      name,
      type: moneyMoneyAccountType(name),
      code: '',
      openingBal: 0,
      ccy: moneyMoneyCurrency(currencyMap, row[6]),
      archived: false,
      includeInTotals: true,
      order: Number(row[2] ?? i) || 0,
    });
    for (const key of [row[8], row[1], row[0], row[5], row[4]]) {
      const k = String(key ?? '').trim();
      if (k) acctIdMap.set(k, id);
    }
  }

  const txResult = db.exec('SELECT * FROM ZINOUTCOME')[0];
  if (!txResult) return { transactions: [], accounts: importedAccounts };

  const idx = Object.fromEntries(txResult.columns.map((c, i) => [c.toUpperCase(), i]));
  const get = (row, col) => (col && idx[col] !== undefined ? row[idx[col]] : undefined);

  const transactions = txResult.values
    .map((row, i) => {
      const sign = moneyMoneySign(get(row, 'ZDO_TYPE'));
      const amt = parseFloat(get(row, 'ZAMOUNTSUB') ?? get(row, 'ZAMOUNT') ?? 0);
      if (!Number.isFinite(amt) || sign === 0) return null;

      const assetUid = String(get(row, 'ZASSETUID') ?? '').trim();
      const acct = acctIdMap.get(assetUid) || importedAccounts[0]?.id || 'imported';
      const ccy = moneyMoneyCurrency(currencyMap, get(row, 'ZCURRENCYUID') || get(row, 'ZCURRENCY'));
      const categoryUid = String(get(row, 'ZCATEGORYUID') ?? '').trim();
      const categoryInfo = buildMoneyMoneyCategory(categoryMap, get(row, 'ZCATEGORY_NAME'), categoryUid);
      const path = categoryUid && pathByUid.get(categoryUid) ? pathByUid.get(categoryUid) : [];
      const name = String(
        get(row, 'ZCONTENT') ||
        get(row, 'ZPAYEE') ||
        get(row, 'ZMEMO') ||
        categoryInfo.rawCat ||
        'Transaction'
      ).trim() || 'Transaction';

      return {
        id: `mm_${String(get(row, 'ZUID') ?? get(row, 'ZTXUIDTRANS') ?? get(row, 'Z_PK') ?? i)}_${Math.random().toString(36).slice(2, 6)}`,
        name,
        amt: amt * sign,
        date: moneyMoneyIsoDate(get(row, 'ZDATE')),
        cat: categoryInfo.cat,
        ccy,
        acct,
        memo: String(get(row, 'ZMEMO') ?? '').trim() || undefined,
        path,
      };
    })
    .filter(Boolean);

  const recurringRows = db.exec('SELECT * FROM ZREPEATTRANSACTION')[0]?.values || [];
  const recurringIdx = db.exec('PRAGMA table_info("ZREPEATTRANSACTION")')[0]?.values || [];
  const recurringCols = recurringIdx.map(r => String(r[1]).toUpperCase());
  const recurringPos = Object.fromEntries(recurringCols.map((c, i) => [c, i]));
  const recurringGet = (row, col) => (recurringPos[col] !== undefined ? row[recurringPos[col]] : undefined);

  const bills = recurringRows.map((row, i) => {
    const assetUid = String(recurringGet(row, 'ZASSETUID') ?? '').trim();
    const acct = acctIdMap.get(assetUid) || importedAccounts[0]?.id || 'imported';
    const categoryInfo = buildMoneyMoneyCategory(categoryMap, recurringGet(row, 'ZCATEGORY_NAME'), recurringGet(row, 'ZCATEGORYUID'));
    const name = String(
      recurringGet(row, 'ZPAYEE') ||
      recurringGet(row, 'ZMEMO') ||
      categoryInfo.rawCat ||
      `Recurring ${i + 1}`
    ).trim() || `Recurring ${i + 1}`;
    const amt = Math.abs(parseFloat(recurringGet(row, 'ZAMOUNTSUB') ?? recurringGet(row, 'ZAMOUNT_SUB') ?? 0) || 0);
    const nextDate = recurringGet(row, 'ZNEXTDATE');
    const day = moneyMoneyMonthDay(nextDate);
    const ccy = moneyMoneyCurrency(currencyMap, recurringGet(row, 'ZCURRENCYUID') || recurringGet(row, 'ZCURRENCY'));

    return {
      id: `mm_bill_${String(recurringGet(row, 'ZUID') ?? recurringGet(row, 'Z_PK') ?? i)}_${Math.random().toString(36).slice(2, 6)}`,
      name,
      type: moneyMoneyBillType(recurringGet(row, 'ZDOTYPE')),
      freq: 'monthly',
      active: true,
      amt,
      day,
      acct,
      cat: categoryInfo.cat !== 'other' ? categoryInfo.cat : 'bills',
      path: categoryInfo.cat !== 'other' ? [categoryInfo.cat] : ['bills'],
      ccy,
    };
  });

  return { transactions, accounts: importedAccounts, bills, categoryTree };
}

function normalizeSheetName(name) {
  return String(name || '').trim().toLowerCase();
}

function getSheetRows(workbook, expectedNames) {
  const wanted = new Set(expectedNames.map(normalizeSheetName));
  const actual = workbook.SheetNames.find(name => wanted.has(normalizeSheetName(name)));
  if (!actual) return [];
  return XLSX.utils.sheet_to_json(workbook.Sheets[actual], { defval: '' });
}

function getCellValue(row, ...patterns) {
  for (const [key, value] of Object.entries(row || {})) {
    const lower = key.toLowerCase();
    if (patterns.some(p => lower.includes(p))) return value;
  }
  return '';
}

function parseXlsxAmount(value) {
  const n = parseFloat(String(value ?? '').replace(/[$£€, ]/g, ''));
  return Number.isFinite(n) ? n : NaN;
}

function xlsxDateToIso(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) {
      const year = String(parsed.y).padStart(4, '0');
      const month = String(parsed.m).padStart(2, '0');
      const day = String(parsed.d).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
  }
  return csvIso(value);
}

function parseXlsxBool(value, fallback = true) {
  if (value === '' || value == null) return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['true', 'yes', 'y', '1', 'on'].includes(normalized)) return true;
  if (['false', 'no', 'n', '0', 'off'].includes(normalized)) return false;
  return fallback;
}

function buildAccountMap(accounts) {
  const map = new Map();
  for (const acct of accounts || []) {
    for (const key of [acct.id, acct.name]) {
      const normalized = String(key || '').trim().toLowerCase();
      if (normalized && !map.has(normalized)) map.set(normalized, acct.id);
    }
  }
  return map;
}

function isCashbookWorkbook(rows) {
  const headerSet = new Set(Object.keys(rows[0] || {}).map(h => h.toLowerCase()));
  return ['accounts', 'category', 'subcategory', 'income/expense', 'amount', 'currency'].every(h => headerSet.has(h));
}

function buildCashbookCategoryTree(rows) {
  const tree = { transfer: { label: 'Transfer' } };
  for (const row of rows || []) {
    const flow = String(row['Income/Expense'] ?? '').trim();
    if (!flow || /^transfer/i.test(flow)) continue;
    const catLabel = String(row.Category ?? '').trim();
    if (!catLabel) continue;
    const catKey = slugKey(catLabel);
    if (!tree[catKey]) tree[catKey] = { label: catLabel };
    const subLabel = String(row.Subcategory ?? '').trim();
    if (subLabel) {
      if (!tree[catKey].children) tree[catKey].children = {};
      const subKey = slugKey(subLabel);
      if (!tree[catKey].children[subKey]) tree[catKey].children[subKey] = { label: subLabel };
    }
  }
  return tree;
}

function parseCashbookXLSX(workbook) {
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  const accountNames = [...new Set(rows.map(row => String(row.Accounts ?? '').trim()).filter(Boolean))];
  const importedAccounts = accountNames.map((name, i) => ({
    id: `acct_${slugKey(name)}`,
    name,
    type: moneyMoneyAccountType(name),
    code: '',
    openingBal: 0,
    ccy: 'MXN',
    archived: false,
    includeInTotals: true,
    order: i,
  }));
  const acctMap = buildAccountMap(importedAccounts);

  const transactions = rows.map((row, i) => {
    const flow = String(row['Income/Expense'] ?? '').trim();
    const category = String(row.Category ?? '').trim();
    const subcategory = String(row.Subcategory ?? '').trim();
    const note = String(row.Note ?? '').trim();
    const description = String(row.Description ?? '').trim();
    const account = String(row.Accounts ?? '').trim();
    const currency = String(row.Currency ?? 'MXN').trim() || 'MXN';
    const amount = parseXlsxAmount(row.Amount ?? row.MXN ?? row.Accounts_1);
    if (!flow || !Number.isFinite(amount) || !account) return null;

    let signed = amount;
    if (/exp/i.test(flow) || /transfer-out/i.test(flow)) signed = -Math.abs(amount);
    else if (/income/i.test(flow) || /transfer-in/i.test(flow)) signed = Math.abs(amount);

    const isTransfer = /^transfer/i.test(flow);
    const catLabel = isTransfer ? 'Transfer' : (category || 'Other');
    const catKey = isTransfer ? 'transfer' : slugKey(catLabel);
    const path = isTransfer
      ? ['transfer']
      : subcategory
        ? [catKey, slugKey(subcategory)]
        : [catKey];

    const name = note || description || subcategory || category || (isTransfer ? 'Transfer' : 'Transaction');

    return {
      id: `xlsx_${i}_${Math.random().toString(36).slice(2, 6)}`,
      name,
      amt: signed,
      date: xlsxDateToIso(row.Period),
      cat: catKey,
      path,
      ccy: currency,
      acct: acctMap.get(account.toLowerCase()) || `acct_${slugKey(account)}`,
      memo: note || description || undefined,
    };
  }).filter(Boolean);

  const categoryTree = buildCashbookCategoryTree(rows);
  return { transactions, accounts: importedAccounts, bills: [], categoryTree };
}

export function parseXLSX(buffer) {
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  const firstRows = workbook.SheetNames.length ? XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: '' }) : [];
  if (firstRows.length && isCashbookWorkbook(firstRows)) {
    return parseCashbookXLSX(workbook);
  }

  const accountsRows = getSheetRows(workbook, ['accounts', 'account']);
  const billsRows = getSheetRows(workbook, ['bills', 'recurring', 'rules']);
  const txRows = getSheetRows(workbook, ['transactions', 'transaction', 'ledger']);
  const categoriesRows = getSheetRows(workbook, ['categories', 'category', 'category tree']);
  const fallbackRows = txRows.length || !workbook.SheetNames.length
    ? txRows
    : XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: '' });

  const importedAccounts = accountsRows.map((row, i) => {
    const id = String(getCellValue(row, 'id', 'account id') || `acct_${i}`).trim();
    const name = String(getCellValue(row, 'name', 'account') || `Account ${i + 1}`).trim();
    return {
      id,
      name,
      type: String(getCellValue(row, 'type') || moneyMoneyAccountType(name)).toUpperCase(),
      code: String(getCellValue(row, 'code') || ''),
      openingBal: parseXlsxAmount(getCellValue(row, 'opening balance', 'openingbal', 'balance')) || 0,
      ccy: String(getCellValue(row, 'currency', 'ccy') || 'USD').trim() || 'USD',
      archived: String(getCellValue(row, 'archived')).toLowerCase() === 'true' || Number(getCellValue(row, 'archived')) === 1,
      includeInTotals: parseXlsxBool(getCellValue(row, 'include in totals', 'include totals', 'in totals'), true),
      order: Number(getCellValue(row, 'order')) || i,
    };
  });

  const discoveredAccountNames = [...new Set([
    ...txRows.map(row => String(getCellValue(row, 'account', 'acct') || '').trim()).filter(Boolean),
    ...billsRows.map(row => String(getCellValue(row, 'account', 'acct') || '').trim()).filter(Boolean),
  ])];

  if (!importedAccounts.length && discoveredAccountNames.length) {
    for (const [i, name] of discoveredAccountNames.entries()) {
      importedAccounts.push({
        id: `acct_${slugKey(name)}`,
        name,
        type: moneyMoneyAccountType(name),
        code: '',
        openingBal: 0,
        ccy: 'USD',
        archived: false,
        includeInTotals: true,
        order: i,
      });
    }
  }

  const acctMap = buildAccountMap(importedAccounts);

  const transactions = fallbackRows.map((row, i) => {
    const name = String(getCellValue(row, 'description', 'name', 'merchant', 'payee', 'memo', 'details') || `Transaction ${i + 1}`).trim();
    const amt = parseXlsxAmount(getCellValue(row, 'amount', 'amt', 'value'));
    if (!name || !Number.isFinite(amt)) return null;
    const accountRaw = String(getCellValue(row, 'account', 'acct') || '').trim().toLowerCase();
    const catPath = splitPathValue(getCellValue(row, 'path', 'category path'));
    const catValue = String(getCellValue(row, 'category', 'cat', 'type', 'group') || '').trim();
    const cat = toCatKey(catValue || catPath[0] || 'other');
    return {
      id: `xlsx_${i}_${Math.random().toString(36).slice(2, 6)}`,
      name,
      amt,
      date: xlsxDateToIso(getCellValue(row, 'date', 'posted', 'time')),
      cat,
      path: catPath.length ? catPath : (cat !== 'other' ? [cat] : []),
      ccy: String(getCellValue(row, 'currency', 'ccy') || 'USD').trim() || 'USD',
      acct: acctMap.get(accountRaw) || importedAccounts[0]?.id || 'chk1',
      memo: String(getCellValue(row, 'memo', 'note', 'notes', 'remark', 'reference') || '').trim() || undefined,
    };
  }).filter(Boolean);

  const bills = billsRows.map((row, i) => {
    const name = String(getCellValue(row, 'name', 'title', 'payee') || `Bill ${i + 1}`).trim();
    const amt = Math.abs(parseXlsxAmount(getCellValue(row, 'amount', 'amt', 'value')) || 0);
    if (!name || !amt) return null;
    const accountRaw = String(getCellValue(row, 'account', 'acct') || '').trim().toLowerCase();
    const catPath = splitPathValue(getCellValue(row, 'path', 'category path'));
    const catValue = String(getCellValue(row, 'category', 'cat', 'type', 'group') || '').trim();
    const cat = toCatKey(catValue || catPath[0] || 'bills');
    const day = Number(getCellValue(row, 'day', 'due day')) || 1;
    const freq = String(getCellValue(row, 'freq', 'frequency') || 'monthly').toLowerCase();
    const activeCell = getCellValue(row, 'active', 'enabled');
    const active = activeCell === '' ? true : !(String(activeCell).toLowerCase() === 'false' || Number(activeCell) === 0);
    return {
      id: String(getCellValue(row, 'id') || `bill_${i}`).trim(),
      name,
      type: String(getCellValue(row, 'type') || 'expense').toLowerCase(),
      freq,
      active,
      amt,
      day,
      acct: acctMap.get(accountRaw) || importedAccounts[0]?.id || 'chk1',
      cat,
      path: catPath.length ? catPath : [cat],
      ccy: String(getCellValue(row, 'currency', 'ccy') || 'USD').trim() || 'USD',
    };
  }).filter(Boolean);

  const categoryTree = categoriesRows.length
    ? buildCategoryTreeFromRows(categoriesRows)
    : mergeCategoryPathsFromTransactions([...transactions, ...bills]);

  if (!importedAccounts.length && transactions.length) {
    const byName = new Map();
    for (const tx of transactions) {
      const key = String(tx.acct || '').trim().toLowerCase();
      if (key && !byName.has(key)) {
        byName.set(key, {
          id: key,
          name: tx.acct,
          type: 'CHK',
          code: '',
          openingBal: 0,
          ccy: tx.ccy || 'USD',
          archived: false,
          includeInTotals: true,
          order: byName.size,
        });
      }
    }
    importedAccounts.push(...byName.values());
  }

  return { transactions, accounts: importedAccounts, bills, categoryTree };
}

export function exportXLSX(store) {
  const workbook = XLSX.utils.book_new();
  const transactions = (store.allTransactions || []).map(tx => ({
    ID: tx.id,
    Date: tx.date || '',
    Description: tx.name || '',
    Amount: tx.amt ?? 0,
    Category: tx.cat || '',
    Path: pathToString(tx.path || (tx.cat ? [tx.cat] : [])),
    Account: tx.acct || '',
    Currency: tx.ccy || 'USD',
    Memo: tx.memo || '',
  }));
  const accounts = (store.accounts || []).map(acct => ({
    ID: acct.id,
    Name: acct.name,
    Type: acct.type || 'CHK',
    Code: acct.code || '',
    'Opening Balance': acct.openingBal ?? 0,
    Currency: acct.ccy || 'USD',
    Archived: Boolean(acct.archived),
    'Include In Totals': acct.includeInTotals !== false,
    Order: acct.order ?? 0,
  }));
  const bills = (store.bills || []).map(bill => ({
    ID: bill.id,
    Name: bill.name,
    Type: bill.type || 'expense',
    Freq: bill.freq || 'monthly',
    Active: bill.active !== false,
    Amount: bill.amt ?? 0,
    Day: bill.day || 1,
    Account: bill.acct || '',
    Category: bill.cat || '',
    Path: pathToString(bill.path || (bill.cat ? [bill.cat] : [])),
    Currency: bill.ccy || 'USD',
  }));
  const categories = flattenCategoryTree(store.categoryTree || {});

  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(transactions), 'Transactions');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(accounts), 'Accounts');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(bills), 'Bills');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(categories), 'Categories');
  return XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
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

  if (tables.includes('ZINOUTCOME') && tables.includes('ZASSET')) {
    const result = parseMoneyMoneySQLite(db);
    db.close();
    return result;
  }

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
    const { transactions, accounts, bills } = await parseSQLiteMMBAK(buffer);
    return { isLedgerBackup: false, transactions, accounts, bills };
  }

  throw new Error(
    `Unexpected token '${trimmed[0]}' — file is neither a LEDGER JSON backup nor a SQLite database.`
  );
}
