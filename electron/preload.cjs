const { contextBridge, ipcRenderer } = require('electron');

/**
 * The only bridge between the renderer and the main process.
 *
 * Deliberately narrow: no path ever crosses it. The renderer can say "write
 * the vault", never "write to C:\...". Main owns every filesystem location,
 * which is what keeps the app:// traversal guard meaningful.
 *
 * Runs under sandbox:true, where require() exposes only electron, events,
 * timers and url — no fs, no path. That is fine, because all of that work
 * belongs in main anyway.
 */
const invoke = (channel, arg) => ipcRenderer.invoke(channel, arg);

contextBridge.exposeInMainWorld('pocketMoney', {
  version: 1,

  vault: {
    read: () => invoke('vault:read'),
    write: (envelope) => invoke('vault:write', envelope),
    readKeyring: () => invoke('vault:readKeyring'),
    writeKeyring: (keyring) => invoke('vault:writeKeyring', keyring),
    writeLegacyBackup: (json) => invoke('vault:writeLegacyBackup', json),
    destroy: () => invoke('vault:destroy'),
    userDataPath: () => invoke('vault:userDataPath'),
    /** Lets main decide whether it must block on quit to flush. */
    setDirty: (dirty) => ipcRenderer.send('vault:dirty', !!dirty),
  },

  os: {
    available: () => invoke('os:available'),
    encrypt: (b64) => invoke('os:encrypt', b64),
    decrypt: (b64) => invoke('os:decrypt', b64),
  },

  /**
   * Main asks the renderer to flush before the app closes. A renderer
   * beforeunload handler cannot reliably finish an async IPC round-trip
   * during teardown, so the wait lives in main instead.
   */
  onFlushRequest: (handler) => {
    const listener = (_event, token) => { handler(token); };
    ipcRenderer.on('vault:flush-request', listener);
    return () => ipcRenderer.removeListener('vault:flush-request', listener);
  },
  flushDone: (token) => ipcRenderer.send('vault:flush-done', token),
});
