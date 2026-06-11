import { describe, expect, it, vi } from 'vitest';

// menu.js does `require('electron')` at module top. Provide a minimal stub so
// the module loads; we only exercise the PURE menuTemplate() builder, which
// takes platform/appName/callbacks as args and touches no electron APIs.
vi.mock('electron', () => ({
  app: { name: 'LEDGER', getVersion: () => '9.9.9' },
  Menu: { buildFromTemplate: t => t, setApplicationMenu: () => {} },
  dialog: { showMessageBox: () => Promise.resolve({ response: 0 }) },
  shell: { openExternal: () => Promise.resolve() },
}));

const { menuTemplate, REPO_URL } = await import('./menu.js');

function aboutItemsByMenu(template) {
  const map = {};
  for (const menu of template) {
    const key = menu.label || menu.role;
    for (const item of menu.submenu || []) {
      if (item.label && /about/i.test(item.label)) (map[key] ||= []).push(item);
    }
  }
  return map;
}

describe('menuTemplate', () => {
  it('non-mac: About lives in the File menu (the user-requested location)', () => {
    let called = false;
    const tpl = menuTemplate({ platform: 'win32', appName: 'LEDGER', onAbout: () => { called = true; }, openUrl: () => {} });
    const labels = tpl.map(m => m.label || m.role);
    expect(labels).toEqual(['File', 'Edit', 'View', 'help']); // no separate mac app menu
    const about = aboutItemsByMenu(tpl);
    expect(about.File).toBeTruthy();
    // the About item's click is the injected callback
    about.File[0].click();
    expect(called).toBe(true);
  });

  it('mac: About lives in the app menu, not File', () => {
    const tpl = menuTemplate({ platform: 'darwin', appName: 'LEDGER', onAbout: () => {}, openUrl: () => {} });
    const labels = tpl.map(m => m.label || m.role);
    expect(labels[0]).toBe('LEDGER'); // mac app menu first
    const about = aboutItemsByMenu(tpl);
    expect(about.LEDGER).toBeTruthy();
    expect(about.File).toBeFalsy();
  });

  it('help menu links to releases + repository', () => {
    const opened = [];
    const tpl = menuTemplate({ platform: 'win32', appName: 'LEDGER', onAbout: () => {}, openUrl: u => opened.push(u) });
    const help = tpl.find(m => m.role === 'help');
    for (const item of help.submenu) item.click?.();
    expect(opened).toContain(`${REPO_URL}/releases`);
    expect(opened).toContain(REPO_URL);
  });
});
