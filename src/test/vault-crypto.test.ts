import { describe, it, expect } from "vitest";
import {
  DEFAULT_ITERATIONS, VaultCorruptError, WrongPassphraseError,
  deriveKEK, fromB64, generateDataKey, openDocument, sealDocument, toB64,
  unwrapWithPassphrase, wrapWithPassphrase,
} from "@/lib/vault/crypto";

const doc = { schema: 2, transactions: [{ id: "t1", amount: 42.5, payee: "REWE" }] };

describe("sealDocument / openDocument", () => {
  it("round-trips a document", async () => {
    const key = generateDataKey();
    const env = await sealDocument(key, doc);
    expect(env.magic).toBe("PMVAULT");
    expect(env.cipher).toBe("AES-256-GCM");
    expect(await openDocument(key, env)).toEqual(doc);
  });

  it("does not leave the plaintext visible in the envelope", async () => {
    const env = await sealDocument(generateDataKey(), doc);
    expect(JSON.stringify(env)).not.toContain("REWE");
  });

  it("rejects the wrong key", async () => {
    const env = await sealDocument(generateDataKey(), doc);
    await expect(openDocument(generateDataKey(), env)).rejects.toThrow(VaultCorruptError);
  });

  it("rejects a single flipped ciphertext byte", async () => {
    // This is the entire point of using GCM rather than raw CBC: silent
    // corruption of a budget file must fail loudly, not decrypt to garbage.
    const key = generateDataKey();
    const env = await sealDocument(key, doc);
    const ct = fromB64(env.ct);
    ct[Math.floor(ct.length / 2)] ^= 0x01;
    await expect(openDocument(key, { ...env, ct: toB64(ct) })).rejects.toThrow(VaultCorruptError);
  });

  it("rejects a truncated ciphertext", async () => {
    const key = generateDataKey();
    const env = await sealDocument(key, doc);
    const ct = fromB64(env.ct);
    await expect(openDocument(key, { ...env, ct: toB64(ct.subarray(0, ct.length - 4)) }))
      .rejects.toThrow(VaultCorruptError);
  });

  it("rejects a tampered aad, so the envelope version cannot be downgraded", async () => {
    const key = generateDataKey();
    const env = await sealDocument(key, doc);
    await expect(openDocument(key, { ...env, aad: "pm-vault-0" })).rejects.toThrow(VaultCorruptError);
  });

  it("rejects a file that is not a vault", async () => {
    const key = generateDataKey();
    await expect(openDocument(key, { magic: "NOPE" } as never)).rejects.toThrow(VaultCorruptError);
  });

  it("rejects a format from the future rather than mis-parsing it", async () => {
    const key = generateDataKey();
    const env = await sealDocument(key, doc);
    await expect(openDocument(key, { ...env, format: 2 as never })).rejects.toThrow(/newer than this version/);
  });

  it("uses a fresh IV every time", async () => {
    const key = generateDataKey();
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) seen.add((await sealDocument(key, doc)).iv);
    expect(seen.size).toBe(200);
  });
});

describe("passphrase wrapping", () => {
  it("round-trips the data key", async () => {
    const key = generateDataKey();
    const w = await wrapWithPassphrase(key, "correct horse battery staple", 10_000);
    expect(await unwrapWithPassphrase(w, "correct horse battery staple")).toEqual(key);
  });

  it("throws WrongPassphraseError for a wrong passphrase", async () => {
    const w = await wrapWithPassphrase(generateDataKey(), "right", 10_000);
    await expect(unwrapWithPassphrase(w, "wrong")).rejects.toThrow(WrongPassphraseError);
  });

  it("uses a fresh salt per wrap, so the same passphrase gives a different blob", async () => {
    const key = generateDataKey();
    const a = await wrapWithPassphrase(key, "same", 10_000);
    const b = await wrapWithPassphrase(key, "same", 10_000);
    expect(a.salt).not.toBe(b.salt);
    expect(a.ct).not.toBe(b.ct);
  });

  it("records the iteration count so an older keyring still opens", async () => {
    // Raising the default must not strand vaults written at the old count.
    const key = generateDataKey();
    const old = await wrapWithPassphrase(key, "pw", 1_000);
    expect(old.iterations).toBe(1_000);
    expect(await unwrapWithPassphrase(old, "pw")).toEqual(key);
    expect(DEFAULT_ITERATIONS).toBeGreaterThanOrEqual(600_000);
  });

  it("derives the same key for the same salt and a different one otherwise", async () => {
    const salt = new Uint8Array(16).fill(7);
    const other = new Uint8Array(16).fill(9);
    const a = await deriveKEK("pw", salt, 1_000);
    const b = await deriveKEK("pw", salt, 1_000);
    const c = await deriveKEK("pw", other, 1_000);
    const probe = async (k: CryptoKey) =>
      toB64(new Uint8Array(await crypto.subtle.encrypt(
        { name: "AES-GCM", iv: new Uint8Array(12), additionalData: new Uint8Array() },
        k, new Uint8Array([1, 2, 3])
      )));
    expect(await probe(a)).toBe(await probe(b));
    expect(await probe(a)).not.toBe(await probe(c));
  });
});

describe("base64 helpers", () => {
  it("round-trips arbitrary bytes, including a large buffer", async () => {
    for (const n of [0, 1, 255, 100_000]) {
      const b = new Uint8Array(n);
      for (let i = 0; i < n; i++) b[i] = i % 256;
      expect(fromB64(toB64(b))).toEqual(b);
    }
  });
});
