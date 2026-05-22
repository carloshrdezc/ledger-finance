import React from 'react';
import { A } from '../theme';
import { ALabel, Checkbox } from './Shared';
import RuleForm from './RuleForm';
import { previewRulesAgainst } from '../rules.mjs';
import { formatPath } from '../categories.mjs';

const TOOLBAR_BUTTON_STYLE = {
  background: 'transparent',
  border: '1px solid ' + A.ink,
  padding: '5px 12px',
  cursor: 'pointer',
  fontFamily: A.font,
  fontSize: 10,
  letterSpacing: 1.4,
  color: A.ink,
  textTransform: 'uppercase',
};

const ROW_BUTTON_STYLE = {
  ...TOOLBAR_BUTTON_STYLE,
  border: 'none',
  padding: '4px 8px',
};

const DRAG_HANDLE_STYLE = {
  cursor: 'grab',
  color: A.muted,
  fontSize: 14,
  userSelect: 'none',
  padding: '0 4px',
};

function formatAmountRange(range) {
  if (!range) return 'any';
  const min = range.min != null ? '$' + range.min : '';
  const max = range.max != null ? '$' + range.max : '';
  if (min && max) return min + '–' + max;
  if (min) return '≥ ' + min;
  if (max) return '≤ ' + max;
  return 'any';
}

function formatAccount(accountId, accountsWithBalance) {
  if (!accountId) return 'any acct';
  const acct = accountsWithBalance.find(a => a.id === accountId);
  return acct ? acct.code : accountId;
}

/**
 * Read-mode row for a single rule.
 */
