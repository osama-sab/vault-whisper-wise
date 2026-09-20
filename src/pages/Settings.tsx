import { useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { useApp } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Trash2, Sparkles, Palette, Coins, Info, Sun, Moon, Monitor, Settings2, Wallet, Tags, ShieldCheck, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { uid, deleteDatabase } from "@/lib/db";
import { CategoryIcon } from "@/components/MerchantLogo";
import type { CategoryType, ProfileId, Rule, Category } from "@/lib/types";
import { applyRules } from "@/lib/rules";
import { formatMoney, isValidCurrency, isoFromDate, profileLabel } from "@/lib/format";
import { toast } from "sonner";
import SecurityPanel from "@/components/SecurityPanel";
import AccountsEditor from "@/components/AccountsEditor";
import CategoriesEditor from "@/components/CategoriesEditor";
import { Card, CardHead, IconButton, Note } from "@/components/ui/surface";

const TYPE_LABELS: Record<CategoryType, string> = {
  income: "Income",
  bills: "Bills",
  expenses: "Expenses",
  savings: "Savings",
  debt: "Debt",
};

const APP_VERSION = "1.0.0";

const SETTINGS_SECTIONS = [
  { id: "general", label: "General", icon: Settings2, hint: "Theme, currency, paydays" },
  { id: "accounts", label: "Accounts", icon: Wallet, hint: "Banks, cards, balances" },
  { id: "categories", label: "Categories", icon: Tags, hint: "How spending is grouped" },
  { id: "rules", label: "Rules", icon: Sparkles, hint: "Auto-sorting on import" },
  { id: "data", label: "Data & security", icon: ShieldCheck, hint: "Encryption, backups" },
] as const;

/** A titled group of related settings. */
export function Section({ icon: Icon, title, children }: {
  icon: LucideIcon; title: string; children: React.ReactNode;
}) {
  return (
    <Card flush className="overflow-hidden">
      <div className="px-4 pt-4 pb-3">
        <CardHead icon={Icon} title={title} tight />
      </div>
      <div className="px-4 pb-4 space-y-4">{children}</div>
    </Card>
  );
}

/** Label and explanation on the left, control on the right. */
export function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {hint && <p className="text-[11px] text-muted-foreground mt-0.5">{hint}</p>}
      </div>
      <div className="flex-shrink-0 pt-0.5">{children}</div>
    </div>
  );
}

const THEMES = [
  { value: "system", label: "Auto", icon: Monitor },
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
] as const;

