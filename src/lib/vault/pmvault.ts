import {
  DEFAULT_ITERATIONS, VaultCorruptError, WrongPassphraseError,
  decryptBytes, deriveKEK, encryptBytes, fromB64, toB64,
} from "./crypto";
import { upgradeDocument } from "./upgrade";
import type { VaultDocument } from "./types";

/**
 * The portable encrypted backup: one .pmvault file holding everything,
 * AES-256-GCM under a password of the user's choosing.
 *
 * Independent of the on-disk vault and its keyring on purpose — this is what
 * survives a lost Windows profile, a new machine, or a forgotten passphrase,
 * none of which the DPAPI-wrapped vault can survive on its own.
 */

const MAGIC = "PMVAULT-EXPORT";
const AAD = "pm-export-1";

export interface PmVaultFile {
  magic: typeof MAGIC;
  format: 1;
  cipher: "AES-256-GCM";
  kdf: "PBKDF2-SHA256";
  iterations: number;
  salt: string;
  iv: string;
  ct: string;
  aad: string;
  exportedAt: string;
  /** Plaintext, for showing the user what a file holds before they restore it. */
  summary: { transactions: number; categories: number; accounts: number };
}

export async function exportPmVault(
  doc: VaultDocument,
  password: string,
  iterations: number = DEFAULT_ITERATIONS
): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKEK(password, salt, iterations);
  const { iv, ct } = await encryptBytes(key, new TextEncoder().encode(JSON.stringify(doc)), AAD);

  const file: PmVaultFile = {
    magic: MAGIC,
    format: 1,
    cipher: "AES-256-GCM",
    kdf: "PBKDF2-SHA256",
    iterations,
    salt: toB64(salt),
    iv: toB64(iv),
    ct: toB64(ct),
    aad: AAD,
    exportedAt: new Date().toISOString(),
    // Tolerant of a document that predates a collection, so exporting never
    // fails on shape — the payload is whatever was handed in either way.
    summary: {
      transactions: doc.transactions?.length ?? 0,
      categories: doc.categories?.length ?? 0,
      accounts: doc.accounts?.length ?? 0,
    },
  };
  return JSON.stringify(file, null, 2);
}

export async function importPmVault(text: string, password: string): Promise<VaultDocument> {
  let file: PmVaultFile;
  try {
    file = JSON.parse(text);
  } catch {
    throw new VaultCorruptError("That file is not a Pocket Money backup.");
  }
  if (!file || file.magic !== MAGIC) {
    throw new VaultCorruptError("That file is not a Pocket Money encrypted backup (.pmvault).");
  }
  if (file.format !== 1) {
    throw new VaultCorruptError(`This backup was written by a newer version (format ${file.format}).`);
  }

  const key = await deriveKEK(password, fromB64(file.salt), file.iterations ?? DEFAULT_ITERATIONS);
  let plain: Uint8Array;
  try {
    plain = await decryptBytes(key, fromB64(file.iv), fromB64(file.ct), file.aad ?? AAD);
  } catch {
    // A wrong password and a tampered file are indistinguishable here, and
    // the wrong password is overwhelmingly the likely one.
    throw new WrongPassphraseError();
  }

  try {
    // Runs through the same upgrade path as everything else, so an older
    // backup restores as a current document.
    return upgradeDocument(JSON.parse(new TextDecoder().decode(plain)));
  } catch {
    throw new VaultCorruptError("The backup decrypted but its contents could not be read.");
  }
}

/** Read the unencrypted header, to describe a file before restoring it. */
export function describePmVault(text: string): PmVaultFile["summary"] & { exportedAt: string } | null {
  try {
    const f = JSON.parse(text) as PmVaultFile;
    if (f.magic !== MAGIC) return null;
    return { ...f.summary, exportedAt: f.exportedAt };
  } catch {
    return null;
  }
}