function RuleRow({
  rule, idx, isDragging, isDropTarget, categoryTree, accountsWithBalance,
  onToggleEnabled, onEdit, onDelete,
  onDragStart, onDragOver, onDrop, onDragEnd,
}) {
  return (
    <div
      draggable
      onDragStart={() => onDragStart(idx)}
      onDragOver={(e) => onDragOver(e, idx)}
      onDrop={() => onDrop()}
      onDragEnd={onDragEnd}
      style={{
        display: 'grid',
        gridTemplateColumns: 'auto auto 1fr auto auto auto auto',
        gap: 12,
        alignItems: 'center',
        padding: '10px 8px',
        borderBottom: '1px solid ' + A.rule2,
        opacity: isDragging ? 0.4 : 1,
        background: isDropTarget ? A.ink + '18' : 'transparent',
      }}
    >
      <span style={DRAG_HANDLE_STYLE}>≡</span>
      <Checkbox
        checked={rule.enabled}
        ariaLabel={(rule.enabled ? 'Disable' : 'Enable') + ' rule'}
        onChange={onToggleEnabled}
      />
      <span style={{ fontSize: 12, color: A.ink, fontFamily: A.font, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        <span style={{ color: A.ink }}>{rule.match.merchantPattern}</span>
        <span style={{ color: A.muted }}>
          {' · '}{formatAmountRange(rule.match.amountRange)}
          {' · '}{formatAccount(rule.match.accountId, accountsWithBalance)}
        </span>
      </span>
      <span style={{ fontSize: 14, color: A.muted }}>→</span>
      <span style={{ fontSize: 11, color: A.ink2, letterSpacing: 0.6 }}>
        {formatPath(rule.set.path, categoryTree)}
      </span>
      <button type="button" onClick={onEdit} style={ROW_BUTTON_STYLE}>EDIT</button>
      <button type="button" onClick={onDelete} style={{ ...ROW_BUTTON_STYLE, color: A.neg }}>DELETE</button>
    </div>
  );
}

/**
 * Re-apply preview modal. Computes the diff once on open.
 */
function ApplyRulesPreviewModal({
  transactions, rules, categoryTree, onApply, onClose,
}) {
  const changes = React.useMemo(
    () => previewRulesAgainst(transactions, rules),
    [transactions, rules]
  );

  const SAMPLE_LIMIT = 10;
  const sample = changes.slice(0, SAMPLE_LIMIT);
  const remainder = changes.length - sample.length;

  const onBackdrop = (e) => { if (e.target === e.currentTarget) onClose(); };

  React.useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleApply = () => {
    if (changes.length === 0) {
      onClose();
      return;
    }
    const perTxPatches = changes.map(c => ({
      id: c.txId,
      patch: { cat: c.after.cat, path: c.after.path },
    }));
    onApply(perTxPatches);
    onClose();
  };

  return (
    <div
      onMouseDown={onBackdrop}
      style={{
        position: 'fixed', inset: 0, zIndex: 2000,
        background: 'rgba(20,18,15,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: A.font,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          background: A.bg, color: A.ink, border: '2px solid ' + A.ink,
          width: 'min(640px, 92vw)',
          maxHeight: '80vh',
          padding: 24,
          display: 'flex', flexDirection: 'column', gap: 16,
        }}
      >
        <ALabel>APPLY RULES TO EXISTING TRANSACTIONS</ALabel>

        {changes.length === 0 ? (
          <div style={{ fontSize: 13, color: A.ink2, lineHeight: 1.5 }}>
            No transactions would change. All matching transactions are already
            categorized as the rules would set them.
          </div>
        ) : (
          <>
            <div style={{ fontSize: 13, color: A.ink, lineHeight: 1.5 }}>
              {changes.length} transaction{changes.length === 1 ? '' : 's'} will be re-categorized:
            </div>
            <div style={{
              maxHeight: '40vh', overflow: 'auto',
              border: '1px solid ' + A.rule2,
              fontFamily: A.font, fontSize: 11,
            }}>
              {sample.map(c => {
                const tx = transactions.find(t => t.id === c.txId);
                return (
                  <div key={c.txId} style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr auto auto',
                    gap: 12,
                    padding: '6px 12px',
                    borderBottom: '1px solid ' + A.rule2,
                    alignItems: 'center',
                  }}>
                    <span style={{ color: A.ink }}>
                      {tx?.name || c.txId}
                      <span style={{ color: A.muted, marginLeft: 8 }}>
                        {tx?.date} · {tx?.amt != null ? '$' + tx.amt : ''}
                      </span>
                    </span>
                    <span style={{ color: A.muted, fontSize: 10 }}>
                      {formatPath(c.before.path, categoryTree)}
                    </span>
                    <span style={{ color: A.ink, fontSize: 10 }}>
                      → {formatPath(c.after.path, categoryTree)}
                    </span>
                  </div>
                );
              })}
              {remainder > 0 && (
                <div style={{ padding: '6px 12px', color: A.muted, fontSize: 10, fontStyle: 'italic' }}>
                  … and {remainder} more
                </div>
              )}
            </div>
            <div style={{ fontSize: 10, color: A.muted, letterSpacing: 0.6 }}>
              Press Ctrl/Cmd+Z after applying to revert.
            </div>
          </>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
          <button type="button" onClick={onClose} style={TOOLBAR_BUTTON_STYLE}>
            CANCEL
          </button>
          {changes.length > 0 ? (
            <button
              type="button"
              onClick={handleApply}
              style={{ ...TOOLBAR_BUTTON_STYLE, background: A.ink, color: A.bg }}
            >
              APPLY {changes.length} CHANGE{changes.length === 1 ? '' : 'S'}
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              style={{ ...TOOLBAR_BUTTON_STYLE, background: A.ink, color: A.bg }}
            >
              CLOSE
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Rules editor: list with drag reorder, add, edit, delete, and re-apply preview.
 */
export default function RulesEditor({
  rules,
  categoryTree,
  accountsWithBalance,
  transactions,
  onAddRule,
  onUpdateRule,
  onDeleteRule,
  onReorderRules,
  onApplyToExisting,
}) {
  const [editingId, setEditingId] = React.useState(null);  // null | rule.id | 'new'
  const [dragIdx, setDragIdx] = React.useState(null);
  const [overIdx, setOverIdx] = React.useState(null);
  const [previewOpen, setPreviewOpen] = React.useState(false);

  const handleDragStart = (idx) => setDragIdx(idx);
  const handleDragOver = (e, idx) => {
    e.preventDefault();
    if (idx !== overIdx) setOverIdx(idx);
  };
  const handleDrop = () => {
    if (dragIdx == null || overIdx == null || dragIdx === overIdx) {
      setDragIdx(null);
      setOverIdx(null);
      return;
    }
    const next = [...rules];
    const [moved] = next.splice(dragIdx, 1);
    next.splice(overIdx, 0, moved);
    onReorderRules(next.map(r => r.id));
    setDragIdx(null);
    setOverIdx(null);
  };
  const handleDragEnd = () => {
    setDragIdx(null);
    setOverIdx(null);
  };

  const handleAddSave = (ruleData) => {
    onAddRule(ruleData);
    setEditingId(null);
  };

  const handleEditSave = (ruleData) => {
    if (editingId && editingId !== 'new') {
      onUpdateRule(editingId, ruleData);
    }
    setEditingId(null);
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontSize: 11, color: A.muted, letterSpacing: 1 }}>
          {rules.length === 0 ? 'No rules yet.' : rules.length + ' rule' + (rules.length === 1 ? '' : 's')}
        </span>
        <span style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            onClick={() => setEditingId(editingId === 'new' ? null : 'new')}
            style={TOOLBAR_BUTTON_STYLE}
          >
            + ADD RULE
          </button>
          <button
            type="button"
            onClick={() => setPreviewOpen(true)}
            disabled={rules.length === 0}
            style={{
              ...TOOLBAR_BUTTON_STYLE,
              opacity: rules.length === 0 ? 0.4 : 1,
              cursor: rules.length === 0 ? 'default' : 'pointer',
            }}
          >
            RE-APPLY TO EXISTING
          </button>
        </span>
      </div>

      {editingId === 'new' && (
        <RuleForm
          rule={null}
          categoryTree={categoryTree}
          accountsWithBalance={accountsWithBalance}
          onSave={handleAddSave}
          onCancel={() => setEditingId(null)}
        />
      )}

      <div style={{ borderTop: '2px solid ' + A.ink }}>
        {rules.map((rule, idx) => editingId === rule.id ? (
          <RuleForm
            key={rule.id}
            rule={rule}
            categoryTree={categoryTree}
            accountsWithBalance={accountsWithBalance}
            onSave={handleEditSave}
            onCancel={() => setEditingId(null)}
            onDelete={() => {
              onDeleteRule(rule.id);
              setEditingId(null);
            }}
          />
        ) : (
          <RuleRow
            key={rule.id}
            rule={rule}
            idx={idx}
            isDragging={dragIdx === idx}
            isDropTarget={overIdx === idx && dragIdx !== idx}
            categoryTree={categoryTree}
            accountsWithBalance={accountsWithBalance}
            onToggleEnabled={() => onUpdateRule(rule.id, { enabled: !rule.enabled })}
            onEdit={() => setEditingId(rule.id)}
            onDelete={() => onDeleteRule(rule.id)}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onDragEnd={handleDragEnd}
          />
        ))}
      </div>

      {previewOpen && (
        <ApplyRulesPreviewModal
          transactions={transactions}
          rules={rules}
          categoryTree={categoryTree}
          onApply={onApplyToExisting}
          onClose={() => setPreviewOpen(false)}
        />
      )}
    </div>
  );
}
