const { app, ipcMain, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');

/**
 * Vault storage and the pre-quit flush handshake.
 *
 * Split out of main.cjs so the same code can be driven by a smoke harness:
 * the preload/IPC/safeStorage/atomic-write layer is precisely the part that
 * unit tests in jsdom cannot reach, so it needs to be loadable on its own.
 */

// ─── VAULT STORAGE ─────────────────────────────────────

const MAX_PAYLOAD = 64 * 1024 * 1024; // a budget file is ~1 MB; this is slack

function vaultPaths() {
  const dir = app.getPath('userData');
  return {
    dir,
    vault: path.join(dir, 'vault.dat'),
    backup: path.join(dir, 'vault.bak'),
    keyring: path.join(dir, 'keyring.json'),
    backups: path.join(dir, 'backups'),
  };
}

/** Serialises writes per path so two renames can never interleave. */
const writeQueues = new Map();

/**
 * Write via a temp file and a rename, so a crash mid-write cannot leave a
 * half-written vault. The previous file is kept as .bak, which readVault()
 * falls back to when the primary is missing or unparseable.
 */
function atomicWrite(target, contents, keepBackup) {
  const run = async () => {
    const tmp = `${target}.tmp`;
    const fh = await fs.promises.open(tmp, 'w');
    try {
      await fh.writeFile(contents, 'utf8');
      await fh.sync(); // durable before the rename, not after
    } finally {
      await fh.close();
    }
    if (keepBackup) {
      await fs.promises.rename(target, keepBackup).catch((e) => {
        if (e.code !== 'ENOENT') throw e;
      });
    }
    await fs.promises.rename(tmp, target);
  };

  const prev = writeQueues.get(target) ?? Promise.resolve();
  const next = prev.catch(() => {}).then(run);
  writeQueues.set(target, next);
  return next;
}

async function readJson(file) {
  try {
    return JSON.parse(await fs.promises.readFile(file, 'utf8'));
  } catch {
    return null;
  }
}

/** Only our own renderer may drive the vault. */
function fromOurRenderer(event) {
  const url = event.senderFrame?.url ?? '';
  return url.startsWith('app://');
}

function assertPayload(value, kind) {
  if (kind === 'string') {
    if (typeof value !== 'string' || value.length > MAX_PAYLOAD) throw new Error('Invalid payload');
    return value;
  }
  if (!value || typeof value !== 'object') throw new Error('Invalid payload');
  const json = JSON.stringify(value);
  if (json.length > MAX_PAYLOAD) throw new Error('Payload too large');
  return json;
}

function registerVaultIpc() {
  const handle = (channel, fn) => {
    ipcMain.handle(channel, async (event, arg) => {
      if (!fromOurRenderer(event)) throw new Error('Refused');
      return fn(arg);
    });
  };

  handle('vault:userDataPath', async () => app.getPath('userData'));

  handle('vault:read', async () => {
    const p = vaultPaths();
    const primary = await readJson(p.vault);
    if (primary) return { envelope: primary, fromBackup: false };
    const backup = await readJson(p.backup);
    if (backup) return { envelope: backup, fromBackup: true };
    return null;
  });

  handle('vault:write', async (envelope) => {
    const p = vaultPaths();
    await fs.promises.mkdir(p.dir, { recursive: true });
    await atomicWrite(p.vault, assertPayload(envelope), p.backup);
  });

  handle('vault:readKeyring', async () => readJson(vaultPaths().keyring));

  handle('vault:writeKeyring', async (keyring) => {
    const p = vaultPaths();
    await fs.promises.mkdir(p.dir, { recursive: true });
    await atomicWrite(p.keyring, assertPayload(keyring), null);
  });

  handle('vault:writeLegacyBackup', async (json) => {
    const p = vaultPaths();
    await fs.promises.mkdir(p.backups, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const file = path.join(p.backups, `pre-encryption-${stamp}.json`);
    await fs.promises.writeFile(file, assertPayload(json, 'string'), 'utf8');
    return file;
  });

  handle('vault:destroy', async () => {
    const p = vaultPaths();
    for (const f of [p.vault, p.backup, p.keyring]) {
      await fs.promises.rm(f, { force: true });
    }
  });

  handle('os:available', async () => {
    try { return safeStorage.isEncryptionAvailable(); } catch { return false; }
  });

  handle('os:encrypt', async (b64) => {
    assertPayload(b64, 'string');
    return safeStorage.encryptString(b64).toString('base64');
  });

  handle('os:decrypt', async (b64) => {
    assertPayload(b64, 'string');
    return safeStorage.decryptString(Buffer.from(b64, 'base64'));
  });

  ipcMain.on('vault:dirty', (event, dirty) => {
    if (fromOurRenderer(event)) rendererDirty = !!dirty;
  });
}

// ─── QUIT FLUSH ────────────────────────────────────────
//
// A renderer beforeunload handler cannot reliably complete an async IPC
// round-trip during teardown, so the wait lives here: hold the quit, ask the
// renderer to flush, and continue once it confirms (or after a short timeout).

let rendererDirty = false;
let quitting = false;
let getMainWindow = () => null;

function registerQuitFlush(windowGetter) {
  getMainWindow = windowGetter;
  app.on('before-quit', (event) => {
    if (quitting || !rendererDirty) return;
    const win = getMainWindow();
    if (!win || win.isDestroyed()) return;

    event.preventDefault();
    quitting = true;

    const token = String(Date.now());
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      ipcMain.removeListener('vault:flush-done', onDone);
      app.quit();
    };
    const onDone = (_e, received) => { if (received === token) finish(); };

    ipcMain.on('vault:flush-done', onDone);
    win.webContents.send('vault:flush-request', token);
    // Never hang the quit on a wedged renderer.
    setTimeout(finish, 3000);
  });
}


module.exports = { registerVaultIpc, registerQuitFlush, vaultPaths, atomicWrite };
