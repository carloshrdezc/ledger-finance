import React from 'react';
import { A, ACCENTS, THEMES } from '../../theme';
import { ALabel } from '../../components/Shared';
import WebShell from './WebShell';
import { useUndoableStore } from '../../useUndoableStore';
import ImportExport from '../../components/ImportExport';
import FxRatesSection from '../../components/FxRatesSection';
import BackupSection from '../../components/BackupSection';
import UpdatesSection from '../../components/UpdatesSection';
import RulesEditor from '../../components/RulesEditor';
import { SecuritySettings, SecurityNudge } from '../../components/SecuritySettings';
import { isLiquidAccount } from '../../forecast.mjs';

const CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'CHF', 'MXN'];

export default function WebSettings({ t, onNavigate, onAdd, setAccent, setDensity, setDecimals, setCurrency, setTheme }) {
  const { categoryTree, addCategory, renameCategory, removeCategory, budgetStartDay, setBudgetStartDay, reset, loadSampleData, resetAndLoadSampleData, rules, addRule, updateRule, deleteRule, reorderRules, updateTxsIndividually, transactions, accountsWithBalance, forecastLiquidAccountIds, setForecastLiquidAccountIds, forecastThreshold, setForecastThreshold, setOnboarded } = useUndoableStore();

  const [expanded, setExpanded] = React.useState({ edu: true, 'edu.school': true, 'edu.school.supplies': true, food: true });
  const [adding, setAdding] = React.useState(null);
  const [renaming, setRenaming] = React.useState(null);
  const [renameVal, setRenameVal] = React.useState('');
  const [confirmDelete, setConfirmDelete] = React.useState(null);
  const [newName, setNewName] = React.useState('');
  const [showIO, setShowIO] = React.useState(false);
  const [confirmReset, setConfirmReset] = React.useState(false);
  const [dayInput, setDayInput] = React.useState(String(budgetStartDay));
  const [thresholdInput, setThresholdInput] = React.useState(
    Number.isFinite(forecastThreshold) ? String(forecastThreshold) : '0'
  );
  const resetTimerRef = React.useRef(null);

  React.useEffect(() => { setDayInput(String(budgetStartDay)); }, [budgetStartDay]);
  React.useEffect(() => {
    setThresholdInput(Number.isFinite(forecastThreshold) ? String(forecastThreshold) : '0');
  }, [forecastThreshold]);
  React.useEffect(() => () => clearTimeout(resetTimerRef.current), []);

  const toggle = k => setExpanded(e => ({ ...e, [k]: !e[k] }));

  const startRename = (id, currentLabel) => {
    setRenaming(id);
    setRenameVal(currentLabel || '');
  };

  const commitRename = (path) => {
    const id = path.join('.');
    if (renaming !== id) return;
    renameCategory(path, renameVal.trim().toUpperCase());
    setRenaming(null);
    setRenameVal('');
  };

  const commitDay = () => {
    const v = Math.max(1, Math.min(28, parseInt(dayInput, 10) || 1));
    setDayInput(String(v));
    setBudgetStartDay(v);
  };

  const commitThreshold = () => {
    const n = Number(thresholdInput);
    const v = Number.isFinite(n) ? n : 0;
    setThresholdInput(String(v));
    setForecastThreshold(v);
  };

  // CAR-218: liquid-account selection. Same predicate the data layer uses
  // (CHK/SAV, any currency — CAR-359), so toggling here matches what the
  // forecast actually projects.
  const liquidAccounts = React.useMemo(
    () => (accountsWithBalance || []).filter(isLiquidAccount),
    [accountsWithBalance],
  );
  const selectedLiquidIds = React.useMemo(
    () => new Set(forecastLiquidAccountIds || []),
    [forecastLiquidAccountIds],
  );
  const toggleLiquidAccount = (id) => {
    let next;
    if (selectedLiquidIds.size === 0) {
      next = new Set(liquidAccounts.map(a => a.id));
      next.delete(id);
    } else {
      next = new Set(selectedLiquidIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
    }
    setForecastLiquidAccountIds(Array.from(next));
  };
  const clearLiquidAccountFilter = () => setForecastLiquidAccountIds([]);

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

  const [showResetAndLoad, setShowResetAndLoad] = React.useState(false);

  const handleLoadSampleClick = () => {
    try {
      loadSampleData();
    } catch (err) {
      if (err.message === 'LEDGER_NOT_EMPTY') {
        setShowResetAndLoad(true);
      } else {
        throw err;
      }
    }
  };

  const handleResetAndLoad = () => {
    // Use the store's atomic reset+seed action — bypasses the precondition
    // check that would observe stale closure state, and batches the writes.
    resetAndLoadSampleData();
    setShowResetAndLoad(false);
  };

  const replayOnboarding = () => {
    setOnboarded(false);
  };

  const renderNode = (key, node, path, depth) => {
    const id = path.join('.');
    const children = node.children || {};
    const hasKids = Object.keys(children).length > 0;
    const isOpen = expanded[id];
    const isRenaming = renaming === id;
    const isConfirming = confirmDelete === id;
    return (
      <div key={id}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '6px 0', paddingLeft: depth * 20, borderBottom: '1px solid ' + A.rule2 }}>
          <button onClick={() => hasKids ? toggle(id) : null}
            style={{ all: 'unset', cursor: hasKids ? 'pointer' : 'default', width: 22, color: A.ink2, fontSize: 12 }}>
            {hasKids ? (isOpen ? '−' : '+') : '·'}
          </button>
          {isRenaming ? (
            <input autoFocus value={renameVal} onChange={e => setRenameVal(e.target.value)}
              onBlur={() => commitRename(path)}
              onKeyDown={e => {
                if (e.key === 'Enter') commitRename(path);
                if (e.key === 'Escape') { setRenaming(null); setRenameVal(''); }
              }}
              style={{ flex: 1, fontFamily: A.font, fontSize: 11, background: 'transparent', border: 'none', borderBottom: '1px solid ' + A.ink, outline: 'none', padding: '2px 0', color: A.ink, letterSpacing: 0.6 }}
            />
          ) : (
            <span onClick={() => startRename(id, node.label || key)}
              style={{ fontSize: 11, letterSpacing: depth === 0 ? 1.2 : 0.4, fontWeight: depth === 0 ? 600 : 400, color: A.ink, flex: 1, cursor: 'text' }}>
              {node.glyph ? node.glyph + ' ' : ''}{node.label || key}
            </span>
          )}
          <span style={{ fontSize: 9, color: A.muted, letterSpacing: 1, marginRight: 12 }}>
            {depth > 0 ? path.slice(0, -1).map(p => p.toUpperCase()).join(' › ') : 'TOP · LEVEL'}
          </span>
          <button onClick={() => setAdding(id)} title="Add sub-category"
            style={{ all: 'unset', cursor: 'pointer', width: 22, textAlign: 'center', fontSize: 14, color: A.muted }}>+</button>
          {isConfirming ? (
            <>
              <button onClick={() => { removeCategory(path); setConfirmDelete(null); }}
                style={{ all: 'unset', cursor: 'pointer', fontSize: 9, color: A.neg, letterSpacing: 1, marginLeft: 6 }}>SURE?</button>
              <button onClick={() => setConfirmDelete(null)}
                style={{ all: 'unset', cursor: 'pointer', fontSize: 10, color: A.muted, marginLeft: 4 }}>×</button>
            </>
          ) : (
            <button onClick={() => setConfirmDelete(id)} title="Delete category"
              style={{ all: 'unset', cursor: 'pointer', width: 22, textAlign: 'center', fontSize: 11, color: A.muted }}>✕</button>
          )}
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

      {/* CAR-243: legacy plaintext install nudge — non-blocking, dismissable. */}
      <div style={{ marginTop: 16 }}>
        <SecurityNudge onSetup={() => {
          if (typeof document !== 'undefined') {
            document.getElementById('settings-security-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        }} />
      </div>

      <div style={{ marginTop: 24, display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 40 }}>
        {/* Category tree */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <ALabel>[02] CATEGORY · TREE</ALabel>
            <span style={{ fontSize: 10, color: A.muted, letterSpacing: 1 }}>+ ADD · CLICK NAME TO RENAME · ✕ TO DELETE</span>
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
            {/* Theme */}
            <div style={{ padding: '10px 0', borderBottom: '1px solid ' + A.rule2 }}>
              <div style={{ fontSize: 9, color: A.muted, letterSpacing: 1, marginBottom: 8 }}>THEME</div>
              <div style={{ display: 'flex', gap: 6 }}>
                {THEMES.map(({ val, label }) => (
                  <button key={val} onClick={() => setTheme(val)} style={{
                    all: 'unset', cursor: 'pointer', fontSize: 10, letterSpacing: 1.2,
                    padding: '5px 10px', border: '1px solid ' + (t.theme === val ? A.ink : A.rule2),
                    background: t.theme === val ? A.ink : 'transparent',
                    color: t.theme === val ? A.bg : A.ink,
                  }}>{label}</button>
                ))}
              </div>
            </div>
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

          {/* FX RATES */}
          <div style={{ marginTop: 20 }}>
            <ALabel>FX RATES</ALabel>
            <FxRatesSection />
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

          {/* CAR-218: CASH FLOW · FORECAST */}
          <div style={{ marginTop: 20 }}>
            <ALabel>CASH FLOW · FORECAST</ALabel>
            <div style={{ marginTop: 12, borderTop: '2px solid ' + A.ink }}>
              <div style={{ padding: '10px 0', borderBottom: '1px solid ' + A.rule2 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                  <div style={{ fontSize: 9, color: A.muted, letterSpacing: 1 }}>LIQUID · ACCOUNTS</div>
                  {selectedLiquidIds.size > 0 && (
                    <button onClick={clearLiquidAccountFilter} style={{
                      all: 'unset', cursor: 'pointer', fontSize: 9, color: A.muted, letterSpacing: 1,
                    }}>USE · ALL</button>
                  )}
                </div>
                {liquidAccounts.length === 0 ? (
                  <div style={{ fontSize: 10, color: A.muted, letterSpacing: 0.8 }}>
                    NO LIQUID ACCOUNTS YET — ADD A CHK OR SAV ACCOUNT IN USD.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {liquidAccounts.map(a => {
                      const isSelected = selectedLiquidIds.size === 0 || selectedLiquidIds.has(a.id);
                      return (
                        <button
                          key={a.id}
                          onClick={() => toggleLiquidAccount(a.id)}
                          title={a.name}
                          aria-pressed={isSelected}
                          style={{
                            all: 'unset', cursor: 'pointer',
                            fontSize: 10, letterSpacing: 1.2, padding: '5px 10px',
                            border: '1px solid ' + (isSelected ? A.ink : A.rule2),
                            background: isSelected ? A.ink : 'transparent',
                            color: isSelected ? A.bg : A.ink,
                          }}
                        >
                          {a.name.toUpperCase()}
                        </button>
                      );
                    })}
                  </div>
                )}
                <div style={{ fontSize: 9, color: A.muted, letterSpacing: 0.8, marginTop: 8 }}>
                  {selectedLiquidIds.size === 0
                    ? 'AUTO · USING EVERY LIQUID ACCOUNT'
                    : `INCLUDING ${selectedLiquidIds.size} OF ${liquidAccounts.length} ACCOUNTS`}
                </div>
              </div>
              <div style={{ padding: '10px 0', borderBottom: '1px solid ' + A.rule2 }}>
                <div style={{ fontSize: 9, color: A.muted, letterSpacing: 1, marginBottom: 8 }}>RISK · THRESHOLD</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type="number"
                    step="any"
                    value={thresholdInput}
                    onChange={e => setThresholdInput(e.target.value)}
                    onBlur={commitThreshold}
                    onKeyDown={e => e.key === 'Enter' && commitThreshold()}
                    aria-label="Forecast risk threshold"
                    style={{
                      fontFamily: A.font, fontSize: 13, width: 96,
                      border: 'none', borderBottom: '1px solid ' + A.ink,
                      background: 'transparent', color: A.ink, outline: 'none', padding: '2px 0',
                      textAlign: 'right',
                    }}
                  />
                  <span style={{ fontSize: 10, color: A.muted, letterSpacing: 0.8 }}>{t.currency} · DAYS BELOW THIS ARE FLAGGED</span>
                </div>
              </div>
            </div>
          </div>

          {/* BACKUP */}
          <div style={{ marginTop: 20 }}>
            <BackupSection />
          </div>

          {/* CAR-364: UPDATES */}
          <div style={{ marginTop: 20 }}>
            <UpdatesSection />
          </div>

          {/* CAR-243: SECURITY */}
          <div id="settings-security-section" style={{ marginTop: 20 }}>
            <SecuritySettings />
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
              <div style={{ padding: '10px 0', borderBottom: '1px solid ' + A.rule2 }}>
                <div style={{ fontSize: 9, color: A.muted, letterSpacing: 1, marginBottom: 8 }}>ONBOARDING</div>
                <button onClick={replayOnboarding} style={{
                  all: 'unset', cursor: 'pointer', fontSize: 10, letterSpacing: 1.2,
                  padding: '5px 12px', border: '1px solid ' + A.ink, color: A.ink,
                }}>
                  REPLAY ONBOARDING
                </button>
              </div>
              <div style={{ padding: '10px 0', borderBottom: '1px solid ' + A.rule2 }}>
                <div style={{ fontSize: 9, color: A.muted, letterSpacing: 1, marginBottom: 8 }}>SAMPLE · DATA</div>
                <button onClick={handleLoadSampleClick} style={{
                  all: 'unset', cursor: 'pointer', fontSize: 10, letterSpacing: 1.2,
                  padding: '5px 12px', border: '1px solid ' + A.ink, color: A.ink,
                }}>
                  LOAD SAMPLE DATA
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div style={{ marginTop: 32, borderTop: '2px solid ' + A.ink, paddingTop: 18 }}>
        <ALabel>[04] RULES</ALabel>
        <div style={{ marginTop: 12 }}>
          <RulesEditor
            rules={rules}
            categoryTree={categoryTree}
            accountsWithBalance={accountsWithBalance}
            transactions={transactions}
            onAddRule={addRule}
            onUpdateRule={updateRule}
            onDeleteRule={deleteRule}
            onReorderRules={reorderRules}
            onApplyToExisting={updateTxsIndividually}
          />
        </div>
      </div>
      {showResetAndLoad && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setShowResetAndLoad(false); }}
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: A.font,
          }}
        >
          <div style={{
            background: A.bg, color: A.ink,
            border: '2px solid ' + A.ink,
            padding: '24px 22px',
            width: 'min(360px, 90vw)',
          }}>
            <div style={{ fontSize: 9, color: A.muted, letterSpacing: 1.2 }}>
              SAMPLE · DATA
            </div>
            <div style={{ fontSize: 12, marginTop: 10, lineHeight: 1.5 }}>
              Your data isn't empty. Loading sample data would mix real and demo entries. Reset to empty first, then load samples?
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 18, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowResetAndLoad(false)} style={{
                all: 'unset', cursor: 'pointer', fontSize: 10, letterSpacing: 1.2,
                padding: '5px 12px', border: '1px solid ' + A.rule2, color: A.muted,
              }}>CANCEL</button>
              <button onClick={handleResetAndLoad} style={{
                all: 'unset', cursor: 'pointer', fontSize: 10, letterSpacing: 1.2,
                padding: '5px 12px', border: '1px solid ' + A.neg, background: A.neg, color: A.bg,
              }}>RESET & LOAD SAMPLES</button>
            </div>
          </div>
        </div>
      )}
    </WebShell>
  );
}
