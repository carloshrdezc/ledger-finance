import React from 'react';
import { A } from '../theme';
import { ALabel, ARule } from '../components/Shared';
import { useStore } from '../store';
import ImportExport from '../components/ImportExport';
import AccountFormModal from '../components/AccountFormModal';
import AccountFormSheet from '../components/AccountFormSheet';
import BudgetFormModal from '../components/BudgetFormModal';
import BudgetFormSheet from '../components/BudgetFormSheet';

const BUDGET_SUGGESTIONS = ['RENT', 'GROCERIES', 'TRANSPORT', 'DINING', 'UTILITIES', 'SUBSCRIPTIONS'];

const MOBILE_BREAKPOINT = 720;

function useViewportMobile() {
  const get = () => (typeof window !== 'undefined' ? window.innerWidth < MOBILE_BREAKPOINT : false);
  const [isMobile, setIsMobile] = React.useState(get);
  React.useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const onResize = () => setIsMobile(get());
    window.addEventListener('resize', onResize);
    // Older iOS Safari fires `orientationchange` without `resize`; modern
    // browsers fire both. Listening to both is harmless and covers the gap.
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, []);
  return isMobile;
}

export default function Onboarding({ mobile: mobileProp }) {
  const viewportMobile = useViewportMobile();
  const mobile = typeof mobileProp === 'boolean' ? mobileProp : viewportMobile;
  const { onboarded, setOnboarded, accounts, budgets } = useStore();
  const [step, setStep] = React.useState(0);
  const [showImport, setShowImport] = React.useState(false);
  const [showAccount, setShowAccount] = React.useState(false);
  const [showBudget, setShowBudget] = React.useState(false);

  const accountCount = accounts.length;
  const budgetCount = budgets.length;

  // Auto-advance when the user actually adds an account or budget while
  // the corresponding form is open. The form's onClose fires on both Save
  // and Cancel, so we can't rely on it alone — instead we watch the store
  // length, which only changes on a real Save.
  const prevAccountCountRef = React.useRef(accountCount);
  const prevBudgetCountRef = React.useRef(budgetCount);
  React.useEffect(() => {
    if (accountCount > prevAccountCountRef.current && step === 1) {
      setStep(s => Math.min(3, s + 1));
    }
    prevAccountCountRef.current = accountCount;
  }, [accountCount, step]);
  React.useEffect(() => {
    // We don't auto-advance on budget add; user explicitly clicks "Finish onboarding".
    prevBudgetCountRef.current = budgetCount;
  }, [budgetCount]);

  // Hooks above this line — early return must come AFTER all hook calls so
  // hook count stays stable across renders (including the post-finish render
  // where onboarded becomes true).
  if (onboarded) return null;

  const AccountForm = mobile ? AccountFormSheet : AccountFormModal;
  const BudgetForm = mobile ? BudgetFormSheet : BudgetFormModal;

  const finish = () => setOnboarded(true);
  const next = () => setStep(s => Math.min(3, s + 1));
  const skipToNext = () => setStep(s => Math.min(3, s + 1));

  const shellStyle = mobile
    ? {
        position: 'fixed', inset: 0, zIndex: 2000,
        background: 'rgba(21,19,15,0.55)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        fontFamily: A.font,
      }
    : {
        position: 'fixed', inset: 0, zIndex: 2000,
        background: 'rgba(21,19,15,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: A.font,
      };

  const cardStyle = mobile
    ? {
        background: A.bg, color: A.ink,
        borderTop: '2px solid ' + A.ink,
        width: '100%', maxHeight: '90vh', overflowY: 'auto',
        padding: '20px 18px 22px',
        boxSizing: 'border-box',
      }
    : {
        background: A.bg, color: A.ink,
        border: '2px solid ' + A.ink,
        width: 'min(760px, 92vw)',
        padding: '32px 34px 30px',
        boxSizing: 'border-box',
      };

  const currentLabel = ['WELCOME', 'ACCOUNT', 'IMPORT', 'BUDGET'][step];

  return (
    <div style={shellStyle} role="dialog" aria-modal="true" data-testid="onboarding-root">
      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
          <ALabel>[0{step + 1}] ONBOARDING</ALabel>
          <div style={{ fontSize: 10, letterSpacing: 1.2, color: A.muted }}>STEP {step + 1} · {currentLabel}</div>
        </div>
        <ARule thick />

        {step === 0 && (
          <div style={{ marginTop: 18 }}>
            <div style={{ fontSize: mobile ? 25 : 30, letterSpacing: -0.5, fontWeight: 600, lineHeight: 1.08 }}>
              A personal finance ledger that runs on your machine, owns no data.
            </div>
            <div style={{ marginTop: 14, fontSize: 12, color: A.ink2, lineHeight: 1.6, maxWidth: mobile ? 'none' : 540 }}>
              We&apos;ll walk through the essentials: add an account, optionally import a bank file, and set a starter budget if you want one.
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 22, flexWrap: 'wrap' }}>
              <button onClick={next} style={primaryButtonStyle(A, mobile)}>CONTINUE</button>
              <button onClick={skipToNext} style={secondaryButtonStyle(A, mobile)}>SKIP INTRO</button>
            </div>
          </div>
        )}

        {step === 1 && (
          <div style={{ marginTop: 18, display: 'grid', gridTemplateColumns: mobile ? '1fr' : '1.1fr 0.9fr', gap: 18 }}>
            <div>
              <div style={{ fontSize: mobile ? 22 : 26, letterSpacing: -0.4, fontWeight: 600, lineHeight: 1.1, marginBottom: 12 }}>
                Add an account
              </div>
              <div style={{ fontSize: 13, lineHeight: 1.6, color: A.ink2 }}>
                Add at least one account to start tracking balances.
              </div>
              <div style={{ marginTop: 10, fontSize: 11, color: A.muted, lineHeight: 1.5 }}>
                Name, type, currency, and opening balance are enough to get moving. You can add more later.
              </div>
              <div style={{ marginTop: 16 }}>
                <ALabel>ACCOUNTS ADDED</ALabel>
                <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {accountCount === 0 ? (
                    <div style={{ fontSize: 11, color: A.muted }}>No accounts yet.</div>
                  ) : accounts.map(acct => (
                    <div key={acct.id} style={{ fontSize: 11, color: A.ink2 }}>
                      {acct.name} · {acct.type} · {acct.ccy}
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button onClick={() => setShowAccount(true)} style={primaryButtonStyle(A, mobile)}>
                ADD ACCOUNT
              </button>
              <button onClick={next} disabled={accountCount === 0} style={accountCount > 0 ? primaryButtonStyle(A, mobile) : disabledButtonStyle(A, mobile)}>
                CONTINUE
              </button>
              <button onClick={skipToNext} style={secondaryButtonStyle(A, mobile)}>SKIP ACCOUNT</button>
              <div style={{ marginTop: 8, fontSize: 10, color: A.muted, lineHeight: 1.5 }}>
                You can add more accounts at any time.
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div style={{ marginTop: 18, display: 'grid', gridTemplateColumns: mobile ? '1fr' : '1.1fr 0.9fr', gap: 18 }}>
            <div>
              <div style={{ fontSize: mobile ? 22 : 26, letterSpacing: -0.4, fontWeight: 600, lineHeight: 1.1, marginBottom: 12 }}>
                Bring in your transactions
              </div>
              <div style={{ fontSize: 13, lineHeight: 1.6, color: A.ink2 }}>
                Pull transactions from a QIF, CSV, or MoneyMoney export — or skip for a manual start.
              </div>
              <div style={{ marginTop: 14 }}>
                <ALabel>WHAT IMPORTS</ALabel>
                <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {['QIF', 'CSV', 'MoneyMoney'].map(label => (
                    <div key={label} style={{ fontSize: 10, letterSpacing: 1, padding: '5px 8px', border: '1px solid ' + A.rule2, color: A.muted }}>
                      {label}
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button onClick={() => setShowImport(true)} style={primaryButtonStyle(A, mobile)}>
                IMPORT A BANK FILE
              </button>
              <button onClick={next} style={primaryButtonStyle(A, mobile)}>
                CONTINUE
              </button>
              <button onClick={skipToNext} style={secondaryButtonStyle(A, mobile)}>SKIP IMPORT</button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div style={{ marginTop: 18, display: 'grid', gridTemplateColumns: mobile ? '1fr' : '1.1fr 0.9fr', gap: 18 }}>
            <div>
              <div style={{ fontSize: mobile ? 22 : 26, letterSpacing: -0.4, fontWeight: 600, lineHeight: 1.1, marginBottom: 12 }}>
                Set one budget
              </div>
              <div style={{ fontSize: 13, lineHeight: 1.6, color: A.ink2 }}>
                Optional: set one starter budget with common categories pre-suggested.
              </div>
              <div style={{ marginTop: 14 }}>
                <ALabel>SUGGESTED CATEGORIES</ALabel>
                <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {BUDGET_SUGGESTIONS.map(label => (
                    <div key={label} style={{ fontSize: 10, letterSpacing: 1, padding: '5px 8px', border: '1px solid ' + A.rule2, color: A.muted }}>
                      {label}
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ marginTop: 14, fontSize: 10, color: A.muted, lineHeight: 1.5 }}>
                You can skip this step and add budgets later from Settings.
              </div>
              <div style={{ marginTop: 10, fontSize: 11, color: A.ink2 }}>
                Budgets added: {budgetCount}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button onClick={() => setShowBudget(true)} style={primaryButtonStyle(A, mobile)}>
                ADD BUDGET
              </button>
              <button onClick={finish} style={primaryButtonStyle(A, mobile)}>
                FINISH ONBOARDING
              </button>
              <button onClick={finish} style={secondaryButtonStyle(A, mobile)}>SKIP BUDGET</button>
            </div>
          </div>
        )}
      </div>

      {showAccount && (
        <AccountForm onClose={() => setShowAccount(false)} t={{ accent: A.ink }} />
      )}
      {showBudget && (
        <BudgetForm onClose={() => setShowBudget(false)} t={{ accent: A.ink }} />
      )}
      {showImport && (
        <ImportExport onClose={() => setShowImport(false)} />
      )}
    </div>
  );
}

function primaryButtonStyle(A, mobile) {
  return {
    all: 'unset', cursor: 'pointer', boxSizing: 'border-box',
    textAlign: 'center', padding: mobile ? '12px 18px' : '12px 20px',
    border: '1.5px solid ' + A.ink, background: A.ink, color: A.bg,
    fontSize: 11, letterSpacing: 1.2, fontWeight: 600,
  };
}

function secondaryButtonStyle(A, mobile) {
  return {
    all: 'unset', cursor: 'pointer', boxSizing: 'border-box',
    textAlign: 'center', padding: mobile ? '12px 18px' : '12px 20px',
    border: '1px solid ' + A.rule2, background: 'transparent', color: A.ink,
    fontSize: 11, letterSpacing: 1.2,
  };
}

function disabledButtonStyle(A, mobile) {
  return {
    all: 'unset', cursor: 'default', boxSizing: 'border-box',
    textAlign: 'center', padding: mobile ? '12px 18px' : '12px 20px',
    border: '1px solid ' + A.rule2, background: A.rule2, color: A.muted,
    fontSize: 11, letterSpacing: 1.2,
  };
}
