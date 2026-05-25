const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

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

  // CAR-91: drain pending writes before quitting. Without this, a debounced
  // write scheduled in the renderer (≤250 ms before quit) would be torn down
  // mid-flight and the edit would be permanently lost on next launch (disk
  // is authoritative). We allow `before-quit` once, await the flush, then
  // re-quit cleanly.
  let quitting = false;
  app.on('before-quit', event => {
    if (quitting) return;
    event.preventDefault();
    quitting = true;
    ledgerStore.flush().then(() => app.quit(), () => app.quit());
  });

  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
