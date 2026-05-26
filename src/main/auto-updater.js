const { app, ipcMain, net, BrowserWindow } = require('electron');
const { autoUpdater } = require('electron-updater');

let configured = false;

function logUpdateEvent(name, payload) {
  if (payload !== undefined) {
    console.log(`[auto-updater] ${name}`, payload);
    return;
  }
  console.log(`[auto-updater] ${name}`);
}

// CAR-215 review nit: send to all live windows, not a single captured ref.
// Original implementation captured `mainWindow` at first `setupAutoUpdater`
// call, which goes stale on macOS when `app.activate` recreates the window
// after all closed. Broadcasting matches the autoUpdater singleton's lifecycle.
function broadcast(channel, payload) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed() || win.webContents.isDestroyed()) continue;
    win.webContents.send(channel, payload);
  }
}

async function setupAutoUpdater() {
  if (configured) return;
  configured = true;

  const { shouldCheckForUpdates } = await import('./auto-updater.mjs');

  ipcMain.handle('auto-update:install-now', () => {
    autoUpdater.quitAndInstall();
  });

  autoUpdater.on('update-available', info => logUpdateEvent('update-available', info?.version));
  autoUpdater.on('update-not-available', info => logUpdateEvent('update-not-available', info?.version));
  autoUpdater.on('download-progress', progress => logUpdateEvent('download-progress', {
    percent: progress?.percent,
    transferred: progress?.transferred,
    total: progress?.total,
  }));
  autoUpdater.on('update-downloaded', info => {
    logUpdateEvent('update-downloaded', info?.version);
    broadcast('auto-update:downloaded', { version: info?.version ?? null });
  });
  autoUpdater.on('error', error => logUpdateEvent('error', error?.message ?? String(error)));

  if (!shouldCheckForUpdates({ isPackaged: app.isPackaged, isOnline: net.isOnline() })) {
    return;
  }

  setTimeout(() => {
    void autoUpdater.checkForUpdatesAndNotify();
  }, 10000);
}

module.exports = { setupAutoUpdater };
