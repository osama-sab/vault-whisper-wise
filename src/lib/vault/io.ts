import type { Keyring, VaultEnvelope } from "./types";

/**
 * The two dependencies the vault cannot provide for itself: the OS keystore
 * (main-process only) and the filesystem (main-process only). Both are
 * interfaces so the vault can be driven entirely in memory under test.
 */

export interface OsCrypto {
  available(): Promise<boolean>;
  /** Takes and returns base64; safeStorage deals in Buffers, main converts. */
  encrypt(b64Plain: string): Promise<string>;
  decrypt(b64Cipher: string): Promise<string>;
}

export interface VaultIO {
  readVault(): Promise<{ envelope: VaultEnvelope; fromBackup: boolean } | null>;
  writeVault(env: VaultEnvelope): Promise<void>;
  readKeyring(): Promise<Keyring | null>;
  writeKeyring(kr: Keyring): Promise<void>;
  /** Returns the path written, for showing the user. */
  writeLegacyBackup(json: string): Promise<string>;
  destroy(): Promise<void>;
  userDataPath(): Promise<string>;
}

/** The shape electron/preload.cjs exposes. */
interface Bridge {
  version: number;
  vault: {
    read(): Promise<{ envelope: VaultEnvelope; fromBackup: boolean } | null>;
    write(env: VaultEnvelope): Promise<void>;
    readKeyring(): Promise<Keyring | null>;
    writeKeyring(kr: Keyring): Promise<void>;
    writeLegacyBackup(json: string): Promise<string>;
    destroy(): Promise<void>;
    userDataPath(): Promise<string>;
    setDirty(dirty: boolean): void;
  };
  os: { available(): Promise<boolean>; encrypt(s: string): Promise<string>; decrypt(s: string): Promise<string> };
  onFlushRequest(handler: (token: string) => void): () => void;
  flushDone(token: string): void;
}

/**
 * Tell the shell whether there is unsaved work, and answer its flush request
 * before the app closes. No-ops in a browser, where there is no shell.
 */
export function registerShellHooks(hooks: { isDirty(): boolean; flush(): Promise<void> }): () => void {
  const b = bridge();
  if (!b) return () => {};
  return b.onFlushRequest(async (token) => {
    try { await hooks.flush(); } finally { b.flushDone(token); }
  });
}

export function reportDirty(dirty: boolean): void {
  bridge()?.vault.setDirty(dirty);
}

function bridge(): Bridge | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { pocketMoney?: Bridge }).pocketMoney ?? null;
}

/** True when running inside the Electron shell rather than a plain browser. */
export function hasElectronBridge(): boolean {
  return bridge() !== null;
}

// ─── IN-MEMORY / BROWSER ───────────────────────────────

const LS_VAULT = "pocket-money.vault";
const LS_KEYRING = "pocket-money.keyring";

/** Optional persistence hook, so memoryIO itself stays purely in memory. */
interface Persistence {
  load(): { vault: VaultEnvelope | null; keyring: Keyring | null };
  save(vault: VaultEnvelope | null, keyring: Keyring | null): void;
}

/**
 * Purely in-memory backing store. Nothing here touches the disk or
 * localStorage, so tests are isolated from each other by construction —
 * conflating the two is exactly how state leaks between them.
 */
export function memoryIO(
  seed?: { vault?: VaultEnvelope; keyring?: Keyring },
  persistence?: Persistence
): { io: VaultIO; os: OsCrypto } {
  const loaded = persistence?.load();
  const store: { vault: VaultEnvelope | null; backup: VaultEnvelope | null; keyring: Keyring | null } = {
    vault: seed?.vault ?? loaded?.vault ?? null,
    backup: null,
    keyring: seed?.keyring ?? loaded?.keyring ?? null,
  };

  const persist = () => persistence?.save(store.vault, store.keyring);

  const io: VaultIO = {
    async readVault() {
      if (store.vault) return { envelope: store.vault, fromBackup: false };
      if (store.backup) return { envelope: store.backup, fromBackup: true };
      return null;
    },
    async writeVault(env) {
      if (store.vault) store.backup = store.vault;
      store.vault = env;
      persist();
    },
    async readKeyring() { return store.keyring; },
    async writeKeyring(kr) { store.keyring = kr; persist(); },
    async writeLegacyBackup() { return "(in-memory)"; },
    async destroy() { store.vault = null; store.backup = null; store.keyring = null; persist(); },
    async userDataPath() { return "(browser)"; },
  };

  // No OS keystore in a browser: the vault falls back to a "plain" wrap and
  // says so, rather than pretending to be encrypted.
  const os: OsCrypto = {
    async available() { return false; },
    async encrypt(s) { return s; },
    async decrypt(s) { return s; },
  };

  return { io, os };
}

// ─── ELECTRON ──────────────────────────────────────────

function electronIO(b: Bridge): { io: VaultIO; os: OsCrypto } {
  return {
    io: {
      readVault: () => b.vault.read(),
      writeVault: (env) => b.vault.write(env),
      readKeyring: () => b.vault.readKeyring(),
      writeKeyring: (kr) => b.vault.writeKeyring(kr),
      writeLegacyBackup: (json) => b.vault.writeLegacyBackup(json),
      destroy: () => b.vault.destroy(),
      userDataPath: () => b.vault.userDataPath(),
    },
    os: {
      available: () => b.os.available(),
      encrypt: (s) => b.os.encrypt(s),
      decrypt: (s) => b.os.decrypt(s),
    },
  };
}

/** localStorage-backed store, so `npm run dev` in a plain browser still works. */
export function browserIO(): { io: VaultIO; os: OsCrypto } {
  const ls = (() => {
    try { return typeof localStorage !== "undefined" ? localStorage : null; } catch { return null; }
  })();

  return memoryIO(undefined, {
    load() {
      if (!ls) return { vault: null, keyring: null };
      try {
        const v = ls.getItem(LS_VAULT);
        const k = ls.getItem(LS_KEYRING);
        return { vault: v ? JSON.parse(v) : null, keyring: k ? JSON.parse(k) : null };
      } catch {
        return { vault: null, keyring: null }; // unreadable storage reads as empty
      }
    },
    save(vault, keyring) {
      if (!ls) return;
      try {
        if (vault) ls.setItem(LS_VAULT, JSON.stringify(vault)); else ls.removeItem(LS_VAULT);
        if (keyring) ls.setItem(LS_KEYRING, JSON.stringify(keyring)); else ls.removeItem(LS_KEYRING);
      } catch { /* quota or private mode; the in-memory copy still works */ }
    },
  });
}

/**
 * Chooses a backing store at CALL time, never at module load.
 *
 * Nothing a test imports may touch window.pocketMoney while modules are being
 * evaluated, or the vault stops being testable outside Electron.
 */
export function createIO(): { io: VaultIO; os: OsCrypto } {
  const b = bridge();
  if (b) return electronIO(b);

  // Falling back to browser storage INSIDE the desktop app would be silent
  // data loss from the user's point of view: the real vault is on disk, but
  // the app would come up empty, seed itself, and look as though everything
  // had vanished. Anything served over app:// is the desktop app, so a missing
  // bridge there is a broken install and must fail loudly instead.
  if (typeof location !== "undefined" && location.protocol === "app:") {
    throw new Error(
      "Pocket Money could not reach its secure storage (the preload script did not load). " +
      "Your data is safe on disk and has not been changed. Please reinstall the app."
    );
  }

  return browserIO();
}
