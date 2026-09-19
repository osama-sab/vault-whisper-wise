import { useRef, useState } from "react";
import { ShieldCheck, ShieldAlert, KeyRound, Download, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useApp } from "@/lib/store";
import { getVault } from "@/lib/vault/vault";
import { exportPmVault, importPmVault, describePmVault } from "@/lib/vault/pmvault";
import { downloadFile } from "@/lib/csv";
import { flushVault } from "@/lib/db";
import { isoFromDate } from "@/lib/format";
import { WrongPassphraseError } from "@/lib/vault/crypto";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/** What each wrap kind actually buys, in plain words. */
const WRAP_COPY: Record<string, { title: string; detail: string; good: boolean }> = {
  os: {
    title: "Encrypted with your Windows account",
    detail: "Another Windows account on this PC, a copied data folder, or a stolen drive cannot read it.",
    good: true,
  },
  "os+passphrase": {
    title: "Encrypted with your Windows account and your passphrase",
    detail: "While the app is closed, the file cannot be decrypted without both.",
    good: true,
  },
  passphrase: {
    title: "Encrypted with your passphrase",
    detail: "This system has no OS keystore, so your passphrase is what protects the file.",
    good: true,
  },
  plain: {
    title: "Not encrypted",
    detail: "This system has no OS keystore available. Set a passphrase below to encrypt your data.",
    good: false,
  },
};

export default function SecurityPanel() {
  const { vaultStatus, transactions, categories, accounts, restoreBackup, reload } = useApp();
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const wrap = vaultStatus?.wrap ?? "plain";
  const copy = WRAP_COPY[wrap] ?? WRAP_COPY.plain;
  const hasPassphrase = wrap === "os+passphrase" || wrap === "passphrase";

  return (
    <div className="space-y-3">
      {/* ── Status ─────────────────────────────────── */}
      <div className={cn("rounded-2xl border p-4 space-y-2", copy.good ? "bg-card border-border" : "bg-destructive/5 border-destructive/30")}>
        <div className="flex items-center gap-2">
          {copy.good
            ? <ShieldCheck size={18} className="text-success flex-shrink-0" />
            : <ShieldAlert size={18} className="text-destructive flex-shrink-0" />}
          <p className="font-medium">{copy.title}</p>
        </div>
        <p className="text-xs text-muted-foreground">{copy.detail}</p>

        {/*
          Stated plainly rather than sold. safeStorage on Windows uses
          user-scoped DPAPI with no app-specific entropy, so "only Pocket Money
          can read it" would simply be untrue.
        */}
        <p className="text-[11px] text-muted-foreground border-l-2 border-border pl-2.5">
          This protects your data while the app is closed. It cannot protect against software
          running as you on this computer, or against someone using your unlocked PC.
        </p>

        {vaultStatus?.userDataPath && (
          <p className="text-[11px] text-muted-foreground font-mono break-all">{vaultStatus.userDataPath}</p>
        )}
        {vaultStatus?.usedBackupFile && (
          <p className="text-[11px] text-warning">
            The main data file could not be read, so the previous copy was used. Nothing is lost,
            but the most recent change may not be.
          </p>
        )}
      </div>

      <PassphraseSection hasPassphrase={hasPassphrase} busy={busy} setBusy={setBusy} />

      {/* ── Encrypted backup ───────────────────────── */}
      <div className="bg-card rounded-2xl border border-border p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Download size={16} className="text-primary" />
          <p className="font-medium">Encrypted backup</p>
        </div>
        <p className="text-xs text-muted-foreground">
          One file holding everything, locked with a password you choose. Unlike the data on this
          computer, it does not depend on your Windows account — this is what survives a new PC,
          a rebuilt profile, or a forgotten passphrase. Keep one somewhere safe.
        </p>
        <p className="text-[11px] text-muted-foreground">
          {transactions.length} transactions · {categories.length} categories · {accounts.length} accounts
        </p>

        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            disabled={busy}
            onClick={async () => {
              const password = prompt("Choose a password for this backup.\n\nWithout it the file cannot be opened — there is no recovery.");
              if (!password) return;
              const confirmPassword = prompt("Type the same password again.");
              if (confirmPassword !== password) { toast.error("Those passwords did not match."); return; }
              setBusy(true);
              try {
                await flushVault();
                const text = await exportPmVault(getVault().doc, password);
                await downloadFile(`pocket-money-${isoFromDate(new Date())}.pmvault`, text, "application/octet-stream");
                toast.success("Encrypted backup saved");
              } catch (e) {
                toast.error("Could not create the backup: " + (e as Error).message);
              }
              setBusy(false);
            }}
          >
            Export backup
          </Button>

          <Button variant="outline" disabled={busy} onClick={() => fileRef.current?.click()}>
            <Upload size={14} className="mr-1.5" /> Restore
          </Button>
        </div>

        <input
          ref={fileRef} type="file" accept=".pmvault,application/json" className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            setBusy(true);
            try {
              const text = await f.text();
              const info = describePmVault(text);
              if (!info) { toast.error("That is not a Pocket Money encrypted backup."); return; }

              const password = prompt(
                `This backup holds ${info.transactions} transactions and ${info.categories} categories, ` +
                `saved ${new Date(info.exportedAt).toLocaleDateString()}.\n\nEnter its password.`
              );
              if (!password) return;

              const doc = await importPmVault(text, password);
              // Explicit choice: merging a full-dataset backup into populated
              // data produces a confusing hybrid, so say which is happening.
              const replace = confirm(
                "Replace everything currently in the app with this backup?\n\n" +
                "OK  — replace (current data is discarded)\n" +
                "Cancel — merge (records with the same id are overwritten)"
              );

              if (replace) {
                getVault().setDocument(doc);
                await flushVault();
                await reload();
              } else {
                await restoreBackup(doc);
              }
              toast.success(`Restored ${doc.transactions.length} transactions`);
            } catch (err) {
              toast.error(
                err instanceof WrongPassphraseError
                  ? "That password did not open the backup."
                  : "Could not restore: " + (err as Error).message
              );
            }
            setBusy(false);
          }}
        />
      </div>
    </div>
  );
}

