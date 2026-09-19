import { useState } from "react";
import { Lock } from "lucide-react";
import { useApp } from "@/lib/store";

/** Shown when the vault is protected by a passphrase and needs unlocking. */
export default function PassphraseGate() {
  const unlock = useApp((s) => s.unlock);
  const [passphrase, setPassphrase] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!passphrase || busy) return;
    setBusy(true);
    setError("");
    try {
      await unlock(passphrase);
    } catch {
      // Deliberately not "wrong password for this account" — there is nothing
      // else it could be, and the vault cannot tell you anything more.
      setError("That passphrase did not unlock your data. Try again.");
      setPassphrase("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <form onSubmit={submit} className="max-w-sm w-full bg-card border border-border rounded-2xl p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Lock size={18} className="text-primary" />
          <h1 className="font-semibold text-lg">Pocket Money is locked</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Enter your passphrase to unlock your data on this computer.
        </p>
        <div>
          <input
            type="password"
            autoFocus
            autoComplete="current-password"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            placeholder="Passphrase"
            aria-label="Passphrase"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary"
          />
          {error && <p className="text-xs text-destructive mt-1.5">{error}</p>}
        </div>
        <button
          type="submit"
          disabled={!passphrase || busy}
          className="w-full rounded-lg bg-primary text-primary-foreground text-sm font-medium py-2 disabled:opacity-50"
        >
          {busy ? "Unlocking…" : "Unlock"}
        </button>
        <p className="text-[11px] text-muted-foreground">
          There is no way to recover a forgotten passphrase — your data cannot be decrypted without it.
          If you have an encrypted backup, you can restore it after erasing this copy.
        </p>
      </form>
    </div>
  );
}
