import React from 'react';
import { A } from '../theme';
import { Checkbox, ALabel } from './Shared';
import CategoryPicker from './CategoryPicker';

const FIELD_INPUT_STYLE = {
  background: 'transparent',
  border: '1px solid ' + A.rule2,
  fontFamily: A.font,
  fontSize: 12,
  color: A.ink,
  padding: '6px 8px',
  outline: 'none',
};

const SMALL_INPUT_STYLE = {
  ...FIELD_INPUT_STYLE,
  fontSize: 11,
  padding: '5px 6px',
  width: 70,
  fontVariantNumeric: 'tabular-nums',
};

const ACTION_BUTTON_STYLE = {
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

const PRIMARY_BUTTON_STYLE = {
  ...ACTION_BUTTON_STYLE,
  background: A.ink,
  color: A.bg,
};

const DANGER_BUTTON_STYLE = {
  ...ACTION_BUTTON_STYLE,
  borderColor: A.neg,
  color: A.neg,
};

/**
 * Inline editor for a single rule. The parent (<RulesEditor>) decides when
 * to render this in place of a read-mode row.
 *
 * Props:
 *   - rule: existing rule object, or null for new-rule mode
 *   - categoryTree: store.categoryTree
 *   - accountsWithBalance: array for the account select
 *   - onSave: (ruleData) => void — receives the form's rule shape (no id)
 *   - onCancel: () => void
 *   - onDelete: () => void — only shown when editing existing
 */
export default function RuleForm({
  rule,
  categoryTree,
  accountsWithBalance,
  onSave,
  onCancel,
  onDelete,
}) {
  const [enabled, setEnabled] = React.useState(rule?.enabled ?? true);
  const [merchantPattern, setMerchantPattern] = React.useState(rule?.match?.merchantPattern ?? '');
  const [amtMin, setAmtMin] = React.useState(rule?.match?.amountRange?.min ?? '');
  const [amtMax, setAmtMax] = React.useState(rule?.match?.amountRange?.max ?? '');
  const [accountId, setAccountId] = React.useState(rule?.match?.accountId ?? '');
  const [path, setPath] = React.useState(rule?.set?.path ?? null);

  const canSave = merchantPattern.trim().length > 0 && path && path.length > 0;

  const handleSave = () => {
    if (!canSave) return;
    const minNum = amtMin === '' || amtMin == null ? null : Number(amtMin);
    const maxNum = amtMax === '' || amtMax == null ? null : Number(amtMax);
    const validMin = minNum != null && Number.isFinite(minNum);
    const validMax = maxNum != null && Number.isFinite(maxNum);
    const amountRange = (validMin || validMax)
      ? {
          ...(validMin && { min: minNum }),
          ...(validMax && { max: maxNum }),
        }
      : undefined;
    onSave({
      enabled,
      match: {
        merchantPattern: merchantPattern.trim(),
        ...(amountRange && { amountRange }),
        ...(accountId && { accountId }),
      },
      set: { path },
    });
  };

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'auto 1fr auto auto auto auto auto',
      gap: 12,
      alignItems: 'center',
      padding: '12px 8px',
      borderTop: '1px solid ' + A.ink,
      borderBottom: '1px solid ' + A.ink,
      background: A.bg2,
    }}>
      <Checkbox
        checked={enabled}
        ariaLabel="Rule enabled"
        onChange={() => setEnabled(e => !e)}
      />

      <input
        type="text"
        value={merchantPattern}
        onChange={(e) => setMerchantPattern(e.target.value)}
        placeholder="STARBUCKS or *COFFEE"
        style={{ ...FIELD_INPUT_STYLE, width: '100%' }}
      />

      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        <input
          type="number"
          value={amtMin}
          onChange={(e) => setAmtMin(e.target.value)}
          placeholder="$ min"
          style={SMALL_INPUT_STYLE}
        />
        <span style={{ color: A.muted }}>—</span>
        <input
          type="number"
          value={amtMax}
          onChange={(e) => setAmtMax(e.target.value)}
          placeholder="$ max"
          style={SMALL_INPUT_STYLE}
        />
      </span>

      <select
        value={accountId}
        onChange={(e) => setAccountId(e.target.value)}
        style={{ ...FIELD_INPUT_STYLE, padding: '5px 6px' }}
      >
        <option value="">Any account</option>
        {accountsWithBalance.map(a => (
          <option key={a.id} value={a.id}>{a.name} · {a.code}</option>
        ))}
      </select>

      <span style={{ fontSize: 18, color: A.muted }}>→</span>

      <CategoryPicker
        tree={categoryTree}
        value={path}
        onChange={setPath}
        placeholder="PICK CATEGORY"
      />

      <span style={{ display: 'inline-flex', gap: 6 }}>
        <button
          type="button"
          onClick={handleSave}
          disabled={!canSave}
          style={{
            ...PRIMARY_BUTTON_STYLE,
            opacity: canSave ? 1 : 0.4,
            cursor: canSave ? 'pointer' : 'default',
          }}
        >
          SAVE
        </button>
        <button type="button" onClick={onCancel} style={ACTION_BUTTON_STYLE}>
          CANCEL
        </button>
        {rule && onDelete && (
          <button type="button" onClick={onDelete} style={DANGER_BUTTON_STYLE}>
            DELETE
          </button>
        )}
      </span>
    </div>
  );
}
