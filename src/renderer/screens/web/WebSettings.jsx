import React from 'react';
import { A, ACCENTS } from '../../theme';
import { ALabel } from '../../components/Shared';
import WebShell from './WebShell';
import { useStore } from '../../store';
import ImportExport from '../../components/ImportExport';

const CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'CHF', 'MXN'];

export default function WebSettings({ t, onNavigate, onAdd, setAccent, setDensity, setDecimals, setCurrency }) {
  const { categoryTree, addCategory, budgetStartDay, setBudgetStartDay, reset } = useStore();
  const [expanded, setExpanded] = React.useState({ edu: true, 'edu.school': true, 'edu.school.supplies': true, food: true });
  const [adding, setAdding] = React.useState(null);
  const [newName, setNewName] = React.useState('');
  const [showIO, setShowIO] = React.useState(false);
  const [confirmReset, setConfirmReset] = React.useState(false);
  const [dayInput, setDayInput] = React.useState(String(budgetStartDay));
  const resetTimerRef = React.useRef(null);

  React.useEffect(() => { setDayInput(String(budgetStartDay)); }, [budgetStartDay]);
  React.useEffect(() => () => clearTimeout(resetTimerRef.current), []);

  const toggle = k => setExpanded(e => ({ ...e, [k]: !e[k] }));

  const commitDay = () => {
    const v = Math.max(1, Math.min(28, parseInt(dayInput, 10) || 1));
    setDayInput(String(v));
    setBudgetStartDay(v);
  };

  const handleResetClick = () => {
    if (!confirmReset) {
      setConfirmReset(true);
      resetTimerRef.current = setTimeout(() => setConfirmReset(false), 3000);
    } else {
      clearTimeout(resetTimerRef.current);
      reset();
      setConfirmReset(false);
    }
  };

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
                  setExpanded(ex => ({ ...ex, [id]: true }));
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

          {adding === '__root__' ? (
            <div style={{ display: 'flex', gap: 8, marginTop: 12, padding: '8px 0', borderTop: '1px dashed ' + A.ink }}>
              <input autoFocus value={newName} onChange={e => setNewName(e.target.value)}
                placeholder="NEW · TOP · LEVEL · CATEGORY"
                onKeyDown={e => {
                  if (e.key === 'Enter' && newName.trim()) {
                    addCategory([], newName.trim().toUpperCase());
                    setNewName(''); setAdding(null);
                  }
                  if (e.key === 'Escape') { setNewName(''); setAdding(null); }
                }}
                style={{ flex: 1, fontFamily: A.font, fontSize: 11, background: 'transparent', border: 'none', borderBottom: '1px solid ' + A.ink, outline: 'none', padding: '4px 0', color: A.ink, letterSpacing: 0.8 }}
              />
              <button onClick={() => { setNewName(''); setAdding(null); }}
                style={{ all: 'unset', cursor: 'pointer', fontSize: 10, color: A.muted, letterSpacing: 1 }}>× CANCEL</button>
            </div>
          ) : (
            <div
              onClick={() => setAdding('__root__')}
              style={{ marginTop: 16, padding: '10px 14px', border: '1.5px dashed ' + A.ink, fontSize: 10, color: A.ink2, letterSpacing: 1.2, textAlign: 'center', cursor: 'pointer' }}>
              + ADD · TOP · LEVEL · CATEGORY
            </div>
          )}
        </div>

        {/* Preferences */}
        <div>
          {/* DISPLAY */}
          <ALabel>[03] DISPLAY</ALabel>
          <div style={{ marginTop: 12, borderTop: '2px solid ' + A.ink }}>
            {/* Accent color */}
            <div style={{ padding: '10px 0', borderBottom: '1px solid ' + A.rule2 }}>
              <div style={{ fontSize: 9, color: A.muted, letterSpacing: 1, marginBottom: 8 }}>ACCENT COLOR</div>
              <div style={{ display: 'flex', gap: 8 }}>
                {ACCENTS.map(a => (
                  <button key={a.val} onClick={() => setAccent(a.val)} title={a.label} style={{
                    all: 'unset', cursor: 'pointer',
                    width: 18, height: 18, background: a.val,
                    border: t.accent === a.val ? '2px solid ' + A.ink : '1px solid ' + A.rule2,
                  }} />
                ))}
              </div>
            </div>
            {/* Density */}
            <div style={{ padding: '10px 0', borderBottom: '1px solid ' + A.rule2 }}>
              <div style={{ fontSize: 9, color: A.muted, letterSpacing: 1, marginBottom: 8 }}>DENSITY</div>
              <div style={{ display: 'flex', gap: 6 }}>
                {['comfortable', 'compact'].map(d => (
                  <button key={d} onClick={() => setDensity(d)} style={{
                    all: 'unset', cursor: 'pointer', fontSize: 10, letterSpacing: 1.2,
                    padding: '5px 10px', border: '1px solid ' + (t.density === d ? A.ink : A.rule2),
                    background: t.density === d ? A.ink : 'transparent',
                    color: t.density === d ? A.bg : A.ink,
                  }}>{d.toUpperCase()}</button>
                ))}
              </div>
            </div>
            {/* Decimals */}
            <div style={{ padding: '10px 0', borderBottom: '1px solid ' + A.rule2 }}>
              <div style={{ fontSize: 9, color: A.muted, letterSpacing: 1, marginBottom: 8 }}>DECIMALS</div>
              <div style={{ display: 'flex', gap: 6 }}>
                {[['SHOW', true], ['HIDE', false]].map(([label, val]) => (
                  <button key={label} onClick={() => setDecimals(val)} style={{
                    all: 'unset', cursor: 'pointer', fontSize: 10, letterSpacing: 1.2,
                    padding: '5px 10px', border: '1px solid ' + (t.decimals === val ? A.ink : A.rule2),
                    background: t.decimals === val ? A.ink : 'transparent',
                    color: t.decimals === val ? A.bg : A.ink,
                  }}>{label}</button>
                ))}
              </div>
            </div>
            {/* Currency */}
            <div style={{ padding: '10px 0', borderBottom: '1px solid ' + A.rule2 }}>
              <div style={{ fontSize: 9, color: A.muted, letterSpacing: 1, marginBottom: 8 }}>CURRENCY</div>
              <select value={t.currency} onChange={e => setCurrency(e.target.value)} style={{
                fontFamily: A.font, fontSize: 11, padding: '4px 8px',
                border: '1px solid ' + A.ink, background: A.bg, color: A.ink, cursor: 'pointer',
              }}>
                {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          {/* BUDGETS */}
          <div style={{ marginTop: 20 }}>
            <ALabel>BUDGETS</ALabel>
            <div style={{ marginTop: 12, borderTop: '2px solid ' + A.ink }}>
              <div style={{ padding: '10px 0', borderBottom: '1px solid ' + A.rule2 }}>
                <div style={{ fontSize: 9, color: A.muted, letterSpacing: 1, marginBottom: 8 }}>BUDGET · PERIOD · START DAY</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type="number" min="1" max="28"
                    value={dayInput}
                    onChange={e => setDayInput(e.target.value)}
                    onBlur={commitDay}
                    onKeyDown={e => e.key === 'Enter' && commitDay()}
                    style={{
                      fontFamily: A.font, fontSize: 13, width: 48,
                      border: 'none', borderBottom: '1px solid ' + A.ink,
                      background: 'transparent', color: A.ink, outline: 'none', padding: '2px 0',
                      textAlign: 'center',
                    }}
                  />
                  <span style={{ fontSize: 10, color: A.muted, letterSpacing: 0.8 }}>OF EACH MONTH</span>
                </div>
              </div>
            </div>
          </div>

          {/* DATA */}
          <div style={{ marginTop: 20 }}>
            <ALabel>DATA</ALabel>
            <div style={{ marginTop: 12, borderTop: '2px solid ' + A.ink }}>
              <div style={{ padding: '10px 0', borderBottom: '1px solid ' + A.rule2 }}>
                <div style={{ fontSize: 9, color: A.muted, letterSpacing: 1, marginBottom: 8 }}>RESET · ALL · DATA</div>
                <button onClick={handleResetClick} style={{
                  all: 'unset', cursor: 'pointer', fontSize: 10, letterSpacing: 1.2,
                  padding: '5px 12px', border: '1px solid ' + A.neg, color: confirmReset ? A.bg : A.neg,
                  background: confirmReset ? A.neg : 'transparent',
                }}>
                  {confirmReset ? 'CLICK AGAIN TO CONFIRM ↩' : 'RESET ALL DATA'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </WebShell>
  );
}
