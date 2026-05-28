const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { setupAutoUpdater } = require('./auto-updater');

const isDev = !app.isPackaged;

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#f4f1ea',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '../preload/index.js'),
    },
  });

  if (isDev) {
    win.loadURL('http://localhost:5173');
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    win.loadFile(path.join(__dirname, '../../dist/index.html'));
  }

  return win;
}

app.commandLine.appendSwitch('no-sandbox');

app.whenReady().then(async () => {
  const { createDiskStore } = await import('./disk-store.mjs');
  const ledgerPath = path.join(app.getPath('userData'), 'ledger-state.json');
  const ledgerStore = createDiskStore(ledgerPath);

  ipcMain.handle('ledger-db:read', () => ledgerStore.read());
  ipcMain.handle('ledger-db:write', async (_event, state) => {
    await ledgerStore.write(state);
  });
  // CAR-91: invoked by the renderer on `pagehide` so any pending debounced
  // write is awaited before the page is torn down. Also called from
  // `before-quit` below to cover the cmd/ctrl-Q path where the renderer's
  // pagehide may race with process shutdown.
  ipcMain.handle('ledger-db:flush', () => ledgerStore.flush());

  // CAR-91: durability on quit. Closes the ordering race where a debounced
  // renderer edit hadn't yet reached main's queue at the moment we drained
  // it. We round-trip into each renderer first (`window.__ledgerFlush`
  // resolves only after the renderer's pending write IPC has completed),
  // then drain main's queue, then re-quit. Without the renderer round-trip,
  // an edit made <250 ms before Cmd/Ctrl-Q would race process exit.
  let quitting = false;
  app.on('before-quit', event => {
    if (quitting) return;
    event.preventDefault();
    quitting = true;
    (async () => {
      try {
        await Promise.all(
          BrowserWindow.getAllWindows().map(async win => {
            if (win.isDestroyed() || win.webContents.isDestroyed()) return;
            try {
              await win.webContents.executeJavaScript(
                '(typeof window !== "undefined" && typeof window.__ledgerFlush === "function") ? window.__ledgerFlush() : null',
                true,
              );
            } catch {
              // Renderer may already be tearing down; main's flush below
              // still drains anything already in the queue.
            }
          }),
        );
        await ledgerStore.flush();
      } finally {
        app.quit();
      }
    })();
  });

  createWindow();
  await setupAutoUpdater();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
