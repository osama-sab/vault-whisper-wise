import {
  DEFAULT_ITERATIONS, WrongPassphraseError, fromB64, generateDataKey,
  openDocument, sealDocument, toB64, unwrapWithPassphrase, wrapWithPassphrase,
} from "./crypto";
import { createIO, type OsCrypto, type VaultIO } from "./io";
import type { Keyring, VaultDocument, VaultStatus, WrapKind, WrapRecord } from "./types";

/** A brand-new, empty document. seedIfEmpty() fills in the starter categories. */
export function emptyDocument(): VaultDocument {
  return {
    schema: 2,
    categories: [], transactions: [], subscriptions: [], billPayments: [],
    rules: [], accounts: [], statements: [],
    settings: { id: "settings", discreetMode: false, activeProfile: "combined", paydays: [1, 15], currency: "EUR" },
  };
}

function uuid(): string {
  try { return crypto.randomUUID(); } catch { return Math.random().toString(36).slice(2) + Date.now().toString(36); }
}

export interface VaultDeps {
  io: VaultIO;
  os: OsCrypto;
  debounceMs?: number;
  maxDelayMs?: number;
}

export class Vault {
  private io: VaultIO;
  private os: OsCrypto;
  private debounceMs: number;
  private maxDelayMs: number;

  private document: VaultDocument | null = null;
  private dataKey: Uint8Array | null = null;
  private keyring: Keyring | null = null;

  private osAvailable = false;
  private usedBackup = false;
  private locked = false;
  private path = "";
  private legacyFallback = false;

  private timer: ReturnType<typeof setTimeout> | null = null;
  private firstDirtyAt = 0;
  private dirty = false;
  private writing: Promise<void> = Promise.resolve();

  constructor(deps: VaultDeps) {
    this.io = deps.io;
    this.os = deps.os;
    this.debounceMs = deps.debounceMs ?? 250;
    this.maxDelayMs = deps.maxDelayMs ?? 2000;
  }

  // ─── LIFECYCLE ───────────────────────────────────────

  /**
   * Load the keyring and, if it can be unwrapped without a passphrase, the
   * document. Returns with needsPassphrase when the user must supply one.
   */
  async open(): Promise<VaultStatus> {
    this.osAvailable = await this.os.available().catch(() => false);
    this.path = await this.io.userDataPath().catch(() => "");
    this.keyring = await this.io.readKeyring();

    if (!this.keyring) {
      // First run (or post-migration caller has already written one).
      this.keyring = await this.createKeyring();
      this.dataKey = await this.unwrap(this.keyring.wrap);
      this.document = (await this.readDocument()) ?? emptyDocument();
      await this.persist();
      return this.status();
    }

    if (this.keyring.wrap.kind === "os+passphrase" || this.keyring.wrap.kind === "passphrase") {
      this.locked = true;
      return this.status();
    }

    this.dataKey = await this.unwrap(this.keyring.wrap);
    this.document = (await this.readDocument()) ?? emptyDocument();
    return this.status();
  }

  /** Supply the passphrase for a locked vault. Throws WrongPassphraseError. */
  async unlock(passphrase: string): Promise<void> {
    if (!this.keyring) throw new Error("The vault has not been opened yet.");
    this.dataKey = await this.unwrap(this.keyring.wrap, passphrase);
    this.document = (await this.readDocument()) ?? emptyDocument();
    this.locked = false;
  }

  get doc(): VaultDocument {
    if (!this.document) throw new Error("The vault is locked or has not been opened.");
    return this.document;
  }

  /** Replace the whole document — used by migration and by .pmvault restore. */
  setDocument(doc: VaultDocument): void {
    this.document = doc;
    this.markDirty();
  }

  status(): VaultStatus {
    const kind: WrapKind = this.keyring?.wrap.kind ?? "plain";
    return {
      mode: this.legacyFallback ? "legacy-fallback" : "vault",
      wrap: kind,
      encryptedAtRest: kind !== "plain",
      osEncryptionAvailable: this.osAvailable,
      needsPassphrase: this.locked,
      usedBackupFile: this.usedBackup,
      userDataPath: this.path,
    };
  }

  markLegacyFallback(): void { this.legacyFallback = true; }
  isDirty(): boolean { return this.dirty; }

  // ─── SAVING ──────────────────────────────────────────

  /**
   * Coalesce writes. Every store mutation calls this; a 900-row import would
   * otherwise mean 900 encrypt-and-write cycles. The max delay makes sure a
   * long run of changes still checkpoints instead of holding everything.
   */
  scheduleSave(): void {
    this.markDirty();
    const now = Date.now();
    if (!this.firstDirtyAt) this.firstDirtyAt = now;
    if (this.timer) clearTimeout(this.timer);

    const waited = now - this.firstDirtyAt;
    const delay = Math.max(0, Math.min(this.debounceMs, this.maxDelayMs - waited));
    this.timer = setTimeout(() => { void this.flush(); }, delay);
  }

