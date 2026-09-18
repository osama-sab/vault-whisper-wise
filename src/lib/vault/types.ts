import type {
  Account, AccountStatement, AppSettings, BillPayment, Category, Rule, Subscription, Transaction,
} from "../types";

/** Everything the app stores, as one object. */
export interface VaultDocument {
  /** 1 = pre-accounts. upgradeDocument() lifts 1 -> 2. */
  schema: 2;
  categories: Category[];
  transactions: Transaction[];
  subscriptions: Subscription[];
  billPayments: BillPayment[];
  rules: Rule[];
  accounts: Account[];
  statements: AccountStatement[];
  settings: AppSettings;
}

/**
 * The on-disk shape of vault.dat.
 *
 * JSON + base64 rather than a packed binary header: the ~33% overhead is
 * irrelevant at this size, and it stays debuggable and versionable without a
 * custom parser.
 */
export interface VaultEnvelope {
  magic: "PMVAULT";
  format: 1;
  cipher: "AES-256-GCM";
  iv: string;   // base64, 12 bytes
  ct: string;   // base64, ciphertext || tag
  /** Passed as AES-GCM additionalData, so a downgrade fails authentication. */
  aad: string;
  writtenAt: string;
}

export type WrapKind = "os" | "os+passphrase" | "passphrase" | "plain";

interface WrapBase {
  kind: WrapKind;
}

/** Data key wrapped by the OS keystore only. */
export interface OsWrap extends WrapBase {
  kind: "os";
  blob: string;
}

/** Data key wrapped by a passphrase-derived key, then by the OS keystore. */
export interface OsPassphraseWrap extends WrapBase {
  kind: "os+passphrase";
  kdf: "PBKDF2-SHA256";
  iterations: number;
  salt: string;
  iv: string;
  blob: string;
}

/** Passphrase only — used when the OS keystore is unavailable. */
export interface PassphraseWrap extends WrapBase {
  kind: "passphrase";
  kdf: "PBKDF2-SHA256";
  iterations: number;
  salt: string;
  iv: string;
  blob: string;
}

/** No protection at all: no OS keystore and no passphrase set. */
export interface PlainWrap extends WrapBase {
  kind: "plain";
  key: string;
}

export type WrapRecord = OsWrap | OsPassphraseWrap | PassphraseWrap | PlainWrap;

/**
 * keyring.json — deliberately a separate file from vault.dat.
 *
 * Turning a passphrase on or off rewrites ~600 bytes here and never touches
 * the megabyte of ciphertext next to it, and a keyring write can never be
 * half-applied against a data write.
 */
export interface Keyring {
  magic: "PMKEYRING";
  format: 1;
  keyId: string;
  wrap: WrapRecord;
  migratedFrom?: string;
  migratedAt?: string;
  updatedAt: string;
}

export interface VaultStatus {
  mode: "vault" | "legacy-fallback";
  wrap: WrapKind;
  /** False only for a "plain" wrap — say so honestly in the UI. */
  encryptedAtRest: boolean;
  osEncryptionAvailable: boolean;
  /** True when the vault is locked pending a passphrase. */
  needsPassphrase: boolean;
  /** vault.dat was unreadable and vault.bak was used instead. */
  usedBackupFile: boolean;
  userDataPath: string;
}