function PassphraseSection({
  hasPassphrase, busy, setBusy,
}: { hasPassphrase: boolean; busy: boolean; setBusy: (b: boolean) => void }) {
  const reload = useApp((s) => s.reload);
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [error, setError] = useState("");

  async function apply(remove: boolean) {
    setError("");
    if (!remove) {
      if (next.length < 8) { setError("Use at least 8 characters."); return; }
      if (next !== again) { setError("The two passphrases do not match."); return; }
    }
    setBusy(true);
    try {
      await getVault().setPassphrase(remove ? null : next, hasPassphrase ? current : undefined);
      await reload();
      setOpen(false); setCurrent(""); setNext(""); setAgain("");
      toast.success(remove ? "Passphrase removed" : "Passphrase set");
    } catch (e) {
      setError(e instanceof WrongPassphraseError ? "That is not your current passphrase." : (e as Error).message);
    }
    setBusy(false);
  }

  return (
    <div className="bg-card rounded-2xl border border-border p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <KeyRound size={16} className="text-primary flex-shrink-0" />
          <p className="font-medium truncate">{hasPassphrase ? "Passphrase is on" : "Add a passphrase"}</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => setOpen((v) => !v)} disabled={busy}>
          {open ? "Cancel" : hasPassphrase ? "Change" : "Set up"}
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        {hasPassphrase
          ? "Pocket Money asks for your passphrase each time it opens."
          : "Asked for each time the app opens. It is applied on top of your Windows account, so the file needs both to be read."}
      </p>

      {!hasPassphrase && (
        <p className="text-[11px] text-destructive">
          There is no recovery for a forgotten passphrase. Export an encrypted backup first.
        </p>
      )}

      {open && (
        <div className="space-y-2 pt-1">
          {hasPassphrase && (
            <div>
              <Label className="text-xs">Current passphrase</Label>
              <Input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
            </div>
          )}
          <div>
            <Label className="text-xs">New passphrase</Label>
            <Input type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
          </div>
          <div>
            <Label className="text-xs">Repeat it</Label>
            <Input type="password" value={again} onChange={(e) => setAgain(e.target.value)} autoComplete="new-password" />
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex gap-2 pt-1">
            <Button size="sm" onClick={() => apply(false)} disabled={busy}>
              {hasPassphrase ? "Change passphrase" : "Turn on"}
            </Button>
            {hasPassphrase && (
              <Button size="sm" variant="outline" onClick={() => apply(true)} disabled={busy}>
                Remove
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
