import React from 'react';
import { A } from '../theme';
import { ARule } from './Shared';
import { useUndoableStore } from '../useUndoableStore';

export default function GoalFormSheet({ t, onClose, editGoal = null, onAfterDelete }) {
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
    if (onAfterDelete) onAfterDelete();
    else onClose();
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
      background: 'rgba(20,18,15,0.4)', zIndex: 40,
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
            {isEdit ? 'EDIT · GOAL' : 'NEW · GOAL'}
          </div>
          <button onClick={onClose} style={{ all: 'unset', cursor: 'pointer', fontSize: 10, color: A.muted, letterSpacing: 1 }}>CANCEL</button>
        </div>
        <ARule thick />

        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <div style={{ fontSize: 9, color: A.muted, letterSpacing: 1.6, marginBottom: 4 }}>NAME</div>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="E.G. EMERGENCY FUND" style={input} autoFocus />
          </div>
          <div>
            <div style={{ fontSize: 9, color: A.muted, letterSpacing: 1.6, marginBottom: 4 }}>TARGET AMOUNT</div>
            <input type="number" min="0" step="0.01" value={target} onChange={e => setTarget(e.target.value)} placeholder="0.00" style={input} />
          </div>
          <div>
            <div style={{ fontSize: 9, color: A.muted, letterSpacing: 1.6, marginBottom: 4 }}>TARGET DATE (OPTIONAL)</div>
            <input type="date" value={targetDate} onChange={e => setTargetDate(e.target.value)} style={input} />
          </div>
        </div>

        {isEdit && (
          <div style={{ marginTop: 16, fontSize: 10, color: A.muted, letterSpacing: 0.8, lineHeight: 1.5 }}>
            CURRENT BALANCE: {editGoal.current.toFixed(2)} · {contribCount} CONTRIBUTION{contribCount === 1 ? '' : 'S'}
            <br />Deleting this goal also removes its contribution history but does not reverse transactions.
          </div>
        )}

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
