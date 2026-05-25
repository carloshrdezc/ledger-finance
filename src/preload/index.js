const { contextBridge, ipcRenderer } = require('electron');

/**
 * @typedef {Object} LedgerDB
 * @property {() => Promise<Record<string, unknown>>} read
 * @property {(state: Record<string, unknown>) => Promise<void>} write
 * @property {() => Promise<string>} exportBackup
 * @property {(json: string) => Promise<void>} import
 * @property {(cb: () => void) => () => void} subscribe
 */

contextBridge.exposeInMainWorld('ledgerDB', /** @type {LedgerDB} */ ({
  read: () => ipcRenderer.invoke('ledger-db:read'),
  write: state => ipcRenderer.invoke('ledger-db:write', state),
  exportBackup: () => ipcRenderer.invoke('ledger-db:export-backup'),
  import: json => ipcRenderer.invoke('ledger-db:import', json),
  subscribe: cb => {
    if (typeof cb !== 'function') return () => {};
    const listener = () => cb();
    ipcRenderer.on('ledger-db:changed', listener);
    return () => ipcRenderer.removeListener('ledger-db:changed', listener);
  },
}));
