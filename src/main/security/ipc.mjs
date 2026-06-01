// CAR-242 + CAR-243: Security IPC handlers.
//
// Wires the runtime + a state-changed event channel into Electron's
// `ipcMain`. Slice 2 surface (get-state, unlock-pin, lock-now) is
// preserved verbatim; slice 3 adds the management ops the Settings UI
// needs.
//
// Channel naming convention: `security:<verb>-<noun>` (kebab-case). All
// handlers return `{ ok: true, ...data }` or `{ ok: false, error }`
// except slice-2 channels which kept their original shape.

import { runSetupMigration } from './storeCodec.mjs';

export function registerSecurityIpc({
  ipcMain,
  runtime,
  webContents, // function () => Electron.WebContents | null
  setupIo,     // io object for runSetupMigration (real one in slice 3)
  disableIo,   // io for disable: decryptToPlaintext + wipeSecurity
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

  // --- slice-2 surface (unchanged) ----------------------------------------
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

  // --- slice-3: extra unlock methods --------------------------------------
  ipcMain.handle('security:unlock-password', async (_event, password) => {
    const result = await runtime.unlockPassword(password);
    emitState();
    return result;
  });

  // Renderer derives the WK from the WebAuthn PRF result and ships the raw
  // 32 bytes here. Wrapper unwrap with kdf:'raw' is a straight AEAD
  // decrypt under that WK. The WK never persists and the MK never crosses
  // contextBridge.
  ipcMain.handle('security:unlock-passkey', async (_event, wk) => {
    const bytes = wk instanceof Uint8Array ? wk : new Uint8Array(wk || []);
    const result = await runtime.unlockPasskey(bytes);
    emitState();
    return result;
  });

  ipcMain.handle('security:unlock-recovery', async (_event, phrase) => {
    const result = await runtime.unlockRecovery(phrase);
    emitState();
    return result;
  });

  // --- slice-3: setup, add/remove, reveal/rotate, disable ------------------
  ipcMain.handle('security:setup', async (_event, payload) => {
    if (!setupIo) return { ok: false, error: 'NO_SETUP_IO' };
    const { methods, idleLockMs, osEscrow } = payload || {};
    if (!methods || typeof methods !== 'object') {
      return { ok: false, error: 'METHODS_REQUIRED' };
    }
    try {
      const out = await runSetupMigration({
        methods,
        io: setupIo,
        opts: { idleLockMs },
      });
      // Slice 2's runtime caches the config; pick up the new file.
      await runtime.loadConfig();
      // Honour the user's OS-escrow choice if Electron and supplied.
      if (typeof osEscrow === 'boolean') {
        await runtime.setOsEscrowEnabled(osEscrow);
      }
      // Hold MK live so the user is unlocked on the next render and can
      // copy the phrase / add methods without re-typing.
      // CAR-243: previously this called runtime.setMk(out.mk) inside a
      // bare try/catch that swallowed the "32-byte Uint8Array" guard error
      // when storeCodec used to zeroise mk before returning. Now that
      // runSetupMigration returns the live mk, validate the shape and log
      // any failure rather than silently leaving the user locked.
      if (out.mk instanceof Uint8Array && out.mk.length === 32) {
        runtime.setMk(out.mk);
      } else {
        // eslint-disable-next-line no-console
        console.warn('security:setup — runSetupMigration returned no usable MK; user will need to unlock manually');
      }
      emitState();
      return { ok: true, recoveryPhrase: out.recoveryPhrase };
    } catch (err) {
      return { ok: false, error: err && err.message || 'SETUP_FAILED' };
    }
  });

  ipcMain.handle('security:add-method', async (_event, payload) => {
    try {
      const r = await runtime.addMethod(payload || {});
      emitState();
      return r;
    } catch (err) {
      return { ok: false, error: err && err.code || err && err.message || 'ADD_FAILED' };
    }
  });

  ipcMain.handle('security:remove-method', async (_event, methodName) => {
    const r = await runtime.removeMethod(methodName);
    emitState();
    return r;
  });

  ipcMain.handle('security:reveal-recovery', async (_event, payload) => {
    const r = await runtime.revealRecoveryPhrase(payload || {});
    emitState();
    return r;
  });

  ipcMain.handle('security:rotate-recovery', async () => {
    const r = await runtime.rotateRecoveryPhrase();
    emitState();
    return r;
  });

  ipcMain.handle('security:disable', async () => {
    const r = await runtime.disableSecurity({ disableIo });
    emitState();
    return r;
  });

  ipcMain.handle('security:set-os-escrow', async (_event, enabled) => {
    const r = await runtime.setOsEscrowEnabled(!!enabled);
    emitState();
    return r;
  });

  // --- slice-2 dev scaffold (kept until slice 3 wizard fully replaces) ---
  if (isDev && setupIo) {
    ipcMain.handle('security:run-setup-dev', async (_event, pin) => {
      const out = await runSetupMigration({
        methods: { pin: { secret: String(pin) } },
        io: setupIo,
      });
      await runtime.loadConfig();
      emitState();
      return { ok: true, recoveryPhrase: out.recoveryPhrase };
    });
  }

  return { emitState };
}
