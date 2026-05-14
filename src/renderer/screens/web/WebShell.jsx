import React from 'react';
import { A } from '../../theme';

const NAV_ITEMS = [
  ['DASHBOARD',     'dashboard'],
  ['ACCOUNTS',      'accounts'],
  ['TRANSACTIONS',  'tx'],
  ['BUDGETS',       'budgets'],
  ['INVESTMENTS',   'investments'],
  ['GOALS',         'goals'],
  ['BILLS',         'bills'],
  ['REPORTS',       'reports'],
  ['SETTINGS',      'settings'],
];

export default function WebShell({ active, t, onNavigate, children }) {
  return (
    <div style={{ background: A.bg, color: A.ink, fontFamily: A.font, height: '100%', overflow: 'auto' }}>
      <div style={{ padding: '28px 40px', display: 'grid', gridTemplateColumns: '200px 1fr', gap: 40, minHeight: '100%', boxSizing: 'border-box' }}>
        {/* Sidebar */}
        <div style={{ position: 'sticky', top: 28, alignSelf: 'start' }}>
          <div style={{ fontSize: 14, letterSpacing: 3, fontWeight: 700, marginBottom: 24 }}>
            LEDGER<span style={{ color: t.accent }}>.</span>
          </div>
          {NAV_ITEMS.map(([label, key], i) => (
            <button key={key} onClick={() => onNavigate(key)}
              style={{
                all: 'unset', cursor: 'pointer', display: 'block', width: '100%',
                padding: '7px 0', borderBottom: '1px solid ' + A.rule2,
                fontSize: 11, letterSpacing: 1.4,
                fontWeight: active === key ? 700 : 400,
                color: active === key ? A.ink : A.ink2,
              }}>
              [{String(i + 1).padStart(2, '0')}] {label}
            </button>
          ))}
          <div style={{ fontSize: 10, letterSpacing: 1.4, color: A.ink2, textTransform: 'uppercase', marginTop: 28 }}>LINKED · 8</div>
          <div style={{ fontSize: 11, color: A.muted, marginTop: 8, lineHeight: 1.7 }}>
            CHASE · AMEX · ALLY<br />VANGUARD · FIDELITY<br />COINBASE · WISE<br />
            <span style={{ color: t.accent }}>● SYNCED 09:41 PT</span>
          </div>
          <div style={{ fontSize: 10, letterSpacing: 1.4, color: A.ink2, textTransform: 'uppercase', marginTop: 28 }}>QUICK · ADD</div>
          <div style={{ marginTop: 8, padding: '10px 12px', border: '1.5px solid ' + A.ink, fontSize: 11, letterSpacing: 1.2, cursor: 'pointer', display: 'flex', justifyContent: 'space-between' }}>
            <span>+ TRANSACTION</span><span style={{ color: A.muted }}>⌘N</span>
          </div>
        </div>
        {/* Content */}
        <div>{children}</div>
      </div>
    </div>
  );
}
