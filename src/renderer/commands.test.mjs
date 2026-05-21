import { describe, it, expect, vi } from 'vitest';
import { buildCommands } from './commands.mjs';

vi.mock('./download.mjs', () => ({
  downloadFile: vi.fn(),
  todayISO: () => '2026-05-20',
}));

function makeHarness(overrides = {}) {
  const store = {
    exportBackup: vi.fn(() => '{}'),
    recordBackupTaken: vi.fn(),
    theme: 'light',
    setTheme: vi.fn(),
    ...overrides.store,
  };
  const navigate = vi.fn();
  const openAddTx = vi.fn();
  const cmds = buildCommands({ store, navigate, openAddTx });
  return { cmds, store, navigate, openAddTx };
}

describe('buildCommands', () => {
  it('returns 13 commands', () => {
    const { cmds } = makeHarness();
    expect(cmds).toHaveLength(13);
  });

  it('every command has id, label, and run', () => {
    const { cmds } = makeHarness();
    for (const c of cmds) {
      expect(typeof c.id).toBe('string');
      expect(c.id.length).toBeGreaterThan(0);
      expect(typeof c.label).toBe('string');
      expect(c.label.length).toBeGreaterThan(0);
      expect(typeof c.run).toBe('function');
    }
  });

  it('IDs are unique', () => {
    const { cmds } = makeHarness();
    const ids = cmds.map(c => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('run() invokes the correct underlying handle', () => {
    const { cmds, store, navigate, openAddTx } = makeHarness();
    const byId = Object.fromEntries(cmds.map(c => [c.id, c]));

    byId['go.dashboard'].run();
    expect(navigate).toHaveBeenLastCalledWith('dashboard');

    byId['go.transactions'].run();
    expect(navigate).toHaveBeenLastCalledWith('tx');

    byId['go.accounts'].run();
    expect(navigate).toHaveBeenLastCalledWith('accounts');

    byId['go.budgets'].run();
    expect(navigate).toHaveBeenLastCalledWith('budgets');

    byId['go.goals'].run();
    expect(navigate).toHaveBeenLastCalledWith('goals');

    byId['go.bills'].run();
    expect(navigate).toHaveBeenLastCalledWith('bills');

    byId['go.reports'].run();
    expect(navigate).toHaveBeenLastCalledWith('reports');

    byId['go.investments'].run();
    expect(navigate).toHaveBeenLastCalledWith('investments');

    byId['go.alerts'].run();
    expect(navigate).toHaveBeenLastCalledWith('alerts');

    byId['go.settings'].run();
    expect(navigate).toHaveBeenLastCalledWith('settings');

    byId['add.tx'].run();
    expect(openAddTx).toHaveBeenCalledTimes(1);

    byId['backup.now'].run();
    expect(store.exportBackup).toHaveBeenCalledTimes(1);
    expect(store.recordBackupTaken).toHaveBeenCalledTimes(1);

    byId['theme.toggle'].run();
    expect(store.setTheme).toHaveBeenLastCalledWith('dark');
  });

  it('theme.toggle cycles light -> dark -> auto -> light', () => {
    const a = makeHarness({ store: { theme: 'light' } });
    a.cmds.find(c => c.id === 'theme.toggle').run();
    expect(a.store.setTheme).toHaveBeenLastCalledWith('dark');

    const b = makeHarness({ store: { theme: 'dark' } });
    b.cmds.find(c => c.id === 'theme.toggle').run();
    expect(b.store.setTheme).toHaveBeenLastCalledWith('auto');

    const c = makeHarness({ store: { theme: 'auto' } });
    c.cmds.find(c => c.id === 'theme.toggle').run();
    expect(c.store.setTheme).toHaveBeenLastCalledWith('light');
  });
});
