import React from 'react';
import { A } from '../theme';
import { ALabel, ARule } from './Shared';
import { CATEGORIES } from '../data';
import { useStore } from '../store';

export default function BudgetFormModal({ t, onClose, editBudget = null }) {
  const { addBudget, updateBudget, removeBudget, budgets } = useStore();

  // Categories that don't already have a budget (when creating a new one)
  const usedCats = new Set(budgets.map(b => b.cat));
  const availableCats = Object.entries(CATEGORIES).filter(([k]) => !usedCats.has(k) || (editBudget && editBudget.cat === k));

  const [cat, setCat]       = React.useState(editBudget?.cat ?? availableCats[0]?.[0] ?? '');
  const [limit, setLimit]   = React.useState(editBudget != null ? String(editBudget.limit) : '');
  const [rollover, setRollover] = React.useState(editBudget?.rollover != null ? String(editBudget.rollover) : '');

  const isEdit = !!editBudget;
  const canSave = cat && limit !== '' && parseFloat(limit) > 0;

  const handleSave = () => {
    if (!canSave) return;
    const fields = {
      limit: parseFloat(limit),
      ...(rollover !== '' && !isNaN(parseFloat(rollover)) ? { rollover: parseFloat(rollover) } : {}),
    };
    if (isEdit) {
      updateBudget(editBudget.cat, fields);
    } else {
      addBudget({ cat, ...fields });
    }
    onClose();
  };

  const handleDelete = () => {
    removeBudget(editBudget.cat);
    onClose();
  };

  React.useEffect(() => {
    const handler = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const input = {
    width: '100%', background: 'transparent', border: 'none',
    borderBottom: '1px solid ' + A.ink, color: A.ink,
    fontFamily: A.font, fontSize: 13, padding: '6px 0', outline: 'none',
    boxSizing: 'border-box',
  };
  const fieldLabel = { fontSize: 9, color: A.muted, letterSpacing: 1.6, marginBottom: 4 };

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0,
      background: 'rgba(20,18,15,0.5)', zIndex: 2000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: A.bg, border: '2px solid ' + A.ink,
        width: 420, padding: 32, fontFamily: A.font,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 20 }}>
          <ALabel>{isEdit ? 'EDIT · BUDGET' : 'NEW · BUDGET'}</ALabel>
          <button onClick={onClose} style={{ all: 'unset', cursor: 'pointer', fontSize: 10, color: A.muted, letterSpacing: 1 }}>ESC ×</button>
        </div>
        <ARule thick />

        <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <div style={fieldLabel}>CATEGORY</div>
            <select value={cat} onChange={e => setCat(e.target.value)} disabled={isEdit} style={{ ...input, cursor: isEdit ? 'default' : 'pointer' }}>
              {availableCats.length === 0 && (
                <option value="" disabled>ALL CATEGORIES BUDGETED</option>
              )}
              {availableCats.map(([k, c]) => (
                <option key={k} value={k}>{c.glyph ? c.glyph + ' ' : ''}{c.label || k}</option>
              ))}
            </select>
          </div>
          <div>
            <div style={fieldLabel}>MONTHLY LIMIT</div>
            <input type="number" min="0" step="0.01" value={limit} onChange={e => setLimit(e.target.value)} placeholder="0.00" style={input} autoFocus />
          </div>
          <div>
            <div style={fieldLabel}>ROLLOVER (OPTIONAL)</div>
            <input type="number" step="0.01" value={rollover} onChange={e => setRollover(e.target.value)} placeholder="0.00" style={input} />
            <div style={{ fontSize: 9, color: A.muted, marginTop: 4, letterSpacing: 0.6 }}>
              Carries surplus/deficit into the period.
            </div>
          </div>
        </div>

        <div style={{ marginTop: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            {isEdit && (
              <button onClick={handleDelete} style={{ all: 'unset', cursor: 'pointer', fontSize: 10, color: A.neg, letterSpacing: 1 }}>
                DELETE BUDGET
              </button>
            )}
          </div>
          <button onClick={handleSave} disabled={!canSave} style={{
            all: 'unset', cursor: canSave ? 'pointer' : 'default', fontSize: 11,
            letterSpacing: 1.5, padding: '8px 20px',
            background: canSave ? t.accent : A.rule2,
            color: canSave ? A.bg : A.muted,
          }}>
            SAVE
          </button>
        </div>
      </div>
    </div>
  );
}
