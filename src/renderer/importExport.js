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
      d: qifDay(date),
      cat: toCatKey(cat),
      ccy: 'USD', acct: 'chk1',
      memo: memo || undefined,
    });
  }
  return txs;
}

function qifDay(s) {
  if (!s) return new Date().getDate();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (iso) return +iso[3];
  const mdy = s.match(/^(\d{1,2})[\/\-\.']\s*(\d{1,2})/); if (mdy) return +mdy[2];
  return new Date().getDate();
}

export function exportQIF(transactions) {
  const d = new Date(), mo = d.getMonth() + 1, yr = d.getFullYear();
  const lines = ['!Type:Bank'];
  for (const tx of transactions) {
    lines.push(`D${mo}/${tx.d || 1}/${yr}`);
    lines.push(`T${tx.amt.toFixed(2)}`);
    lines.push(`P${tx.name}`);
    if (tx.cat) lines.push(`L${tx.cat}`);
    if (tx.memo) lines.push(`M${tx.memo}`);
    lines.push('^');
  }
  return lines.join('\n');
}

// ─── CSV ──────────────────────────────────────────────────────────────────

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
      d: dateI >= 0 ? csvDay(c[dateI]) : new Date().getDate(),
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

function csvDay(s) {
  if (!s) return new Date().getDate();
  s = s.replace(/['"]/g, '').trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (iso) return +iso[3];
  const p = s.split(/[\/\-\.]/);
  if (p.length >= 2) return +p[0] > 12 ? +p[0] : +p[1];
  return new Date().getDate();
}

export function exportCSV(transactions) {
  const d = new Date(), yr = d.getFullYear(), mo = String(d.getMonth() + 1).padStart(2, '0');
  const esc = s => `"${(s || '').replace(/"/g, '""')}"`;
  return [
    'Date,Description,Amount,Category,Account,Currency,Memo',
    ...transactions.map(tx =>
      [
        `${yr}-${mo}-${String(tx.d || 1).padStart(2, '0')}`,
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

// ─── MMBAK (full JSON backup) ──────────────────────────────────────────────

export function exportMMBAK(store) {
  return JSON.stringify({
    _type: 'ledger-backup',
    version: 1,
    exported: new Date().toISOString(),
    transactions: store.allTransactions,
    categoryTree: store.categoryTree,
    budgets: store.budgets,
  }, null, 2);
}

export function parseMMBAK(text) {
  const d = JSON.parse(text);
  if (d._type !== 'ledger-backup')
    throw new Error('Not a valid LEDGER backup file. Expected .mmbak exported from LEDGER.');
  return d;
}
