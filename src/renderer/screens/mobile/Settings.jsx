import React from 'react';
import { A, ACCENTS } from '../../theme';
import { ALabel, ARule } from '../../components/Shared';
import { useStore } from '../../store';
import ImportExport from '../../components/ImportExport';
import FxRatesSection from '../../components/FxRatesSection';
import BackupSection from '../../components/BackupSection';
import UpdatesSection from '../../components/UpdatesSection';
import { SecuritySettings, SecurityNudge } from '../../components/SecuritySettings';

const SETTINGS_CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'CHF', 'MXN'];
const SETTINGS_THEMES = ['light', 'dark', 'auto'];

export default function Settings({ t, onBack, onNavigate, setAccent, setDensity, setDecimals, setCurrency, setTheme }) {
  const { budgetStartDay, setBudgetStartDay, reset, loadSampleData, resetAndLoadSampleData, setOnboarded } = useStore();
  const [showIO, setShowIO] = React.useState(false);
  const [confirmReset, setConfirmReset] = React.useState(false);
  const [editingDay, setEditingDay] = React.useState(false);
  const [dayInput, setDayInput] = React.useState(String(budgetStartDay));
  const [showResetAndLoad, setShowResetAndLoad] = React.useState(false);
  const resetTimerRef = React.useRef(null);

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
    // Atomic reset+seed via the store action — see CAR-76 review notes.
    resetAndLoadSampleData();
    setShowResetAndLoad(false);
  };

  const replayOnboarding = () => {
    setOnboarded(false);
  };

  React.useEffect(() => () => clearTimeout(resetTimerRef.current), []);

  const cycleCurrency = () => {
    const idx = SETTINGS_CURRENCIES.indexOf(t.currency);
    setCurrency(SETTINGS_CURRENCIES[(idx + 1) % SETTINGS_CURRENCIES.length]);
  };

  const cycleTheme = () => {
    if (!setTheme) return;
    const current = SETTINGS_THEMES.includes(t.theme) ? t.theme : 'light';
    const idx = SETTINGS_THEMES.indexOf(current);
    setTheme(SETTINGS_THEMES[(idx + 1) % SETTINGS_THEMES.length]);
  };

  const commitDay = () => {
    const v = Math.max(1, Math.min(28, parseInt(dayInput, 10) || 1));
    setDayInput(String(v));
    setBudgetStartDay(v);
    setEditingDay(false);
  };

  const handleReset = () => {
    if (!confirmReset) {
      setConfirmReset(true);
      resetTimerRef.current = setTimeout(() => setConfirmReset(false), 3000);
    } else {
      clearTimeout(resetTimerRef.current);
      reset();
      onBack();
    }
  };

  return (
    <div style={{ padding: '0 18px 20px' }}>
      <div style={{ padding: '10px 0 6px', display: 'flex', justifyContent: 'space-between' }}>
        <button onClick={onBack} style={{ all: 'unset', cursor: 'pointer', fontSize: 10, letterSpacing: 1.2 }}>◂ BACK</button>
        <div style={{ fontSize: 10, letterSpacing: 1.2, color: A.muted }}>v1.0</div>
      </div>
      <ARule thick />

      {/* CAR-243: legacy plaintext install nudge — non-blocking, dismissable. */}
      <div style={{ marginTop: 12 }}>
        <SecurityNudge onSetup={() => {
          if (typeof document !== 'undefined') {
            document.getElementById('settings-security-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        }} />
      </div>

      {/* DISPLAY */}
      <div style={{ marginTop: 14 }}>
        <ALabel>DISPLAY</ALabel>
        <div style={{ marginTop: 6 }}>
          <button onClick={cycleTheme}
            style={{ all: 'unset', cursor: 'pointer', display: 'block', width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: t.density === 'compact' ? '9px 0' : '11px 0', borderBottom: '1px solid ' + A.rule2 }}>
              <span style={{ fontSize: 12 }}>THEME</span>
              <span style={{ fontSize: 11, color: A.muted }}>{(t.theme || 'light').toUpperCase()}</span>
            </div>
          </button>
          <div style={{ padding: '11px 0', borderBottom: '1px solid ' + A.rule2 }}>
            <div style={{ fontSize: 10, color: A.muted, marginBottom: 8, letterSpacing: 0.6 }}>ACCENT COLOR</div>
            <div style={{ display: 'flex', gap: 10 }}>
              {ACCENTS.map(a => (
                <button key={a.val} onClick={() => setAccent(a.val)} style={{
                  all: 'unset', cursor: 'pointer',
                  width: 18, height: 18, background: a.val,
                  border: t.accent === a.val ? '2px solid ' + A.ink : '1px solid ' + A.rule2,
                }} />
              ))}
            </div>
          </div>
          <button onClick={() => setDensity(t.density === 'comfortable' ? 'compact' : 'comfortable')}
            style={{ all: 'unset', cursor: 'pointer', display: 'block', width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: t.density === 'compact' ? '9px 0' : '11px 0', borderBottom: '1px solid ' + A.rule2 }}>
              <span style={{ fontSize: 12 }}>DENSITY</span>
              <span style={{ fontSize: 11, color: A.muted }}>{t.density.toUpperCase()}</span>
            </div>
          </button>
          <button onClick={() => setDecimals(!t.decimals)}
            style={{ all: 'unset', cursor: 'pointer', display: 'block', width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: t.density === 'compact' ? '9px 0' : '11px 0', borderBottom: '1px solid ' + A.rule2 }}>
              <span style={{ fontSize: 12 }}>DECIMALS</span>
              <span style={{ fontSize: 11, color: A.muted }}>{t.decimals ? 'SHOW' : 'HIDE'}</span>
            </div>
          </button>
          <button onClick={cycleCurrency}
            style={{ all: 'unset', cursor: 'pointer', display: 'block', width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: t.density === 'compact' ? '9px 0' : '11px 0', borderBottom: '1px solid ' + A.rule2 }}>
              <span style={{ fontSize: 12 }}>CURRENCY</span>
              <span style={{ fontSize: 11, color: A.muted }}>{t.currency}</span>
            </div>
          </button>
        </div>
      </div>

      {/* FX RATES */}
      <div style={{ marginTop: 14 }}>
        <ALabel>FX RATES</ALabel>
        <FxRatesSection />
      </div>

      {/* BUDGETS */}
      <div style={{ marginTop: 14 }}>
        <ALabel>BUDGETS</ALabel>
        <div style={{ marginTop: 6 }}>
          {editingDay ? (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 0', borderBottom: '1px solid ' + A.rule2 }}>
              <span style={{ fontSize: 12 }}>BUDGET · START DAY</span>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  autoFocus
                  type="number" min="1" max="28"
                  value={dayInput}
                  onChange={e => setDayInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') commitDay(); if (e.key === 'Escape') setEditingDay(false); }}
                  style={{ all: 'unset', width: 32, fontSize: 11, textAlign: 'right', borderBottom: '1px solid ' + A.ink, color: A.ink }}
                />
                <button onClick={commitDay} style={{ all: 'unset', cursor: 'pointer', fontSize: 14, color: t.accent }}>✓</button>
              </div>
            </div>
          ) : (
            <button onClick={() => { setDayInput(String(budgetStartDay)); setEditingDay(true); }}
              style={{ all: 'unset', cursor: 'pointer', display: 'block', width: '100%' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: t.density === 'compact' ? '9px 0' : '11px 0', borderBottom: '1px solid ' + A.rule2 }}>
                <span style={{ fontSize: 12 }}>BUDGET · START DAY</span>
                <span style={{ fontSize: 11, color: A.muted }}>DAY {budgetStartDay}</span>
              </div>
            </button>
          )}
        </div>
      </div>

      {/* BACKUP */}
      <div style={{ marginTop: 14 }}>
        <BackupSection />
      </div>

      {/* CAR-364: UPDATES */}
      <div style={{ marginTop: 14 }}>
        <UpdatesSection />
      </div>

      {/* CAR-243: SECURITY */}
      <div id="settings-security-section" style={{ marginTop: 14 }}>
        <SecuritySettings />
      </div>

      {/* DATA */}
      <div style={{ marginTop: 14 }}>
        <ALabel>DATA</ALabel>
        <div style={{ marginTop: 6 }}>
          <button onClick={() => onNavigate('categories')}
            style={{ all: 'unset', cursor: 'pointer', display: 'block', width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: t.density === 'compact' ? '9px 0' : '11px 0', borderBottom: '1px solid ' + A.rule2 }}>
              <span style={{ fontSize: 12 }}>CATEGORIES</span>
              <span style={{ fontSize: 11, color: A.muted }}>EDIT ▸</span>
            </div>
          </button>
          <button onClick={() => setShowIO(true)}
            style={{ all: 'unset', cursor: 'pointer', display: 'block', width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: t.density === 'compact' ? '9px 0' : '11px 0', borderBottom: '1px solid ' + A.rule2 }}>
              <span style={{ fontSize: 12 }}>IMPORT · EXPORT</span>
              <span style={{ fontSize: 11, color: A.muted }}>⇅</span>
            </div>
          </button>
          <button onClick={handleReset}
            style={{ all: 'unset', cursor: 'pointer', display: 'block', width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: t.density === 'compact' ? '9px 0' : '11px 0', borderBottom: '1px solid ' + A.rule2 }}>
              <span style={{ fontSize: 12 }}>RESET ALL DATA</span>
              <span style={{ fontSize: 11, color: confirmReset ? A.neg : A.muted }}>
                {confirmReset ? 'TAP AGAIN ↩' : 'RESET ▸'}
              </span>
            </div>
          </button>
          <button onClick={replayOnboarding}
            style={{ all: 'unset', cursor: 'pointer', display: 'block', width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: t.density === 'compact' ? '9px 0' : '11px 0', borderBottom: '1px solid ' + A.rule2 }}>
              <span style={{ fontSize: 12 }}>REPLAY ONBOARDING</span>
              <span style={{ fontSize: 11, color: A.muted }}>↺</span>
            </div>
          </button>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 0', borderBottom: '1px solid ' + A.rule2 }}>
            <div>
              <div style={{ fontSize: 9, color: A.muted, letterSpacing: 1 }}>SAMPLE · DATA</div>
              <div style={{ fontSize: 11, marginTop: 3 }}>Load demo entries</div>
            </div>
            <button onClick={handleLoadSampleClick} style={{
              all: 'unset', cursor: 'pointer', fontSize: 10, letterSpacing: 1.2,
              padding: '5px 10px', border: '1px solid ' + A.ink, color: A.ink,
            }}>LOAD</button>
          </div>
        </div>
      </div>

      {showIO && <ImportExport onClose={() => setShowIO(false)} />}
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
            width: 'min(320px, 88vw)',
          }}>
            <div style={{ fontSize: 9, color: A.muted, letterSpacing: 1.2 }}>SAMPLE · DATA</div>
            <div style={{ fontSize: 12, marginTop: 10, lineHeight: 1.5 }}>
              Your data isn't empty. Reset to empty first, then load samples?
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 18, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowResetAndLoad(false)} style={{
                all: 'unset', cursor: 'pointer', fontSize: 10, letterSpacing: 1.2,
                padding: '5px 12px', border: '1px solid ' + A.rule2, color: A.muted,
              }}>CANCEL</button>
              <button onClick={handleResetAndLoad} style={{
                all: 'unset', cursor: 'pointer', fontSize: 10, letterSpacing: 1.2,
                padding: '5px 12px', border: '1px solid ' + A.neg, background: A.neg, color: A.bg,
              }}>RESET & LOAD</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
