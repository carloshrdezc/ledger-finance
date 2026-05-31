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

// CAR-242: security bridge. The MK NEVER crosses this boundary — only public
// state and unlock results.
contextBridge.exposeInMainWorld('ledgerSecurity', {
  getState: () => ipcRenderer.invoke('security:get-state'),
  unlockPin: pin => ipcRenderer.invoke('security:unlock-pin', pin),
  lockNow: () => ipcRenderer.invoke('security:lock-now'),
  onStateChanged: callback => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('security:state-changed', listener);
    return () => ipcRenderer.removeListener('security:state-changed', listener);
  },
  // Dev-only — main only registers this handler when !app.isPackaged.
  // In production the invoke will reject; the dev scaffold UI is the only
  // caller and is itself dev-gated.
  runSetupDev: pin => ipcRenderer.invoke('security:run-setup-dev', pin),
});
