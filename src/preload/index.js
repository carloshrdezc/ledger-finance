const { contextBridge, ipcRenderer } = require('electron');

/**
 * @typedef {Object} LedgerDB
 * @property {() => Promise<Record<string, unknown>>} read
 * @property {(state: Record<string, unknown>) => Promise<void>} write
 * @property {() => Promise<void>} flush
 */

contextBridge.exposeInMainWorld('ledgerDB', /** @type {LedgerDB} */ ({
  read: () => ipcRenderer.invoke('ledger-db:read'),
  write: state => ipcRenderer.invoke('ledger-db:write', state),
  flush: () => ipcRenderer.invoke('ledger-db:flush'),
}));

contextBridge.exposeInMainWorld('electronAPI', {
  onAutoUpdateDownloaded: callback => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('auto-update:downloaded', listener);
    return () => ipcRenderer.removeListener('auto-update:downloaded', listener);
  },
  installUpdate: () => ipcRenderer.invoke('auto-update:install-now'),
});

// CAR-242 + CAR-243: security bridge. The MK NEVER crosses this boundary —
// only public state, unlock results, and (for passkey) a per-method 32-byte
// raw WK that the renderer derives from WebAuthn PRF.
contextBridge.exposeInMainWorld('ledgerSecurity', {
  // --- slice 2: read state, basic unlock, lock, subscribe ---
  getState: () => ipcRenderer.invoke('security:get-state'),
  unlockPin: pin => ipcRenderer.invoke('security:unlock-pin', pin),
  lockNow: () => ipcRenderer.invoke('security:lock-now'),
  onStateChanged: callback => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('security:state-changed', listener);
    return () => ipcRenderer.removeListener('security:state-changed', listener);
  },

  // --- slice 3: extra unlock methods ---
  unlockPassword: password => ipcRenderer.invoke('security:unlock-password', password),
  // wk: Uint8Array(32) (raw PRF output the renderer derived).
  unlockPasskey: wk => ipcRenderer.invoke('security:unlock-passkey', wk),
  unlockRecovery: phrase => ipcRenderer.invoke('security:unlock-recovery', phrase),

  // --- slice 3: setup, manage methods, recovery, disable ---
  // payload: { methods: { pin?, password?, passkey? }, idleLockMs?, osEscrow? }
  setup: payload => ipcRenderer.invoke('security:setup', payload),
  // payload: { method, secret, kdfParams?, extra? }
  addMethod: payload => ipcRenderer.invoke('security:add-method', payload),
  removeMethod: methodName => ipcRenderer.invoke('security:remove-method', methodName),
  revealRecovery: payload => ipcRenderer.invoke('security:reveal-recovery', payload),
  rotateRecovery: () => ipcRenderer.invoke('security:rotate-recovery'),
  disable: () => ipcRenderer.invoke('security:disable'),
  setOsEscrow: enabled => ipcRenderer.invoke('security:set-os-escrow', enabled),
  // CAR-244 / I10: persist idle auto-lock timeout (0 = never).
  setIdleLockMs: ms => ipcRenderer.invoke('security:set-idle-lock-ms', ms),

  // Dev-only — main only registers this handler when !app.isPackaged.
  // Kept around through slice 3 so existing automation keeps working;
  // slice 4 (CAR-244) removes once the wizard is the only path.
  runSetupDev: pin => ipcRenderer.invoke('security:run-setup-dev', pin),
});