  /** Force any pending save and resolve once it has actually been written. */
  async flush(): Promise<void> {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    if (!this.dirty) { await this.writing; return; }
    this.dirty = false;
    this.firstDirtyAt = 0;
    await this.persist();
  }

  private markDirty(): void { this.dirty = true; }

  private async persist(): Promise<void> {
    if (!this.document || !this.dataKey) return;
    const doc = this.document;
    const key = this.dataKey;
    // Serialised: two writes must never interleave and land out of order.
    this.writing = this.writing
      .catch(() => { /* a previous failure must not block later writes */ })
      .then(async () => {
        const env = await sealDocument(key, doc);
        await this.io.writeVault(env);
      });
    await this.writing;
  }

  // ─── PASSPHRASE ──────────────────────────────────────

  /**
   * Enable, change, or remove the passphrase.
   *
   * This rewrites the KEYRING only — the data key is unchanged, so the
   * megabyte of ciphertext in vault.dat is never touched and there is no
   * window where a partly re-encrypted dataset exists.
   *
   * Layering is AND, not OR: with a passphrase set, unwrapping needs the OS
   * key *and* the passphrase. Two independent wraps would let anyone with the
   * Windows account decrypt without the passphrase, which would make the
   * feature purely decorative.
   */
  async setPassphrase(next: string | null, current?: string): Promise<VaultStatus> {
    if (!this.keyring) throw new Error("The vault has not been opened yet.");
    const key = this.dataKey ?? await this.unwrap(this.keyring.wrap, current);

    let wrap: WrapRecord;
    if (next) {
      const w = await wrapWithPassphrase(key, next, DEFAULT_ITERATIONS);
      const inner = w.ct;
      wrap = this.osAvailable
        ? { kind: "os+passphrase", kdf: "PBKDF2-SHA256", iterations: w.iterations, salt: w.salt, iv: w.iv, blob: await this.os.encrypt(inner) }
        : { kind: "passphrase", kdf: "PBKDF2-SHA256", iterations: w.iterations, salt: w.salt, iv: w.iv, blob: inner };
    } else {
      wrap = await this.wrapWithoutPassphrase(key);
    }

    this.dataKey = key;
    this.keyring = { ...this.keyring, wrap, updatedAt: new Date().toISOString() };
    await this.io.writeKeyring(this.keyring);
    this.locked = false;
    return this.status();
  }

  async destroy(): Promise<void> {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    this.dirty = false;
    await this.io.destroy();
    this.document = null;
    this.dataKey = null;
    this.keyring = null;
  }

  // ─── INTERNALS ───────────────────────────────────────

  private async readDocument(): Promise<VaultDocument | null> {
    const found = await this.io.readVault();
    if (!found || !this.dataKey) return null;
    this.usedBackup = found.fromBackup;
    return (await openDocument(this.dataKey, found.envelope)) as VaultDocument;
  }

  private async createKeyring(): Promise<Keyring> {
    const key = generateDataKey();
    const wrap = await this.wrapWithoutPassphrase(key);
    const kr: Keyring = {
      magic: "PMKEYRING", format: 1, keyId: uuid(), wrap, updatedAt: new Date().toISOString(),
    };
    await this.io.writeKeyring(kr);
    return kr;
  }

  private async wrapWithoutPassphrase(key: Uint8Array): Promise<WrapRecord> {
    if (!this.osAvailable) return { kind: "plain", key: toB64(key) };
    return { kind: "os", blob: await this.os.encrypt(toB64(key)) };
  }

  private async unwrap(wrap: WrapRecord, passphrase?: string): Promise<Uint8Array> {
    switch (wrap.kind) {
      case "plain":
        return fromB64(wrap.key);
      case "os":
        return fromB64(await this.os.decrypt(wrap.blob));
      case "passphrase":
      case "os+passphrase": {
        if (!passphrase) throw new WrongPassphraseError();
        const ct = wrap.kind === "os+passphrase" ? await this.os.decrypt(wrap.blob) : wrap.blob;
        return unwrapWithPassphrase(
          { salt: wrap.salt, iv: wrap.iv, ct, iterations: wrap.iterations },
          passphrase
        );
      }
    }
  }
}

/** The app's singleton. Tests construct their own Vault with memoryIO(). */
let singleton: Vault | null = null;
export function getVault(): Vault {
  if (!singleton) {
    const { io, os } = createIO();
    singleton = new Vault({ io, os });
  }
  return singleton;
}

/** Test seam: drop the cached singleton. */
export function resetVault(): void { singleton = null; }
