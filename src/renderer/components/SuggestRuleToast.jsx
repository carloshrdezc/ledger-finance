import React from 'react';
import { A } from '../theme';
import { ALabel } from './Shared';
import RuleForm from './RuleForm';
import { useStore } from '../store';

const FRESH_MS = 5000;
const ENTER_MS = 180;
const EXIT_MS  = 120;

/**
 * CAR-182: Non-blocking toast that appears after the 3rd identical
 * re-categorization to the same target. Shows
 *   `<MERCHANT> → <PATH > BREADCRUMB>?  [CREATE RULE] [×]`
 * - CREATE RULE → opens an inline modal hosting <RuleForm> pre-populated
 *   with the merchant pattern + target path. On save, the rule is added
 *   (and store.addRule auto-evicts the matching stat).
 * - × (or 5s auto-dismiss) → dismissRuleSuggestion(merchantKey) which
 *   increments the dismissed counter; after DISMISS_LIMIT dismissals,
 *   that merchant is permanently silenced.
 *
 * Mirrors UndoToast aesthetics but anchored bottom-RIGHT to avoid
 * stacking with UndoToast (bottom-left).
 */
export default function SuggestRuleToast() {
  const {
    pendingRuleSuggestion,
    acceptRuleSuggestion,
    dismissRuleSuggestion,
    addRule,
    categoryTree,
    accountsWithBalance,
  } = useStore();
  const [exiting, setExiting] = React.useState(false);
  const [editing, setEditing] = React.useState(null); // { merchantKey, targetPath } | null

  // Reset exiting flag whenever a new suggestion appears.
  React.useEffect(() => {
    if (pendingRuleSuggestion) setExiting(false);
  }, [pendingRuleSuggestion?.merchantKey, pendingRuleSuggestion?.targetPath?.join('.')]);

  // Auto-dismiss after FRESH_MS. Skipped while the editing modal is open —
  // the user is actively engaged, don't yank the suggestion out from under them.
  React.useEffect(() => {
    if (!pendingRuleSuggestion || editing) return undefined;
    let unmountTimer;
    const dismissTimer = setTimeout(() => {
      setExiting(true);
      unmountTimer = setTimeout(() => {
        dismissRuleSuggestion(pendingRuleSuggestion.merchantKey);
      }, EXIT_MS);
    }, FRESH_MS);
    return () => {
      clearTimeout(dismissTimer);
      if (unmountTimer) clearTimeout(unmountTimer);
    };
  }, [
    pendingRuleSuggestion?.merchantKey,
    pendingRuleSuggestion?.targetPath?.join('.'),
    editing,
    dismissRuleSuggestion,
  ]);

  // Editing modal — the user clicked CREATE RULE.
  // Mounted independently of the toast: once the toast triggers it (via
  // acceptRuleSuggestion clearing pendingRuleSuggestion), the toast unmounts,
  // but the modal stays open until the user saves or cancels.
  if (editing) {
    return (
      <EditModal
        suggestion={editing}
        categoryTree={categoryTree}
        accountsWithBalance={accountsWithBalance}
        onSave={(ruleData) => {
          addRule(ruleData);
          setEditing(null);
        }}
        onCancel={() => setEditing(null)}
      />
    );
  }

  if (!pendingRuleSuggestion) return null;

  const { merchantKey, targetPath } = pendingRuleSuggestion;
  const breadcrumb = (targetPath || []).map(p => p.toUpperCase()).join(' › ');

  const onCreate = () => {
    setEditing({ merchantKey, targetPath });
    acceptRuleSuggestion();
  };
  const onDismiss = () => {
    setExiting(true);
    setTimeout(() => dismissRuleSuggestion(merchantKey), EXIT_MS);
  };

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        bottom: 20,
        right: 20,
        zIndex: 1500,
        minWidth: 320,
        maxWidth: 460,
        background: A.bg2,
        border: '1px solid ' + A.ink,
        fontFamily: A.font,
        color: A.ink,
        display: 'flex',
        alignItems: 'stretch',
        opacity: exiting ? 0 : 1,
        transform: exiting ? 'translateY(8px)' : 'translateY(0)',
        transition: `opacity ${exiting ? EXIT_MS : ENTER_MS}ms ease, transform ${exiting ? EXIT_MS : ENTER_MS}ms ease`,
      }}
    >
      <div style={{ width: 3, background: A.ink, flexShrink: 0 }} />
      <div style={{
        flex: 1,
        padding: '12px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
      }}>
        <ALabel style={{ color: A.ink2, letterSpacing: 1.4, flex: 1, minWidth: 0 }}>
          {merchantKey} → {breadcrumb}?
        </ALabel>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <button
            type="button"
            onClick={onCreate}
            aria-label={`Create rule for ${merchantKey} to ${breadcrumb}`}
            style={{
              background: 'transparent',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              fontFamily: A.font,
              fontSize: 10,
              letterSpacing: 1.4,
              color: A.ink,
              textTransform: 'uppercase',
              fontWeight: 600,
            }}
          >
            CREATE RULE
          </button>
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss suggestion"
            style={{
              background: 'transparent',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              fontFamily: A.font,
              fontSize: 14,
              color: A.muted,
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Inline modal hosting <RuleForm> pre-populated with the suggested rule.
 * Lives inside SuggestRuleToast's render tree so closing the toast doesn't
 * tear down the editor mid-save.
 */
function EditModal({ suggestion, categoryTree, accountsWithBalance, onSave, onCancel }) {
  // Build the pre-populated rule shape that RuleForm reads from rule?.match
  // and rule?.set. Setting `rule` to a non-null object here also flips
  // RuleForm's "edit mode" UI, which is fine — it just means the form has
  // pre-filled values when it opens.
  // The pattern is `STEM*` (trailing wildcard) so the rule actually matches
  // future variants like "STARBUCKS COFFEE #5678" — not just the exact name
  // of the one tx that tripped the threshold.
  const prefilled = React.useMemo(() => ({
    enabled: true,
    match: { merchantPattern: suggestion.merchantKey + '*' },
    set: { path: suggestion.targetPath },
  }), [suggestion.merchantKey, suggestion.targetPath?.join('.')]);

  // Close on Escape (capture phase so we don't bubble to global handlers).
  const wrapperRef = React.useRef(null);
  React.useEffect(() => {
    const node = wrapperRef.current;
    if (!node) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCancel();
      }
    };
    node.addEventListener('keydown', onKey, true);
    return () => node.removeEventListener('keydown', onKey, true);
  }, [onCancel]);

  return (
    <div
      ref={wrapperRef}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1600,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: A.font,
        padding: 16,
      }}
    >
      <div
        role="dialog"
        aria-label="Create rule from suggestion"
        style={{
          background: A.bg,
          border: '1px solid ' + A.ink,
          padding: 20,
          minWidth: 480,
          maxWidth: 720,
          width: '100%',
        }}
      >
        <div style={{ marginBottom: 12 }}>
          <ALabel style={{ color: A.ink2, letterSpacing: 1.4 }}>
            SUGGESTED RULE — REVIEW & SAVE
          </ALabel>
        </div>
        <RuleForm
          rule={prefilled}
          categoryTree={categoryTree}
          accountsWithBalance={accountsWithBalance}
          onSave={onSave}
          onCancel={onCancel}
        />
      </div>
    </div>
  );
}
