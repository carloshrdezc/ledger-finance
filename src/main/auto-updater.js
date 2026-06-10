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

// CAR-364: forward a compact status to the renderer so the Settings
// "Check for updates" button can show live feedback.
function broadcastStatus(status, extra) {
  broadcast('auto-update:status', { status, ...extra });
}

async function setupAutoUpdater() {
  if (configured) return;
  configured = true;

  const { shouldCheckForUpdates } = await import('./auto-updater.mjs');

  ipcMain.handle('auto-update:install-now', () => {
    autoUpdater.quitAndInstall();
  });

  // CAR-364: expose the running app version to the renderer (Settings + About).
  ipcMain.handle('app:get-version', () => app.getVersion());

  // CAR-364: manual, on-demand check from the Settings UI. Returns a result
  // the renderer can show immediately; live progress also arrives via the
  // 'auto-update:status' broadcasts below. In dev/unpackaged builds there's no
  // feed, so report a clear "unsupported" rather than throwing.
  ipcMain.handle('auto-update:check', async () => {
    if (!app.isPackaged) {
      return { status: 'unsupported', reason: 'dev-build' };
    }
    try {
      broadcastStatus('checking');
      const result = await autoUpdater.checkForUpdates();
      const version = result?.updateInfo?.version ?? null;
      return { status: 'checking', version };
    } catch (error) {
      const message = error?.message ?? String(error);
      return { status: 'error', error: message };
    }
  });

  autoUpdater.on('checking-for-update', () => {
    logUpdateEvent('checking-for-update');
    broadcastStatus('checking');
  });
  autoUpdater.on('update-available', info => {
    logUpdateEvent('update-available', info?.version);
    broadcastStatus('available', { version: info?.version ?? null });
  });
  autoUpdater.on('update-not-available', info => {
    logUpdateEvent('update-not-available', info?.version);
    broadcastStatus('up-to-date', { version: info?.version ?? null });
  });
  autoUpdater.on('download-progress', progress => {
    logUpdateEvent('download-progress', {
      percent: progress?.percent,
      transferred: progress?.transferred,
      total: progress?.total,
    });
    broadcastStatus('downloading', { percent: progress?.percent ?? 0 });
  });
  autoUpdater.on('update-downloaded', info => {
    logUpdateEvent('update-downloaded', info?.version);
    broadcast('auto-update:downloaded', { version: info?.version ?? null });
    broadcastStatus('downloaded', { version: info?.version ?? null });
  });
  autoUpdater.on('error', error => {
    logUpdateEvent('error', error?.message ?? String(error));
    broadcastStatus('error', { error: error?.message ?? String(error) });
  });

  if (!shouldCheckForUpdates({ isPackaged: app.isPackaged, isOnline: net.isOnline() })) {
    return;
  }

  setTimeout(() => {
    void autoUpdater.checkForUpdatesAndNotify();
  }, 10000);
}

module.exports = { setupAutoUpdater };