function ThemePicker() {
  const { theme, setTheme } = useTheme();
  // Unknown until mounted, so nothing is highlighted on the first paint.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const active = mounted ? (theme ?? "system") : null;

  return (
    <div className="inline-flex rounded-lg bg-secondary p-0.5" role="group" aria-label="Theme">
      {THEMES.map((t) => (
        <button
          key={t.value}
          onClick={() => setTheme(t.value)}
          aria-pressed={active === t.value}
          className={cn(
            "flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors",
            active === t.value
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <t.icon size={13} />
          {t.label}
        </button>
      ))}
    </div>
  );
}

const ordinal = (n: number) => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

/**
 * Paydays, edited as text but shown back as chips so it is obvious what the
 * app understood. Committed on blur rather than per keystroke — saving as you
 * type meant a half-entered "1, 1" briefly became two paydays on the 1st.
 */
function PaydaysField({ paydays, onChange }: { paydays: number[]; onChange: (d: number[]) => void }) {
  const [draft, setDraft] = useState(paydays.join(", "));
  useEffect(() => { setDraft(paydays.join(", ")); }, [paydays]);

  const parsed = useMemo(() => {
    const days = draft
      .split(/[,\s]+/)
      .map((s) => parseInt(s, 10))
      .filter((n) => Number.isFinite(n) && n >= 1 && n <= 31);
    return [...new Set(days)].sort((a, b) => a - b);
  }, [draft]);

  const rejected = draft.trim() !== "" && parsed.length === 0;

  return (
    <div className="space-y-1.5">
      <Label htmlFor="paydays" className="text-sm">Paydays</Label>
      <Input
        id="paydays"
        className="w-40"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => onChange(parsed)}
        onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
        placeholder="1, 15"
        inputMode="numeric"
      />
      {parsed.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-muted-foreground">Marked on the Bills calendar:</span>
          {parsed.map((d) => (
            <span key={d} className="text-[11px] font-medium bg-income/10 text-income rounded px-1.5 py-0.5">
              {ordinal(d)}
            </span>
          ))}
        </div>
      ) : (
        <p className={cn("text-[11px]", rejected ? "text-destructive" : "text-muted-foreground")}>
          {rejected
            ? "Use day numbers between 1 and 31, separated by commas."
            : "Which days of the month you are paid. Leave empty if it varies."}
        </p>
      )}
    </div>
  );
}

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
    <div>
      {/*
        A sidebar rather than a row of tabs: five sections already crowd one
        row, each section gets room to say what it holds, and a sixth costs
        nothing. Below `md` it collapses to a scrollable row, since a sidebar
        plus content will not fit a narrow window.
      */}
      <Tabs defaultValue="general" orientation="vertical" className="md:grid md:grid-cols-[14rem_minmax(0,1fr)] md:gap-6 md:items-start">
        <TabsList
          className="
            w-full flex justify-start overflow-x-auto
            md:w-full md:flex-col md:h-auto md:items-stretch md:self-start md:overflow-visible
            md:bg-transparent md:p-0 md:gap-1 md:sticky md:top-4
          "
        >
          {SETTINGS_SECTIONS.map((s) => (
            <TabsTrigger
              key={s.id}
              value={s.id}
              className="
                flex-shrink-0 rounded-full md:rounded-xl
                md:w-full md:justify-start md:items-start md:gap-2.5 md:px-3 md:py-2.5 md:text-left
                md:data-[state=active]:bg-primary md:data-[state=active]:text-primary-foreground md:data-[state=active]:shadow-sm
              "
            >
              <s.icon size={15} className="hidden md:block mt-0.5 flex-shrink-0" />
              <span className="min-w-0">
                <span className="block text-sm font-medium truncate">{s.label}</span>
                <span className="hidden md:block text-[11px] opacity-70 truncate font-normal">{s.hint}</span>
              </span>
            </TabsTrigger>
          ))}
        </TabsList>

        <div className="min-w-0 pt-4 md:pt-0 max-w-[46rem]">
        <TabsContent value="general" className="space-y-3 mt-0">
          <Section icon={Palette} title="Appearance">
            <Row label="Theme" hint="Follows Windows unless you pick one.">
              <ThemePicker />
            </Row>
            <Row
              label="Discreet mode"
              hint="Hides every amount and payee behind dots, for working somewhere public."
            >
              <Switch
                checked={settings.discreetMode}
                onCheckedChange={(v) => saveSettings({ discreetMode: v })}
                aria-label="Discreet mode"
              />
            </Row>
          </Section>

          <Section icon={Coins} title="Money">
            <div className="space-y-1.5">
              <Label htmlFor="currency" className="text-sm">Currency</Label>
              <div className="flex items-center gap-3">
                <Input
                  id="currency"
                  className="w-28 uppercase tracking-wide"
                  value={currencyDraft}
                  maxLength={3}
                  autoComplete="off"
                  spellCheck={false}
                  onChange={(e) => setCurrencyDraft(e.target.value.toUpperCase())}
                  onBlur={commitCurrency}
                  onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                  placeholder="EUR"
                />
                <span className={cn("text-sm tabular-nums", currencyValid ? "text-muted-foreground" : "text-destructive")}>
                  {currencyValid ? formatMoney(1234.5, currencyDraft) : "not a currency code"}
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Three letters, such as EUR, USD or GBP.
              </p>
            </div>

            <PaydaysField
              paydays={settings.paydays}
              onChange={(paydays) => saveSettings({ paydays })}
            />
          </Section>

          <Section icon={Info} title="About">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Version</span>
              <span className="tabular-nums">{APP_VERSION}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Everything stays on this computer. Nothing is uploaded, and the app works with no
              internet connection. See the <strong>Data</strong> tab for how it is stored and how to
              back it up.
            </p>
          </Section>
        </TabsContent>

        <TabsContent value="accounts" className="mt-0">
          <AccountsEditor />
        </TabsContent>

        <TabsContent value="categories" className="mt-0">
          <CategoriesEditor />
        </TabsContent>

        <TabsContent value="rules" className="mt-0">
          <RulesEditor />
        </TabsContent>

        <TabsContent value="data" className="space-y-3 mt-0">
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
        </div>
      </Tabs>
    </div>
  );
}

export function RulesEditor() {
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
      <div className="bg-card rounded-card border border-hairline shadow-card p-4 space-y-2">
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

      <div className="bg-card rounded-card border border-hairline shadow-card p-3 space-y-2">
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

      <div className="bg-card rounded-card border border-hairline shadow-card divide-y divide-hairline">
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
          <div className="bg-card border border-hairline rounded-panel shadow-panel p-4 w-full max-w-md space-y-3" onClick={(e) => e.stopPropagation()}>
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

export function DataBackup() {
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
    <div className="bg-card rounded-card border border-hairline shadow-card p-4 space-y-3">
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
