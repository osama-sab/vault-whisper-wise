import { useMemo, useState } from "react";
import { Plus, Trash2, Pencil, Scale, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useApp } from "@/lib/store";
import { uid } from "@/lib/db";
import { balancesByAccount, reconcileAccountMonth } from "@/lib/budget";
import { formatMoney, isoFromDate, monthKey, profileLabel, todayISO } from "@/lib/format";
import { DiscreetText } from "@/components/Discreet";
import type { Account, AccountType, ProfileId } from "@/lib/types";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const TYPE_LABELS: Record<AccountType, string> = {
  checking: "Current account",
  savings: "Savings account",
  credit: "Credit card",
  cash: "Cash",
  other: "Other",
};

export default function AccountsEditor() {
  const { accounts, transactions, categories, settings, upsertAccount, deleteAccount } = useApp();
  const [editing, setEditing] = useState<Account | null>(null);
  const [reconciling, setReconciling] = useState<Account | null>(null);

  const balances = useMemo(
    () => balancesByAccount(accounts, transactions, categories),
    [accounts, transactions, categories]
  );

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of transactions) {
      const id = t.accountId ?? "acct-main";
      m.set(id, (m.get(id) ?? 0) + 1);
    }
    return m;
  }, [transactions]);

  function blank(): Account {
    return {
      id: uid(), name: "", type: "checking", currency: settings.currency || "EUR",
      openingBalance: 0, openingDate: todayISO(), sortOrder: accounts.length,
    };
  }

  return (
    <div className="space-y-3">
      {/* Explanatory copy is prose, not a card. Boxing it gave it the same
          visual weight as the accounts themselves. */}
      <p className="text-sm text-muted-foreground max-w-[68ch] leading-relaxed">
        Your real accounts — a bank, a card, a wallet. Each one keeps its own running balance, so
        you can check the app against what the bank actually says, instead of typing an opening
        balance into the export dialog every time.
      </p>

      <div className="flex justify-between items-center">
        <p className="text-sm font-medium">{accounts.length} account{accounts.length === 1 ? "" : "s"}</p>
        <Button size="sm" onClick={() => setEditing(blank())}>
          <Plus size={14} className="mr-1" /> Add
        </Button>
      </div>

      {accounts.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">
          No accounts yet. Add one to start tracking balances.
        </p>
      ) : (
        <div className="bg-card rounded-card border border-hairline shadow-card divide-y divide-hairline">
          {[...accounts].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)).map((a) => {
            const balance = balances.get(a.id) ?? 0;
            const used = counts.get(a.id) ?? 0;
            return (
              <div key={a.id} className={cn("p-3 flex items-center gap-3", a.archived && "opacity-50")}>
                <Wallet size={18} className="text-primary flex-shrink-0" />
                <button className="flex-1 min-w-0 text-left" onClick={() => setEditing(a)}>
                  <p className="font-medium truncate">
                    {a.name}
                    {a.archived && <span className="ml-2 text-[10px] text-muted-foreground">ARCHIVED</span>}
                  </p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {TYPE_LABELS[a.type]} · {used} transaction{used === 1 ? "" : "s"}
                    {a.profileDefault ? ` · ${profileLabel(a.profileDefault)}` : ""}
                  </p>
                </button>
                <p className={cn("font-semibold tabular-nums text-sm", balance < 0 ? "text-expense" : "text-foreground")}>
                  <DiscreetText fallback="••">{formatMoney(balance, a.currency || settings.currency)}</DiscreetText>
                </p>
                <button className="text-muted-foreground p-1 hover:text-foreground" aria-label="Reconcile" title="Check against your bank"
                  onClick={() => setReconciling(a)}>
                  <Scale size={14} />
                </button>
                <button className="text-muted-foreground p-1 hover:text-foreground" aria-label="Edit" onClick={() => setEditing(a)}>
                  <Pencil size={14} />
                </button>
                <button
                  className="text-muted-foreground p-1 hover:text-destructive" aria-label="Delete"
                  onClick={async () => {
                    if (!confirm(`Delete "${a.name}"?`)) return;
                    try {
                      await deleteAccount(a.id);
                    } catch (e) {
                      // Refused rather than orphaning transactions.
                      toast.error((e as Error).message);
                    }
                  }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <AccountDialog
          account={editing}
          onClose={() => setEditing(null)}
          onSave={async (a) => { await upsertAccount(a); setEditing(null); }}
        />
      )}
      {reconciling && <ReconcileDialog account={reconciling} onClose={() => setReconciling(null)} />}
    </div>
  );
}

function AccountDialog({ account, onClose, onSave }: {
  account: Account; onClose: () => void; onSave: (a: Account) => void;
}) {
  const [a, setA] = useState(account);
  const [error, setError] = useState("");

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card border border-hairline rounded-panel shadow-panel p-4 w-full max-w-md space-y-3" onClick={(e) => e.stopPropagation()}>
        <p className="font-semibold">Account</p>

        <div>
          <Label>Name</Label>
          <Input value={a.name} onChange={(e) => setA({ ...a, name: e.target.value })} placeholder="e.g. Sparkasse" />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label>Type</Label>
            <Select value={a.type} onValueChange={(v) => setA({ ...a, type: v as AccountType })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(TYPE_LABELS) as AccountType[]).map((t) => (
                  <SelectItem key={t} value={t}>{TYPE_LABELS[t]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Mostly used for</Label>
            <Select
              value={a.profileDefault ?? "none"}
              onValueChange={(v) => setA({ ...a, profileDefault: v === "none" ? undefined : (v as ProfileId) })}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No preference</SelectItem>
                <SelectItem value="household">Household</SelectItem>
                <SelectItem value="personal">Personal</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label>Opening balance</Label>
            <Input
              type="number" step="0.01" inputMode="decimal"
              value={a.openingBalance}
              onChange={(e) => setA({ ...a, openingBalance: parseFloat(e.target.value) || 0 })}
            />
          </div>
          <div>
            <Label>As at</Label>
            <Input
              type="date"
              value={a.openingDate}
              onChange={(e) => setA({ ...a, openingDate: e.target.value || todayISO() })}
            />
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">
          What this account held on that date. Transactions before it are left out of its balance.
        </p>

        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={!!a.archived} onChange={(e) => setA({ ...a, archived: e.target.checked })} />
          Archived (kept for history, hidden from pickers)
        </label>

        {error && <p className="text-sm text-destructive font-medium">{error}</p>}

        <div className="flex gap-2 justify-end pt-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => {
            if (!a.name.trim()) { setError("Give the account a name."); return; }
            if (!/^\d{4}-\d{2}-\d{2}$/.test(a.openingDate)) { setError("Pick a valid opening date."); return; }
            onSave({ ...a, name: a.name.trim() });
          }}>Save</Button>
        </div>
      </div>
    </div>
  );
}

function ReconcileDialog({ account, onClose }: { account: Account; onClose: () => void }) {
  const { transactions, categories, statements, settings, upsertStatement } = useApp();
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth() - 1, 1); // last completed month
  });

  const existing = statements.find(
    (s) => s.accountId === account.id && s.year === month.getFullYear() && s.month === month.getMonth()
  );
  const [actual, setActual] = useState(existing ? String(existing.closingBalance) : "");

  const result = useMemo(() => reconcileAccountMonth(
    account, transactions, categories,
    actual.trim() === ""
      ? undefined
      : {
        id: `${account.id}-${month.getFullYear()}-${month.getMonth()}`,
        accountId: account.id, year: month.getFullYear(), month: month.getMonth(),
        closingBalance: parseFloat(actual) || 0, enteredAt: "",
      }
  ), [account, transactions, categories, actual, month]);

  const currency = account.currency || settings.currency;

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card border border-hairline rounded-panel shadow-panel p-4 w-full max-w-md space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          <Scale size={16} className="text-primary" />
          <p className="font-semibold">Check {account.name} against your bank</p>
        </div>

        <div>
          <Label>Month</Label>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>←</Button>
            <p className="flex-1 text-center text-sm font-medium">
              {month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
            </p>
            <Button size="sm" variant="outline" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>→</Button>
          </div>
        </div>

        <div className="rounded-lg bg-secondary p-3 space-y-1.5 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Pocket Money says</span>
            <span className="font-semibold tabular-nums">{formatMoney(result.computed, currency)}</span>
          </div>
        </div>

        <div>
          <Label>What your statement says</Label>
          <Input
            type="number" step="0.01" inputMode="decimal" autoFocus
            value={actual} onChange={(e) => setActual(e.target.value)}
            placeholder="Closing balance"
          />
        </div>

        {actual.trim() !== "" && (
          <div className={cn("rounded-lg p-3 text-sm", result.reconciled ? "bg-success/10 text-success" : "bg-warning/10 text-warning")}>
            {result.reconciled
              ? "These match. Nothing is missing for this month."
              : `Off by ${formatMoney(Math.abs(result.delta), currency)} — the app has ${result.delta > 0 ? "more" : "less"} than your statement. A transaction is probably missing or duplicated.`}
          </div>
        )}

        <div className="flex gap-2 justify-end pt-1">
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button
            disabled={actual.trim() === ""}
            onClick={async () => {
              await upsertStatement({
                id: `${account.id}-${month.getFullYear()}-${month.getMonth()}`,
                accountId: account.id,
                year: month.getFullYear(),
                month: month.getMonth(),
                closingBalance: parseFloat(actual) || 0,
                enteredAt: isoFromDate(new Date()),
              });
              toast.success(`Saved the ${monthKey(month)} statement balance`);
              onClose();
            }}
          >
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}
