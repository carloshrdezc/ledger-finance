import React from 'react';
import { A } from '../../theme';
import { ALabel } from '../../components/Shared';
import WebShell from './WebShell';
import { useStore } from '../../store';
import ImportExport from '../../components/ImportExport';

export default function WebSettings({ t, onNavigate, onAdd }) {
  const { categoryTree, addCategory } = useStore();
  const [expanded, setExpanded] = React.useState({ edu: true, 'edu.school': true, 'edu.school.supplies': true, food: true });
  const [adding, setAdding] = React.useState(null);
  const [newName, setNewName] = React.useState('');
  const [showIO, setShowIO] = React.useState(false);

  const toggle = k => setExpanded(e => ({ ...e, [k]: !e[k] }));

  const renderNode = (key, node, path, depth) => {
    const id = path.join('.');
    const children = node.children || {};
    const hasKids = Object.keys(children).length > 0;
    const isOpen = expanded[id];
    return (
      <div key={id}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '6px 0', paddingLeft: depth * 20, borderBottom: '1px solid ' + A.rule2 }}>
          <button onClick={() => hasKids ? toggle(id) : null}
            style={{ all: 'unset', cursor: hasKids ? 'pointer' : 'default', width: 22, color: A.ink2, fontSize: 12 }}>
            {hasKids ? (isOpen ? '−' : '+') : '·'}
          </button>
          <span style={{ fontSize: 11, letterSpacing: depth === 0 ? 1.2 : 0.4, fontWeight: depth === 0 ? 600 : 400, color: A.ink, flex: 1 }}>
            {node.glyph ? node.glyph + ' ' : ''}{node.label || key}
          </span>
          <span style={{ fontSize: 9, color: A.muted, letterSpacing: 1, marginRight: 12 }}>
            {depth > 0 ? path.slice(0, -1).map(p => p.toUpperCase()).join(' › ') : 'TOP · LEVEL'}
          </span>
          <button onClick={() => setAdding(id)}
            style={{ all: 'unset', cursor: 'pointer', width: 22, textAlign: 'center', fontSize: 14, color: A.muted }}>+</button>
        </div>
        {adding === id && (
          <div style={{ display: 'flex', gap: 8, padding: '6px 0', paddingLeft: (depth + 1) * 20 + 22, borderBottom: '1px solid ' + A.rule2 }}>
            <input autoFocus value={newName} onChange={e => setNewName(e.target.value)}
              placeholder="NEW · SUB · CATEGORY"
              onKeyDown={e => {
                if (e.key === 'Enter' && newName.trim()) {
                  addCategory(path, newName.trim().toUpperCase());
                  setExpanded(e => ({ ...e, [id]: true }));
                  setNewName(''); setAdding(null);
                }
                if (e.key === 'Escape') { setNewName(''); setAdding(null); }
              }}
              style={{ flex: 1, fontFamily: A.font, fontSize: 11, background: 'transparent', border: 'none', borderBottom: '1px solid ' + A.ink, outline: 'none', padding: '4px 0', color: A.ink, letterSpacing: 0.8 }}
            />
            <button onClick={() => { setNewName(''); setAdding(null); }}
              style={{ all: 'unset', cursor: 'pointer', fontSize: 10, color: A.muted, letterSpacing: 1 }}>× CANCEL</button>
          </div>
        )}
        {isOpen && Object.entries(children).map(([k, n]) => renderNode(k, n, [...path, k], depth + 1))}
      </div>
    );
  };

  return (
    <WebShell active="settings" t={t} onNavigate={onNavigate} onAdd={onAdd}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <ALabel>[01] SETTINGS</ALabel>
        <button onClick={() => setShowIO(true)} style={{ all: 'unset', cursor: 'pointer', fontSize: 10, letterSpacing: 1.2, padding: '5px 12px', border: '1px solid ' + A.ink }}>
          IMPORT · EXPORT ⇅
        </button>
      </div>
      <div style={{ fontSize: 36, letterSpacing: -1, marginTop: 8, fontWeight: 600 }}>Categories &amp; preferences</div>
      {showIO && <ImportExport onClose={() => setShowIO(false)} />}

      <div style={{ marginTop: 24, display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 40 }}>
        {/* Category tree */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <ALabel>[02] CATEGORY · TREE</ALabel>
            <span style={{ fontSize: 10, color: A.muted, letterSpacing: 1 }}>NEST AS DEEP AS YOU NEED · + ON ANY ROW</span>
          </div>
          <div style={{ marginTop: 12, borderTop: '2px solid ' + A.ink }}>
            {Object.entries(categoryTree).map(([k, n]) => renderNode(k, n, [k], 0))}
          </div>
          <div style={{ marginTop: 16, padding: '10px 14px', border: '1.5px dashed ' + A.ink, fontSize: 10, color: A.ink2, letterSpacing: 1.2, textAlign: 'center', cursor: 'pointer' }}>
            + ADD · TOP · LEVEL · CATEGORY
          </div>
        </div>

        {/* Preferences */}
        <div>
          <ALabel>[03] PREFERENCES</ALabel>
          <div style={{ marginTop: 12, borderTop: '2px solid ' + A.ink }}>
            {[
              ['PROFILE', [['ACCOUNT','m@example.com'],['CURRENCY','USD · EUR · GBP'],['TIMEZONE','AMERICA / NEW_YORK']]],
              ['DATA',    [['LINKED','8 INSTITUTIONS'],['RULES','12 ACTIVE'],['MERCHANTS','47 KNOWN']]],
              ['BUDGETS', [['PERIOD','MONTHLY · 1→31'],['ROLLOVER','ON'],['ALERTS','80%']]],
              ['SECURITY',[['2FA','ON · APP'],['BIOMETRICS','ENABLED'],['SESSIONS','2 DEVICES']]],
              ['EXPORT',  [['CSV · 30D','↓ DOWNLOAD'],['OFX · 90D','↓ DOWNLOAD'],['PDF · STATEMENT','↓ DOWNLOAD']]],
            ].map(([title, rows]) => (
              <div key={title} style={{ paddingTop: 16, paddingBottom: 4 }}>
                <ALabel>{title}</ALabel>
                <div style={{ marginTop: 4 }}>
                  {rows.map(([k, v], i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontSize: 11, borderBottom: '1px solid ' + A.rule2 }}>
                      <span style={{ letterSpacing: 0.4 }}>{k}</span>
                      <span style={{ color: A.muted }}>{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </WebShell>
  );
}
