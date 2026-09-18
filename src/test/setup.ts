import "@testing-library/jest-dom";
import { webcrypto } from "node:crypto";

// jsdom does not reliably expose crypto.subtle, which the vault is built on.
// Guarded and additive: a real implementation is left alone.
if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });
}

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});
