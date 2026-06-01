const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
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

// CAR-242: file IO helpers for the security config (`ledger-security.json`).
// Uses synchronous + atomic-ish writes via a tmp + rename. Lives at
// `<userData>/ledger-security.json` per spec §"Browser-fallback differences".
function makeSecurityIo(securityPath) {
  return {
    async readSecurity() {
      try {
        const raw = await fs.promises.readFile(securityPath, 'utf8');
        return JSON.parse(raw);
      } catch (err) {
        if (err && err.code === 'ENOENT') return null;
        throw err;
      }
    },
    async writeSecurity(cfg) {
      const dir = path.dirname(securityPath);
      await fs.promises.mkdir(dir, { recursive: true });
      const tmp = `${securityPath}.tmp`;
      await fs.promises.writeFile(tmp, JSON.stringify(cfg, null, 2));
      await fs.promises.rename(tmp, securityPath);
    },
  };
}

app.whenReady().then(async () => {
  const userData = app.getPath('userData');
  const ledgerPath = path.join(userData, 'ledger-state.json');
  const encryptedPath = path.join(userData, 'ledger-encrypted.json');
  const securityPath = path.join(userData, 'ledger-security.json');

  // Load slice 1's security surface + slice 2's runtime/IPC.
  const { createDiskStore } = await import('./disk-store.mjs');
  const { createDiskStoreEncrypted } = await import('./security/diskStoreEncrypted.mjs');
  const { createRuntime } = await import('./security/runtime.mjs');
  const { registerSecurityIpc } = await import('./security/ipc.mjs');

  const securityIo = makeSecurityIo(securityPath);
  const runtime = createRuntime({ io: securityIo });
  await runtime.loadConfig();

  // Pick the disk-store implementation. When security is disabled, the
  // existing plaintext flow is preserved exactly. When enabled, the encrypted
  // wrapper takes over the same `read/write/flush` shape so the IPC handlers
  // below need no further changes.
  const ledgerStore = runtime.isEnabled()
    ? createDiskStoreEncrypted({ filePath: encryptedPath, runtime })
    : createDiskStore(ledgerPath);

  // setupIo for the dev scaffold (R8 / spec §"Worked examples → A").
  // readPlaintext returns whatever the legacy plaintext file holds today;
  // writeSecurity writes the metadata; writeEncryptedStore writes the blob;
  // wipePlaintext deletes the legacy file (best-effort per spec I6).
  const setupIo = {
    async readPlaintext() {
      try {
        const raw = await fs.promises.readFile(ledgerPath, 'utf8');
        return JSON.parse(raw);
      } catch (err) {
        if (err && err.code === 'ENOENT') return {};
        return {};
      }
    },
    writeSecurity: securityIo.writeSecurity,
    async writeEncryptedStore(blob) {
      const dir = path.dirname(encryptedPath);
      await fs.promises.mkdir(dir, { recursive: true });
      const tmp = `${encryptedPath}.tmp`;
      await fs.promises.writeFile(tmp, JSON.stringify(blob, null, 2));
      await fs.promises.rename(tmp, encryptedPath);
    },
    async wipePlaintext() {
      try {
        await fs.promises.unlink(ledgerPath);
      } catch (err) {
        if (err && err.code !== 'ENOENT') throw err;
      }
    },
  };

  ipcMain.handle('ledger-db:read', () => ledgerStore.read());
  ipcMain.handle('ledger-db:write', async (_event, state) => {
    try {
      await ledgerStore.write(state);
    } catch (err) {
      // Bubble LOCKED so the renderer can surface it; everything else throws.
      if (err && err.code === 'LOCKED') return { error: 'LOCKED' };
      throw err;
    }
    return undefined;
  });
  // CAR-91: invoked by the renderer on `pagehide` so any pending debounced
  // write is awaited before the page is torn down.
  ipcMain.handle('ledger-db:flush', () => ledgerStore.flush());

  // CAR-243: disableIo for "turn security off" (R7 final paragraph).
  // CAR-243 round-3 (C2): split into stage / wipe / commit so a wipe failure
  // can never leave plaintext on disk alongside an encrypted store. Phase 1
  // writes plaintext to a `.tmp` sibling. Phase 2 unlinks the encrypted
  // store + security config. Phase 3 renames the `.tmp` into place. Phase 3
  // only runs if Phase 2 succeeded; a Phase 2 throw aborts the disable
  // with the encrypted store intact and no plaintext on disk.
  let pendingPlaintextTmp = null;
  const disableIo = {
    async stagePlaintext(mk) {
      const { aeadDecryptString, AEAD_AAD_STORE } = await import('./security/index.mjs');
      let blob;
      try {
        const raw = await fs.promises.readFile(encryptedPath, 'utf8');
        blob = JSON.parse(raw);
      } catch (err) {
        // No encrypted store yet (setup-then-disable race). Stage an empty
        // object so commitPlaintext can write `{}` deterministically.
        if (err && err.code === 'ENOENT') {
          const dir = path.dirname(ledgerPath);
          await fs.promises.mkdir(dir, { recursive: true });
          const tmp = `${ledgerPath}.tmp`;
          await fs.promises.writeFile(tmp, '{}');
          pendingPlaintextTmp = tmp;
          return;
        }
        throw err;
      }
      const json = aeadDecryptString(blob, mk, AEAD_AAD_STORE);
      const dir = path.dirname(ledgerPath);
      await fs.promises.mkdir(dir, { recursive: true });
      const tmp = `${ledgerPath}.tmp`;
      await fs.promises.writeFile(tmp, json);
      pendingPlaintextTmp = tmp;
    },
    async commitPlaintext() {
      if (!pendingPlaintextTmp) return;
      const tmp = pendingPlaintextTmp;
      pendingPlaintextTmp = null;
      await fs.promises.rename(tmp, ledgerPath);
    },
    async wipeSecurity() {
      for (const p of [securityPath, encryptedPath]) {
        try { await fs.promises.unlink(p); }
        catch (err) { if (err && err.code !== 'ENOENT') throw err; }
      }
    },
  };

  let createdWin;
  const wcGetter = () => (createdWin && !createdWin.isDestroyed() ? createdWin.webContents : null);

  registerSecurityIpc({
    ipcMain,
    runtime,
    webContents: wcGetter,
    setupIo,
    disableIo,
    isDev,
  });

  // CAR-91: durability on quit.
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
              // Renderer may already be tearing down.
            }
          }),
        );
        await ledgerStore.flush();
      } finally {
        app.quit();
      }
    })();
  });

  createdWin = createWindow();
  await setupAutoUpdater();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
