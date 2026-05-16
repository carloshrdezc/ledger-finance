import React from 'react';
import { A } from '../theme';
import { ALabel } from './Shared';
import { useStore } from '../store';
import { parseQIF, parseCSV, parseXLSX, parseMMBAK, exportQIF, exportCSV, exportXLSX, exportMMBAK } from '../importExport';

function download(name, content, mime = 'text/plain') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type: mime }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

const ts = () => new Date().toISOString().slice(0, 10);

export default function ImportExport({ onClose }) {
  const store = useStore();
  const [status, setStatus] = React.useState(null);
  const inputRef = React.useRef();

  const handleFile = async file => {
    if (!file) return;
    setStatus(null);
    setStatus({ ok: null, msg: 'Reading file…' });
    try {
      const buffer = await file.arrayBuffer();
      const text = new TextDecoder('utf-8', { fatal: false }).decode(buffer);
      const ext = file.name.split('.').pop().toLowerCase();

      if (ext === 'qif') {
        const txs = parseQIF(text);
        store.addTransactions(txs);
        setStatus({ ok: true, msg: `Imported ${txs.length} transactions from QIF` });
      } else if (ext === 'csv') {
        const txs = parseCSV(text);
        store.addTransactions(txs);
        setStatus({ ok: true, msg: `Imported ${txs.length} transactions from CSV` });
      } else if (ext === 'xlsx') {
        const data = parseXLSX(buffer);
        if (data.accounts?.length) store.setAccounts(data.accounts);
        if (data.categoryTree && Object.keys(data.categoryTree).length) store.setCategoryTree(data.categoryTree);
        if (data.bills?.length) store.setBills(data.bills);
        store.addTransactions(data.transactions);
        const acctNote = data.accounts?.length ? ` · ${data.accounts.length} accounts` : '';
        const catNote = data.categoryTree && Object.keys(data.categoryTree).length ? ' · categories' : '';
        const billNote = data.bills?.length ? ` · ${data.bills.length} recurring rules` : '';
        setStatus({ ok: true, msg: `Imported ${data.transactions.length} transactions${acctNote}${catNote}${billNote} from XLSX` });
      } else if (ext === 'mmbak') {
        const data = await parseMMBAK(text, buffer);
        if (data.isLedgerBackup) {
          if (data.accounts?.length) store.setAccounts(data.accounts);
          if (data.transactions) store.setTransactions(data.transactions);
          if (data.categoryTree) store.setCategoryTree(data.categoryTree);
          if (data.budgets) store.setBudgets(data.budgets);
          if (data.bills) store.setBills(data.bills);
          if (data.goals) store.setGoals(data.goals);
          if (data.goalContributions) store.setGoalContributions(data.goalContributions);
          setStatus({ ok: true, msg: `Backup restored · ${data.transactions?.length ?? 0} transactions` });
        } else {
          if (data.accounts?.length) store.setAccounts(data.accounts);
          if (data.categoryTree && Object.keys(data.categoryTree).length) store.setCategoryTree(data.categoryTree);
          if (data.bills?.length) store.setBills(data.bills);
          store.addTransactions(data.transactions);
          const acctNote = data.accounts?.length ? ` · ${data.accounts.length} accounts` : '';
          const catNote = data.categoryTree && Object.keys(data.categoryTree).length ? ` · categories` : '';
          const billNote = data.bills?.length ? ` · ${data.bills.length} recurring rules` : '';
          setStatus({ ok: true, msg: `Imported ${data.transactions.length} transactions${acctNote}${catNote}${billNote} from MoneyMoney` });
        }
      } else {
        setStatus({ ok: false, msg: 'Unsupported format — use .qif, .csv, or .mmbak' });
      }
    } catch (e) {
      setStatus({ ok: false, msg: e.message });
    }
  };

  const exports = [
    ['QIF',   'QUICKEN FORMAT', () => download(`ledger-${ts()}.qif`,   exportQIF(store.transactions))],
    ['CSV',   'SPREADSHEET',    () => download(`ledger-${ts()}.csv`,   exportCSV(store.transactions))],
    ['XLSX',  'WORKBOOK',       () => download(`ledger-${ts()}.xlsx`,  exportXLSX(store), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')],
    ['MMBAK', 'FULL BACKUP',    () => download(`ledger-${ts()}.mmbak`, exportMMBAK(store))],
  ];

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(21,19,15,0.55)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onClose}
    >
      <div onClick={e => e.stopPropagation()} style={{ background: A.bg, border: '2px solid ' + A.ink, width: 460, padding: 32, fontFamily: A.font }}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 24 }}>
          <ALabel>IMPORT · EXPORT</ALabel>
          <button onClick={onClose} style={{ all: 'unset', cursor: 'pointer', fontSize: 20, color: A.muted }}>×</button>
        </div>

        <ALabel>IMPORT</ALabel>
        <div
          style={{ marginTop: 10, border: '1.5px dashed ' + A.ink, padding: '28px 0', textAlign: 'center', cursor: 'pointer' }}
          onClick={() => inputRef.current.click()}
          onDrop={e => { e.preventDefault(); handleFile(e.dataTransfer.files[0]); }}
          onDragOver={e => e.preventDefault()}
        >
          <div style={{ fontSize: 11, letterSpacing: 1.4, color: A.muted }}>DROP FILE · OR · CLICK TO BROWSE</div>
          <div style={{ fontSize: 9, color: A.muted, marginTop: 6, letterSpacing: 1 }}>ACCEPTS · .QIF · .CSV · .XLSX · .MMBAK</div>
          <input ref={inputRef} type="file" accept=".qif,.csv,.xlsx,.mmbak" style={{ display: 'none' }}
            onChange={e => { handleFile(e.target.files[0]); e.target.value = ''; }} />
        </div>

        <ALabel style={{ marginTop: 20 }}>EXPORT</ALabel>
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          {exports.map(([label, sub, fn]) => (
            <button key={label} onClick={fn} style={{ all: 'unset', cursor: 'pointer', flex: 1, textAlign: 'center', padding: '12px 0', border: '1px solid ' + A.ink, fontSize: 10, letterSpacing: 1.2 }}>
              <div>{label}</div>
              <div style={{ fontSize: 8, color: A.muted, marginTop: 3, letterSpacing: 1 }}>{sub}</div>
            </button>
          ))}
        </div>

        {status && (
          <div style={{ marginTop: 14, padding: '9px 12px', fontSize: 10, letterSpacing: 1, border: '1px solid ' + (status.ok === true ? A.rule2 : status.ok === false ? A.neg : A.rule2), color: status.ok === true ? A.ink : status.ok === false ? A.neg : A.muted }}>
            {status.ok === true ? '✓ ' : status.ok === false ? '✗ ' : '⋯ '}{status.msg}
          </div>
        )}

        <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid ' + A.rule2, display: 'flex', alignItems: 'center', fontSize: 9, color: A.muted, letterSpacing: 1 }}>
          <span>{store.transactions.length} TRANSACTIONS · STORED LOCALLY</span>
          <button
            onClick={() => { store.reset(); setStatus({ ok: true, msg: 'Reset to sample data' }); }}
            style={{ all: 'unset', cursor: 'pointer', marginLeft: 'auto', fontSize: 9, letterSpacing: 1, color: A.neg }}
          >
            RESET TO DEFAULTS
          </button>
        </div>
      </div>
    </div>
  );
}
