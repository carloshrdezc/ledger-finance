import React from 'react';
import { A } from '../theme';
import { ARule } from './Shared';
import { CATEGORIES } from '../data';
import { useStore } from '../store';

export default function BudgetFormSheet({ t, onClose, editBudget = null }) {
  const { addBudget, updateBudget, removeBudget, budgets } = useStore();

  const usedCats = new Set(budgets.map(b => b.cat));
  const availableCats = Object.entries(CATEGORIES).filter(([k]) => !usedCats.has(k) || (editBudget && editBudget.cat === k));

  const [cat, setCat]         = React.useState(editBudget?.cat ?? availableCats[0]?.[0] ?? '');
  const [limit, setLimit]     = React.useState(editBudget != null ? String(editBudget.limit) : '');
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
    fontFamily: A.font, fontSize: 14, padding: '8px 0', outline: 'none',
    boxSizing: 'border-box',
  };

  return (
    <div onClick={onClose} style={{
      position: 'absolute', inset: 0,
      background: 'rgba(20,18,15,0.4)', zIndex: 30,
      animation: 'fadeIn .15s ease-out',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        position: 'absolute', left: 0, right: 0, bottom: 0,
        background: A.bg, padding: 18,
        borderTop: '2px solid ' + A.ink,
        animation: 'slideUp .2s ease-out',
        maxHeight: '85vh', overflowY: 'auto',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ fontSize: 12, letterSpacing: 2, fontWeight: 700 }}>
            {isEdit ? 'EDIT · BUDGET' : 'NEW · BUDGET'}
          </div>
          <button onClick={onClose} style={{ all: 'unset', cursor: 'pointer', fontSize: 10, color: A.muted, letterSpacing: 1 }}>CANCEL</button>
        </div>
        <ARule thick />

        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <div style={{ fontSize: 9, color: A.muted, letterSpacing: 1.6, marginBottom: 4 }}>CATEGORY</div>
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
            <div style={{ fontSize: 9, color: A.muted, letterSpacing: 1.6, marginBottom: 4 }}>MONTHLY LIMIT</div>
            <input type="number" min="0" step="0.01" value={limit} onChange={e => setLimit(e.target.value)} placeholder="0.00" style={input} autoFocus />
          </div>
          <div>
            <div style={{ fontSize: 9, color: A.muted, letterSpacing: 1.6, marginBottom: 4 }}>ROLLOVER (OPTIONAL)</div>
            <input type="number" step="0.01" value={rollover} onChange={e => setRollover(e.target.value)} placeholder="0.00" style={input} />
          </div>
        </div>

        <div style={{ marginTop: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            {isEdit && (
              <button onClick={handleDelete} style={{ all: 'unset', cursor: 'pointer', fontSize: 10, color: A.neg, letterSpacing: 1 }}>
                DELETE
              </button>
            )}
          </div>
          <button onClick={handleSave} disabled={!canSave} style={{
            all: 'unset', cursor: canSave ? 'pointer' : 'default', fontSize: 11,
            letterSpacing: 1.5, padding: '10px 24px',
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
