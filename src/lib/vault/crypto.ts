import type { VaultEnvelope } from "./types";

/**
 * The whole cryptographic surface of the vault.
 *
 * Dependency-free on purpose: no Electron, no filesystem, nothing but
 * crypto.subtle. That is what lets every branch of it be tested in jsdom.
 */

/** OWASP 2023 guidance for PBKDF2-SHA256. Stored per keyring so it can rise. */
export const DEFAULT_ITERATIONS = 600_000;

export const VAULT_AAD = "pm-vault-1";

export class WrongPassphraseError extends Error {
  constructor() {
    super("That passphrase does not unlock this vault.");
    this.name = "WrongPassphraseError";
  }
}

/**
 * The keyring is missing or unreadable, but an encrypted vault is sitting
 * right next to it.
 *
 * Treating that as a fresh install is the one mistake this code must never
 * make: it would mint a new key and write an empty document over data that
 * nothing can decrypt afterwards.
 */
export class VaultKeyMissingError extends Error {
  constructor(
    message = "Your data file is here, but the key that opens it is missing. " +
      "Nothing has been changed. Restore your keyring or a backup before continuing."
  ) {
    super(message);
    this.name = "VaultKeyMissingError";
  }
}

export class VaultCorruptError extends Error {
  constructor(message = "The vault file could not be read. It may be damaged.") {
    super(message);
    this.name = "VaultCorruptError";
  }
}

// ─── BYTES ─────────────────────────────────────────────

export function randomBytes(n: number): Uint8Array {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return b;
}

export function toB64(bytes: Uint8Array): string {
  let s = "";
  // Chunked: String.fromCharCode(...bigArray) blows the argument limit.
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(s);
}

export function fromB64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const utf8 = new TextEncoder();
const fromUtf8 = new TextDecoder();

/** WebCrypto wants a plain ArrayBuffer, not a possibly-offset view. */
function buf(b: Uint8Array): ArrayBuffer {
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
}

// ─── KEYS ──────────────────────────────────────────────

export function generateDataKey(): Uint8Array {
  return randomBytes(32); // AES-256
}

export async function importAesKey(raw: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", buf(raw), { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

/** Derive a key-encryption key from a passphrase. */
export async function deriveKEK(
  passphrase: string,
  salt: Uint8Array,
  iterations: number = DEFAULT_ITERATIONS
): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", buf(utf8.encode(passphrase)), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: buf(salt), iterations, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

// ─── AEAD ──────────────────────────────────────────────

export async function encryptBytes(
  key: CryptoKey,
  plain: Uint8Array,
  aad: string
): Promise<{ iv: Uint8Array; ct: Uint8Array }> {
  const iv = randomBytes(12);
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: buf(iv), additionalData: buf(utf8.encode(aad)) },
    key,
    buf(plain)
  );
  return { iv, ct: new Uint8Array(ct) };
}

export async function decryptBytes(
  key: CryptoKey,
  iv: Uint8Array,
  ct: Uint8Array,
  aad: string
): Promise<Uint8Array> {
  const out = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: buf(iv), additionalData: buf(utf8.encode(aad)) },
    key,
    buf(ct)
  );
  return new Uint8Array(out);
}

// ─── DOCUMENT ──────────────────────────────────────────

export async function sealDocument(dataKey: Uint8Array, doc: unknown): Promise<VaultEnvelope> {
  const key = await importAesKey(dataKey);
  const { iv, ct } = await encryptBytes(key, utf8.encode(JSON.stringify(doc)), VAULT_AAD);
  return {
    magic: "PMVAULT",
    format: 1,
    cipher: "AES-256-GCM",
    iv: toB64(iv),
    ct: toB64(ct),
    aad: VAULT_AAD,
    writtenAt: new Date().toISOString(),
  };
}

export async function openDocument(dataKey: Uint8Array, env: VaultEnvelope): Promise<unknown> {
  if (!env || env.magic !== "PMVAULT") throw new VaultCorruptError("This is not a Pocket Money vault file.");
  if (env.format !== 1) throw new VaultCorruptError(`Vault format ${env.format} is newer than this version understands.`);
  const key = await importAesKey(dataKey);
  let plain: Uint8Array;
  try {
    // Authentication failure lands here: a tampered or truncated file, or the
    // wrong key. Either way the content cannot be trusted.
    plain = await decryptBytes(key, fromB64(env.iv), fromB64(env.ct), env.aad ?? VAULT_AAD);
  } catch {
    throw new VaultCorruptError();
  }
  try {
    return JSON.parse(fromUtf8.decode(plain));
  } catch {
    throw new VaultCorruptError("The vault decrypted but its contents are not readable.");
  }
}

// ─── KEY WRAPPING ──────────────────────────────────────

export interface PassphraseWrapped {
  salt: string;
  iv: string;
  ct: string;
  iterations: number;
}

export async function wrapWithPassphrase(
  dataKey: Uint8Array,
  passphrase: string,
  iterations: number = DEFAULT_ITERATIONS
): Promise<PassphraseWrapped> {
  const salt = randomBytes(16);
  const kek = await deriveKEK(passphrase, salt, iterations);
  const { iv, ct } = await encryptBytes(kek, dataKey, "pm-keywrap-1");
  return { salt: toB64(salt), iv: toB64(iv), ct: toB64(ct), iterations };
}

export async function unwrapWithPassphrase(w: PassphraseWrapped, passphrase: string): Promise<Uint8Array> {
  const kek = await deriveKEK(passphrase, fromB64(w.salt), w.iterations);
  try {
    // The GCM tag is the passphrase check: a wrong passphrase derives a wrong
    // KEK and authentication fails. No separate verifier field is needed.
    return await decryptBytes(kek, fromB64(w.iv), fromB64(w.ct), "pm-keywrap-1");
  } catch {
    throw new WrongPassphraseError();
  }
}
