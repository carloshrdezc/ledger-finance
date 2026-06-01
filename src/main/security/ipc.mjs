// CAR-242: Security IPC handlers.
//
// Wires the runtime + a state-changed event channel into Electron's
// `ipcMain` so the renderer can:
//   - read the public state (no MK, no wrappers) on boot
//   - submit a PIN to unlock
//   - lock now (clears MK + emits state-changed)
//   - subscribe to state changes
//
// Plus dev-only `security:run-setup-dev` for the first-run scaffold so
// Carlos can manually exercise the boot flow without the (slice-3)
// Settings UI.

import { runSetupMigration } from './storeCodec.mjs';

export function registerSecurityIpc({
  ipcMain,
  runtime,
  webContents, // function () => Electron.WebContents | null
  setupIo,     // io object for runSetupMigration (dev scaffold)
  isDev = false,
}) {
  if (!ipcMain) throw new Error('ipcMain required');
  if (!runtime) throw new Error('runtime required');

  function emitState() {
    try {
      const wc = typeof webContents === 'function' ? webContents() : webContents;
      if (wc && !wc.isDestroyed()) {
        wc.send('security:state-changed', runtime.getState());
      }
    } catch {
      // Window torn down; nothing to do.
    }
  }

  ipcMain.handle('security:get-state', () => runtime.getState());

  ipcMain.handle('security:unlock-pin', async (_event, pin) => {
    const result = await runtime.unlockPin(pin);
    emitState();
    return result;
  });

  ipcMain.handle('security:lock-now', () => {
    runtime.clearMk();
    emitState();
    return { ok: true };
  });

  if (isDev && setupIo) {
    ipcMain.handle('security:run-setup-dev', async (_event, pin) => {
      const out = await runSetupMigration({
        methods: { pin: { secret: String(pin) } },
        io: setupIo,
      });
      // After migration the runtime needs a fresh config view; the next
      // app launch is the canonical re-load path, but we refresh in-memory
      // so the renderer can pick it up immediately on reload.
      await runtime.loadConfig();
      emitState();
      return { ok: true, recoveryPhrase: out.recoveryPhrase };
    });
  }

  return { emitState };
}
