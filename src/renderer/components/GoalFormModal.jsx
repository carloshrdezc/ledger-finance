import React from 'react';
import { A } from '../theme';
import { ALabel, ARule } from './Shared';
import { useUndoableStore } from '../useUndoableStore';

export default function GoalFormModal({ t, onClose, editGoal = null }) {
  const { addGoal, updateGoal, deleteGoal, goalContributions } = useUndoableStore();

  const [name, setName]             = React.useState(editGoal?.name ?? '');
  const [target, setTarget]         = React.useState(editGoal != null ? String(editGoal.target) : '');
  const [targetDate, setTargetDate] = React.useState(editGoal?.targetDate ?? '');

  const isEdit = !!editGoal;
  const contribCount = isEdit ? goalContributions.filter(c => c.goalId === editGoal.id).length : 0;
  const canSave = name.trim() && target !== '' && parseFloat(target) > 0;

  const handleSave = () => {
    if (!canSave) return;
    const fields = {
      name: name.trim().toUpperCase(),
      target: parseFloat(target),
      ...(targetDate ? { targetDate } : { targetDate: undefined }),
    };
    if (isEdit) {
      updateGoal(editGoal.id, fields);
    } else {
      addGoal(fields);
    }
    onClose();
  };

  const handleDelete = () => {
    deleteGoal(editGoal.id);
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
          <ALabel>{isEdit ? 'EDIT · GOAL' : 'NEW · GOAL'}</ALabel>
          <button onClick={onClose} style={{ all: 'unset', cursor: 'pointer', fontSize: 10, color: A.muted, letterSpacing: 1 }}>ESC ×</button>
        </div>
        <ARule thick />

        <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <div style={fieldLabel}>NAME</div>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="E.G. EMERGENCY FUND" style={input} autoFocus />
          </div>
          <div>
            <div style={fieldLabel}>TARGET AMOUNT</div>
            <input type="number" min="0" step="0.01" value={target} onChange={e => setTarget(e.target.value)} placeholder="0.00" style={input} />
          </div>
          <div>
            <div style={fieldLabel}>TARGET DATE (OPTIONAL)</div>
            <input type="date" value={targetDate} onChange={e => setTargetDate(e.target.value)} style={input} />
          </div>
        </div>

        {isEdit && (
          <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid ' + A.rule2, fontSize: 10, color: A.muted, letterSpacing: 0.8, lineHeight: 1.5 }}>
            CURRENT BALANCE: ${editGoal.current.toFixed(2)} · {contribCount} CONTRIBUTION{contribCount === 1 ? '' : 'S'}
            <br />Deleting this goal also removes its contribution history but does not reverse transactions.
          </div>
        )}

        <div style={{ marginTop: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            {isEdit && (
              <button onClick={handleDelete} style={{ all: 'unset', cursor: 'pointer', fontSize: 10, color: A.neg, letterSpacing: 1 }}>
                DELETE GOAL
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
