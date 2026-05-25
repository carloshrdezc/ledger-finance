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

function broadcastLedgerChange(webContentsList) {
  for (const webContents of webContentsList) {
    if (!webContents.isDestroyed()) {
      webContents.send('ledger-db:changed');
    }
  }
}

app.commandLine.appendSwitch('no-sandbox');

app.whenReady().then(async () => {
  const { createDiskStore } = await import('./disk-store.mjs');
  const ledgerPath = path.join(app.getPath('userData'), 'ledger-state.json');
  const ledgerStore = createDiskStore(ledgerPath);

  ipcMain.handle('ledger-db:read', () => ledgerStore.read());
  ipcMain.handle('ledger-db:write', async (_event, state) => {
    await ledgerStore.write(state);
    broadcastLedgerChange(BrowserWindow.getAllWindows().map(win => win.webContents));
  });
  ipcMain.handle('ledger-db:export-backup', async () => ledgerStore.exportBackup());
  ipcMain.handle('ledger-db:import', async (_event, json) => {
    await ledgerStore.import(json);
    broadcastLedgerChange(BrowserWindow.getAllWindows().map(win => win.webContents));
  });

  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
