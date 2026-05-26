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
