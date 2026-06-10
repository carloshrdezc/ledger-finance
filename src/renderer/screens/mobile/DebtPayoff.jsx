import React from 'react';
import { ARule } from '../../components/Shared';
import PayoffPlanner from '../../components/PayoffPlanner';
import DebtFormSheet from '../../components/DebtFormSheet';

// CAR-345: mobile "DEBT PAYOFF" overlay screen. Surfaced from the More tab.
export default function DebtPayoff({ t, onBack }) {
  const [editing, setEditing] = React.useState(null); // null | 'new' | debt object

  return (
    <>
      {editing && (
        <DebtFormSheet
          t={t}
          editDebt={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}

      <div style={{ padding: '0 18px 20px' }}>
        <div style={{ padding: '10px 0 6px', display: 'flex', justifyContent: 'space-between' }}>
          <button onClick={onBack} style={{ all: 'unset', cursor: 'pointer', fontSize: 10, letterSpacing: 1.2 }}>◂ BACK</button>
          <button onClick={() => setEditing('new')} style={{ all: 'unset', cursor: 'pointer', fontSize: 10, letterSpacing: 1.2, color: t.accent }}>+ ADD</button>
        </div>
        <ARule thick />

        <div style={{ marginTop: 14 }}>
          <PayoffPlanner
            t={t}
            width={320}
            chartHeight={120}
            onAddDebt={() => setEditing('new')}
            onEditDebt={d => setEditing(d)}
          />
        </div>
      </div>
    </>
  );
}
