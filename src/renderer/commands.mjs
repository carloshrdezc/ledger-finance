// Command Palette command list (CAR-78). Pure: no React, no DOM.
// `run` callbacks close over the handles passed in by DesktopApp.

import { downloadFile, todayISO } from './download.mjs';

export function buildCommands({ store, navigate, openAddTx }) {
  const { exportBackup, recordBackupTaken, theme, setTheme } = store;

  return [
    { id: 'go.dashboard',    label: 'Go to Dashboard',    run: () => navigate('dashboard') },
    { id: 'go.transactions', label: 'Go to Transactions', run: () => navigate('tx') },
    { id: 'go.accounts',     label: 'Go to Accounts',     run: () => navigate('accounts') },
    { id: 'go.budgets',      label: 'Go to Budgets',      run: () => navigate('budgets') },
    { id: 'go.goals',        label: 'Go to Goals',        run: () => navigate('goals') },
    { id: 'go.bills',        label: 'Go to Bills',        run: () => navigate('bills') },
    { id: 'go.reports',      label: 'Go to Reports',      run: () => navigate('reports') },
    { id: 'go.investments',  label: 'Go to Investments',  run: () => navigate('investments') },
    { id: 'go.alerts',       label: 'Go to Alerts',       run: () => navigate('alerts') },
    { id: 'go.settings',     label: 'Go to Settings',     run: () => navigate('settings') },

    { id: 'add.tx', label: 'Add transaction', run: () => openAddTx() },

    {
      id: 'backup.now',
      label: 'Backup now',
      run: () => {
        try {
          const json = exportBackup();
          downloadFile(`ledger-backup-${todayISO()}.ledger.json`, json);
          recordBackupTaken();
        } catch (err) {
          console.error('Backup-now failed:', err);
        }
      },
    },

    {
      id: 'theme.toggle',
      label: 'Toggle theme (light/dark/auto)',
      run: () => {
        const next = theme === 'light' ? 'dark' : theme === 'dark' ? 'auto' : 'light';
        setTheme(next);
      },
    },
  ];
}
