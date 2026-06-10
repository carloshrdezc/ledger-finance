const { app, Menu, shell, dialog } = require('electron');

const REPO_URL = 'https://github.com/carloshrdezc/ledger-finance';

// CAR-364: native application menu with an About item. The app previously used
// Electron's default menu, which has no app-specific About. We add an About
// entry (app menu on macOS, File/Help menu elsewhere) that shows the version
// via a simple message box — no extra window needed.
function showAbout() {
  dialog.showMessageBox({
    type: 'info',
    title: 'About LEDGER',
    message: 'LEDGER',
    detail: [
      `Version ${app.getVersion()}`,
      'Personal Finance App',
      '',
      `Electron ${process.versions.electron}`,
      REPO_URL,
    ].join('\n'),
    buttons: ['OK', 'View Releases'],
    defaultId: 0,
    cancelId: 0,
  }).then(({ response }) => {
    if (response === 1) {
      void shell.openExternal(`${REPO_URL}/releases`);
    }
  });
}

// Pure template builder — no electron access, so it's unit-testable. `onAbout`
// and `openUrl` are injected so the template carries plain functions; the live
// menu wires them to showAbout / shell.openExternal.
function menuTemplate({ platform, appName, onAbout, openUrl }) {
  const isMac = platform === 'darwin';
  const aboutItem = { label: 'About LEDGER', click: onAbout };

  return [
    ...(isMac
      ? [{
          label: appName,
          submenu: [
            aboutItem,
            { type: 'separator' },
            { role: 'services' },
            { type: 'separator' },
            { role: 'hide' },
            { role: 'hideOthers' },
            { role: 'unhide' },
            { type: 'separator' },
            { role: 'quit' },
          ],
        }]
      : []),
    {
      label: 'File',
      submenu: [
        // The user asked for About in the File menu — surface it there on
        // non-mac (macOS convention keeps About in the app menu above).
        ...(isMac ? [] : [aboutItem, { type: 'separator' }]),
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      role: 'help',
      submenu: [
        { label: 'Releases', click: () => openUrl(`${REPO_URL}/releases`) },
        { label: 'Repository', click: () => openUrl(REPO_URL) },
        ...(isMac ? [] : [{ type: 'separator' }, aboutItem]),
      ],
    },
  ];
}

function buildMenu() {
  const template = menuTemplate({
    platform: process.platform,
    appName: app.name,
    onAbout: showAbout,
    openUrl: url => shell.openExternal(url),
  });
  return Menu.buildFromTemplate(template);
}

function installApplicationMenu() {
  Menu.setApplicationMenu(buildMenu());
}

module.exports = { installApplicationMenu, buildMenu, showAbout, menuTemplate, REPO_URL };
