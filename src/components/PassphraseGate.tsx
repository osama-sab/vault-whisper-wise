import { useState } from "react";
import { Lock, ShieldCheck } from "lucide-react";
import { useApp } from "@/lib/store";
import { BrandMark } from "@/components/BrandMark";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

/**
 * Shown when the vault is protected by a passphrase and needs unlocking.
 *
 * This is the first thing the app shows on a protected install, so it carries
 * the mark and the panel treatment rather than being a bare form on a flat
 * background.
 */
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
    <div className="min-h-screen flex items-center justify-center p-6 bg-ground">
      <form
        onSubmit={submit}
        className="max-w-sm w-full bg-card border border-hairline rounded-panel shadow-panel p-6 space-y-4"
      >
        <div className="flex items-center gap-3">
          <BrandMark size={40} />
          <div className="min-w-0">
            <h1 className="font-semibold text-[17px] tracking-tight leading-tight">Pocket Money</h1>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Lock size={11} /> Locked
            </p>
          </div>
        </div>

        <p className="text-sm text-muted-foreground">
          Enter your passphrase to unlock your data on this computer.
        </p>

        <div>
          <Input
            type="password"
            autoFocus
            autoComplete="current-password"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            placeholder="Passphrase"
            aria-label="Passphrase"
            aria-invalid={!!error}
          />
          {error && <p className="text-xs text-destructive mt-1.5">{error}</p>}
        </div>

        <Button type="submit" disabled={!passphrase || busy} className="w-full rounded-full">
          {busy ? "Unlocking…" : "Unlock"}
        </Button>

        <p className="text-[11px] text-muted-foreground flex items-start gap-1.5 leading-relaxed">
          <ShieldCheck size={13} className="flex-shrink-0 mt-0.5 text-primary" />
          <span>
            There is no way to recover a forgotten passphrase — your data cannot be decrypted without
            it. If you have an encrypted backup, you can restore it after erasing this copy.
          </span>
        </p>
      </form>
    </div>
  );
}
