import { useRef, useState } from "react";
import { useApp } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Trash2, Sparkles } from "lucide-react";
import { uid, deleteDatabase } from "@/lib/db";
import { CategoryIcon } from "@/components/MerchantLogo";
import type { CategoryType, ProfileId, Rule, Category } from "@/lib/types";
import { applyRules } from "@/lib/rules";
import { formatMoney, isValidCurrency, isoFromDate, profileLabel } from "@/lib/format";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import SecurityPanel from "@/components/SecurityPanel";
import AccountsEditor from "@/components/AccountsEditor";

const TYPE_LABELS: Record<CategoryType, string> = {
  income: "Income",
  bills: "Bills",
  expenses: "Expenses",
  savings: "Savings",
  debt: "Debt",
};

export default function SettingsPage() {
  const { settings, saveSettings } = useApp();
  // Held locally while typing. Committing on every keystroke meant a
  // half-typed code like "E" reached Intl.NumberFormat, which throws
  // RangeError during render and blanked the whole window.
  const [currencyDraft, setCurrencyDraft] = useState(settings.currency);
  const currencyValid = isValidCurrency(currencyDraft);

  function commitCurrency() {
    if (currencyValid) {
      if (currencyDraft.toUpperCase() !== settings.currency) saveSettings({ currency: currencyDraft.toUpperCase() });
    } else {
      setCurrencyDraft(settings.currency); // revert an invalid entry
    }
  }

  return (
    <div className="space-y-4">
      <Tabs defaultValue="general">
        {/* Accounts lives here rather than in the bottom nav, which is already
            five tabs and crowded on a narrow window. */}
        <TabsList className="w-full grid grid-cols-5">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="accounts">Accounts</TabsTrigger>
          <TabsTrigger value="categories">Categories</TabsTrigger>
          <TabsTrigger value="rules">Auto-Tag</TabsTrigger>
          <TabsTrigger value="data">Data</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="space-y-4 pt-3">
          <div className="bg-card rounded-2xl border border-border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Discreet mode</p>
                <p className="text-xs text-muted-foreground">Blur amounts and hide payees globally.</p>
              </div>
              <Switch checked={settings.discreetMode} onCheckedChange={(v) => saveSettings({ discreetMode: v })} />
            </div>
            <div>
              <Label htmlFor="currency">Currency</Label>
              <Input
                id="currency"
                value={currencyDraft}
                maxLength={3}
                autoComplete="off"
                spellCheck={false}
                onChange={(e) => setCurrencyDraft(e.target.value.toUpperCase())}
                onBlur={commitCurrency}
                onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                placeholder="EUR"
              />
              <p className={"text-[11px] mt-1 " + (currencyDraft && !currencyValid ? "text-destructive" : "text-muted-foreground")}>
                {currencyDraft && !currencyValid
                  ? `"${currencyDraft}" is not a currency code. Use three letters, such as EUR, USD or GBP.`
                  : `3-letter ISO code. Example: ${formatMoney(1234.5, currencyValid ? currencyDraft : "EUR")}`}
              </p>
            </div>
            <div>
              <Label>Paydays</Label>
              <Input
                value={settings.paydays.join(", ")}
                onChange={(e) =>
                  saveSettings({
                    paydays: e.target.value
                      .split(",")
                      .map((s) => parseInt(s.trim()))
                      .filter((n) => !isNaN(n) && n >= 1 && n <= 31),
                  })
                }
                placeholder="e.g. 1, 15"
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Days of the month you get paid (comma-separated). Shown as dots on the Bills calendar.
              </p>
            </div>
          </div>
          <Link to="/install" className="block bg-card rounded-2xl border border-border p-4 hover:bg-accent">
            <p className="font-medium">Install on home screen</p>
            <p className="text-xs text-muted-foreground">Use this app like a native app.</p>
          </Link>
        </TabsContent>

        <TabsContent value="accounts" className="pt-3">
          <AccountsEditor />
        </TabsContent>

        <TabsContent value="categories" className="pt-3">
          <CategoriesEditor />
        </TabsContent>

        <TabsContent value="rules" className="pt-3">
          <RulesEditor />
        </TabsContent>

        <TabsContent value="data" className="space-y-3 pt-3">
          {/* Live status, rather than the old hardcoded (and now untrue)
              claim that everything lives in the browser's IndexedDB. */}
          <SecurityPanel />

          <DataBackup />

          <Button
            variant="destructive"
            className="w-full"
            onClick={async () => {
              if (!confirm("Erase every transaction, category, subscription and rule?\n\nThis cannot be undone. Export a backup first if you might want this data back.")) return;
              try {
                // Closes the open connection and waits for the delete. The old
                // version fired deleteDatabase() without closing or awaiting,
                // so the delete was blocked and usually did nothing.
                await deleteDatabase();
                location.reload();
              } catch (e) {
                toast.error("Could not erase the data: " + (e as Error).message);
              }
            }}
          >
            Erase all local data
          </Button>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function CategoriesEditor() {
  const { categories, settings, upsertCategory, deleteCategory } = useApp();
  const [editing, setEditing] = useState<Category | null>(null);

  function newCat(profile: ProfileId, type: CategoryType) {
    setEditing({ id: uid(), name: "", type, profileDefault: profile, monthlyBudget: 0, genericLabel: "" });
  }

  const profiles: { id: ProfileId; label: string }[] = [
    { id: "household", label: "Household" },
    { id: "personal", label: "Personal" },
  ];

  return (
    <div className="space-y-5">
      <p className="text-xs text-muted-foreground bg-card border border-border rounded-2xl p-3">
        Categories are how you classify each transaction. Each category belongs to either Household or Personal.
        When you add a transaction with a given Profile, only its categories show up.
      </p>

      {profiles.map((p) => (
        <div key={p.id} className="space-y-3">
          <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground px-1">{p.label}</h2>
          {(["income", "bills", "expenses", "savings", "debt"] as CategoryType[]).map((t) => {
            const items = categories.filter((c) => c.type === t && c.profileDefault === p.id);
            return (
              <div key={t} className="bg-card rounded-2xl border border-border p-3">
                <div className="flex justify-between items-center mb-1">
                  <p className="font-medium text-sm flex items-center gap-1.5">
                    <CategoryIcon type={t} size={16} />
                    {TYPE_LABELS[t]}
                  </p>
                  <Button size="sm" variant="ghost" onClick={() => newCat(p.id, t)}>
                    <Plus size={14} />
                  </Button>
                </div>
                {items.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-1">No {TYPE_LABELS[t].toLowerCase()} categories yet.</p>
                ) : (
                  <div className="divide-y divide-border">
                    {items.map((c) => (
                      <div key={c.id} className="py-2 flex items-center justify-between gap-2">
                        <button onClick={() => setEditing(c)} className="text-left flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{c.name}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {c.monthlyBudget > 0 ? `Budget ${formatMoney(c.monthlyBudget, settings.currency)}` : "No budget"}
                            {c.genericLabel ? ` · shown as "${c.genericLabel}"` : ""}
                          </p>
                        </button>
                        <button
                          onClick={() => { if (confirm(`Delete "${c.name}"?`)) deleteCategory(c.id); }}
                          className="text-muted-foreground p-1"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}

      {editing && (
        <CategoryDialog
          cat={editing}
          onClose={() => setEditing(null)}
          onSave={async (c) => { await upsertCategory(c); setEditing(null); }}
        />
      )}
    </div>
  );
}

function CategoryDialog({ cat, onClose, onSave }: { cat: Category; onClose: () => void; onSave: (c: Category) => void }) {
  const [c, setC] = useState(cat);
  const [error, setError] = useState("");

  function save() {
    if (!c.name.trim()) { setError("Please enter a name"); return; }
    if (c.monthlyBudget < 0) { setError("Budget must be 0 or positive"); return; }
    onSave({ ...c, name: c.name.trim(), monthlyBudget: c.monthlyBudget || 0 });
  }

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-2xl p-4 w-full max-w-md space-y-3" onClick={(e) => e.stopPropagation()}>
        <p className="font-semibold">Category</p>
        <div>
          <Label>Name</Label>
          <Input value={c.name} onChange={(e) => setC({ ...c, name: e.target.value })} placeholder="e.g. Groceries" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label>Type</Label>
            <Select value={c.type} onValueChange={(v) => setC({ ...c, type: v as CategoryType })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="income">Income</SelectItem>
                <SelectItem value="bills">Bills</SelectItem>
                <SelectItem value="expenses">Expenses</SelectItem>
                <SelectItem value="savings">Savings</SelectItem>
                <SelectItem value="debt">Debt</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Profile</Label>
            <Select value={c.profileDefault} onValueChange={(v) => setC({ ...c, profileDefault: v as ProfileId })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="household">Household</SelectItem>
                <SelectItem value="personal">Personal</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div>
          <Label>Monthly budget (optional)</Label>
          <Input
            type="number"
            min="0"
            step="0.01"
            value={c.monthlyBudget}
            onChange={(e) => setC({ ...c, monthlyBudget: Math.max(0, parseFloat(e.target.value) || 0) })}
            placeholder="0"
          />
        </div>
        <div>
          <Label>Generic label (used in discreet mode)</Label>
          <Input
            value={c.genericLabel}
            onChange={(e) => setC({ ...c, genericLabel: e.target.value })}
            placeholder="e.g. Food (instead of REWE)"
          />
        </div>
        {error && <p className="text-sm text-destructive font-medium">{error}</p>}
        <div className="flex gap-2 justify-end pt-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save}>Save</Button>
        </div>
      </div>
    </div>
  );
}

function RulesEditor() {
  const { rules, categories, upsertRule, deleteRule } = useApp();
  const [test, setTest] = useState("");
  const [editing, setEditing] = useState<Rule | null>(null);

  function newRule() {
    setEditing({
      id: uid(),
      keyword: "",
      field: "either",
      categoryId: categories[0]?.id || "",
      profile: "household",
      priority: 10,
    });
  }

  return (
    <div className="space-y-3">
      <div className="bg-card rounded-2xl border border-border p-4 space-y-2">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-primary" />
          <p className="font-medium">What are auto-tag rules?</p>
        </div>
        <p className="text-xs text-muted-foreground">
          When you import a CSV file from your bank, the app reads each row's payee and description.
          Auto-tag rules let you say <em>"if the payee or description contains a specific word, automatically assign this category and profile."</em>
        </p>
        <p className="text-xs text-muted-foreground">
          Example: <span className="font-medium text-foreground">REWE → Household / Groceries</span> means any transaction with "REWE" in its text gets categorized as a household grocery expense — saving you from sorting them by hand every month.
        </p>
      </div>

      <div className="bg-card rounded-2xl border border-border p-3 space-y-2">
        <Label className="text-xs">Test against text</Label>
        <Input placeholder="e.g. REWE SAGT DANKE" value={test} onChange={(e) => setTest(e.target.value)} />
        {test && (
          <p className="text-xs text-muted-foreground">
            {(() => {
              // Uses the same engine the importer uses. The old test ignored
              // both the rule's field setting and its priority, so it could
              // report a match the importer would never make.
              const hit = applyRules(test, test, rules);
              if (!hit) return "No match — this would need categorising by hand.";
              const cat = categories.find((c) => c.id === hit.categoryId);
              return `Matches → ${cat?.name ?? "a deleted category"} · ${profileLabel(hit.profile)}`;
            })()}
          </p>
        )}
      </div>

      <div className="flex justify-between items-center">
        <p className="text-sm font-medium">{rules.length} rule{rules.length === 1 ? "" : "s"}</p>
        <Button size="sm" onClick={newRule}><Plus size={14} className="mr-1" /> New rule</Button>
      </div>

      <div className="bg-card rounded-2xl border border-border divide-y divide-border">
        {rules.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground text-center">
            No rules yet. They'll be created automatically when you import a CSV and choose to save categorizations.
          </p>
        ) : (
          rules
            .slice()
            .sort((a, b) => b.priority - a.priority)
            .map((r) => {
              const c = categories.find((cc) => cc.id === r.categoryId);
              return (
                <div key={r.id} className="p-3 flex items-center gap-2">
                  <button className="flex-1 text-left min-w-0" onClick={() => setEditing(r)}>
                    <p className="text-sm font-medium truncate">"{r.keyword}"</p>
                    <p className="text-[11px] text-muted-foreground">
                      In {r.field} → {c?.name || "—"} · {profileLabel(r.profile)}
                    </p>
                  </button>
                  <button onClick={() => { if (confirm("Delete rule?")) deleteRule(r.id); }} className="text-muted-foreground p-1">
                    <Trash2 size={14} />
                  </button>
                </div>
              );
            })
        )}
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur flex items-center justify-center p-4" onClick={() => setEditing(null)}>
          <div className="bg-card border border-border rounded-2xl p-4 w-full max-w-md space-y-3" onClick={(e) => e.stopPropagation()}>
            <p className="font-semibold">Auto-tag rule</p>
            <div>
              <Label>Keyword</Label>
              <Input
                placeholder="e.g. REWE"
                value={editing.keyword}
                onChange={(e) => setEditing({ ...editing, keyword: e.target.value })}
              />
              <p className="text-[11px] text-muted-foreground mt-1">Case-insensitive. Matches if the text contains this anywhere.</p>
            </div>
            <div>
              <Label>Look in</Label>
              <Select value={editing.field} onValueChange={(v) => setEditing({ ...editing, field: v as Rule["field"] })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="payee">Payee only</SelectItem>
                  <SelectItem value="description">Description only</SelectItem>
                  <SelectItem value="either">Either</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Profile</Label>
                <Select
                  value={editing.profile}
                  onValueChange={(v) => {
                    const profile = v as ProfileId;
                    // Drop a category that belongs to the other profile,
                    // which would otherwise leave the Select showing blank.
                    const stillValid = categories.some((c) => c.id === editing.categoryId && c.profileDefault === profile);
                    setEditing({
                      ...editing,
                      profile,
                      categoryId: stillValid ? editing.categoryId : (categories.find((c) => c.profileDefault === profile)?.id ?? ""),
                    });
                  }}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="household">Household</SelectItem>
                    <SelectItem value="personal">Personal</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Category</Label>
                <Select value={editing.categoryId} onValueChange={(v) => setEditing({ ...editing, categoryId: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {categories
                      .filter(c => c.profileDefault === editing.profile)
                      .map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Priority</Label>
              <Input
                type="number"
                min="0"
                value={editing.priority}
                onChange={(e) => setEditing({ ...editing, priority: Math.max(0, parseInt(e.target.value) || 0) })}
              />
              <p className="text-[11px] text-muted-foreground mt-1">Higher numbers win when multiple rules match.</p>
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
              <Button onClick={async () => {
                if (!editing.keyword.trim()) return;
                await upsertRule({ ...editing, keyword: editing.keyword.trim() });
                setEditing(null);
              }}>Save</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DataBackup() {
  const store = useApp();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function exportBackup() {
    const data = {
      version: 1,
      exportedAt: new Date().toISOString(),
      app: "pocket-money",
      transactions: store.transactions,
      categories: store.categories,
      subscriptions: store.subscriptions,
      billPayments: store.billPayments,
      rules: store.rules,
      settings: store.settings,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    // Local calendar date, not toISOString(), which names the file with
    // yesterday's date late in the evening.
    a.download = `pocket-money-backup-${isoFromDate(new Date())}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast.success("Backup saved");
  }

  async function importBackup(file: File) {
    setBusy(true);
    try {
      const data = JSON.parse(await file.text());
      if (data.app !== "pocket-money" && !Array.isArray(data.transactions)) {
        toast.error("That does not look like a Pocket Money backup file.");
        return;
      }
      const counts = [
        [data.transactions?.length || 0, "transactions"],
        [data.categories?.length || 0, "categories"],
        [data.subscriptions?.length || 0, "subscriptions"],
        [data.rules?.length || 0, "rules"],
      ] as const;
      const summary = counts.filter(([n]) => n > 0).map(([n, label]) => `${n} ${label}`).join(", ");
      if (!summary) { toast.error("That backup is empty."); return; }
      if (!confirm(`Restore ${summary}?\n\nThis adds to your existing data. Records with the same id are replaced.`)) return;

      // One bulk write per store, then a single reload. Previously each record
      // was written individually and every write re-read the whole store.
      await store.restoreBackup(data);
      toast.success(`Restored ${summary}`);
    } catch (e) {
      toast.error("Could not restore that backup: " + (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-card rounded-2xl border border-border p-4 space-y-3">
      <p className="font-medium">Plain JSON copy</p>
      <p className="text-xs text-muted-foreground">
        The same data as a readable JSON file, for moving it into another tool or inspecting it
        yourself.
      </p>
      {/* Named unmistakably: it sits right under the encrypted backup, and the
          two must never be mistaken for each other. */}
      <p className="text-[11px] text-destructive">
        Not encrypted — anyone who opens this file can read every transaction. Prefer the
        encrypted backup above for keeping or transferring your data.
      </p>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" onClick={exportBackup} disabled={busy}>
          Export unencrypted
        </Button>
        <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={busy}>
          {busy ? "Restoring…" : "Import JSON"}
        </Button>
      </div>
      <input ref={fileRef} type="file" accept=".json" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) importBackup(f); e.target.value = ""; }} />
    </div>
  );
}
