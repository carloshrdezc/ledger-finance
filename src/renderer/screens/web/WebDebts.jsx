import React from 'react';
import WebShell from './WebShell';
import PayoffPlanner from '../../components/PayoffPlanner';
import DebtFormModal from '../../components/DebtFormModal';

// CAR-345: web "DEBTS" view. Hosts the shared payoff planner inside the web
// shell and wires the desktop add/edit modal.
export default function WebDebts({ t, onNavigate, onAdd }) {
  const [editing, setEditing] = React.useState(null); // null | 'new' | debt object

  return (
    <WebShell active="debts" t={t} onNavigate={onNavigate} onAdd={onAdd}>
      <PayoffPlanner
        t={t}
        width={760}
        chartHeight={150}
        onAddDebt={() => setEditing('new')}
        onEditDebt={d => setEditing(d)}
      />
      {editing && (
        <DebtFormModal
          t={t}
          editDebt={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </WebShell>
  );
}
