const { app, ipcMain, net } = require('electron');
const { autoUpdater } = require('electron-updater');

let configured = false;

function logUpdateEvent(name, payload) {
  if (payload !== undefined) {
    console.log(`[auto-updater] ${name}`, payload);
    return;
  }
  console.log(`[auto-updater] ${name}`);
}

async function setupAutoUpdater(mainWindow) {
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
    if (!mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
      mainWindow.webContents.send('auto-update:downloaded', { version: info?.version ?? null });
    }
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
