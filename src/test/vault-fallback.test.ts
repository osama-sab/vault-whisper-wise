import { describe, it, expect, afterEach, vi } from "vitest";
import { createIO, hasElectronBridge } from "@/lib/vault/io";

/**
 * Guards a real incident: a window that loaded the app over app:// WITHOUT the
 * preload silently fell back to browser storage, so the app came up empty and
 * seeded itself — which from the user's side is indistinguishable from losing
 * everything. In the desktop app a missing bridge is a broken install and has
 * to fail loudly.
 */

const setProtocol = (protocol: string) => {
  Object.defineProperty(window, "location", {
    value: { ...window.location, protocol },
    writable: true,
    configurable: true,
  });
};

afterEach(() => {
  setProtocol("http:");
  delete (window as unknown as { pocketMoney?: unknown }).pocketMoney;
  vi.restoreAllMocks();
});

describe("createIO", () => {
  it("throws rather than silently using browser storage when served over app://", () => {
    setProtocol("app:");
    expect(() => createIO()).toThrow(/could not reach its secure storage/i);
  });

  it("says the data is safe, because it is — the vault on disk is untouched", () => {
    setProtocol("app:");
    expect(() => createIO()).toThrow(/has not been changed/i);
  });

  it("still falls back to browser storage in an actual browser", () => {
    setProtocol("http:");
    const { io, os } = createIO();
    expect(io).toBeDefined();
    expect(os).toBeDefined();
  });

  it("uses the Electron bridge whenever one is present", async () => {
    setProtocol("app:");
    const readKeyring = vi.fn().mockResolvedValue(null);
    (window as unknown as { pocketMoney: unknown }).pocketMoney = {
      version: 1,
      vault: {
        read: vi.fn(), write: vi.fn(), readKeyring, writeKeyring: vi.fn(),
        writeLegacyBackup: vi.fn(), destroy: vi.fn(), userDataPath: vi.fn(), setDirty: vi.fn(),
      },
      os: { available: vi.fn(), encrypt: vi.fn(), decrypt: vi.fn() },
      onFlushRequest: vi.fn(), flushDone: vi.fn(),
    };

    expect(hasElectronBridge()).toBe(true);
    const { io } = createIO();
    await io.readKeyring();
    expect(readKeyring).toHaveBeenCalled();
  });
});
