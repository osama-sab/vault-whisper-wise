import { useState } from "react";
import { useApp } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Trash2 } from "lucide-react";
import { uid } from "@/lib/db";
import type { CategoryType, ProfileId, Rule, Category } from "@/lib/types";
import { Link } from "react-router-dom";

export default function SettingsPage() {
  const { settings, saveSettings, categories, upsertCategory, deleteCategory, rules, upsertRule, deleteRule } = useApp();

  return (
    <div className="space-y-4">
      <Tabs defaultValue="general">
        <TabsList className="w-full grid grid-cols-4">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="categories">Categories</TabsTrigger>
          <TabsTrigger value="rules">Rules</TabsTrigger>
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
              <Label>Currency</Label>
              <Input value={settings.currency} onChange={(e) => saveSettings({ currency: e.target.value.toUpperCase() })} />
            </div>
            <div>
              <Label>Paydays (comma-separated days of month)</Label>
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
              />
            </div>
          </div>
          <Link to="/install" className="block bg-card rounded-2xl border border-border p-4 hover:bg-accent">
            <p className="font-medium">Install on home screen</p>
            <p className="text-xs text-muted-foreground">Use this app like a native app.</p>
          </Link>
        </TabsContent>

        <TabsContent value="categories" className="pt-3">
          <CategoriesEditor />
        </TabsContent>

        <TabsContent value="rules" className="pt-3">
          <RulesEditor />
        </TabsContent>

        <TabsContent value="data" className="space-y-3 pt-3">
          <div className="bg-card rounded-2xl border border-border p-4 space-y-2">
            <p className="font-medium">Data location</p>
            <p className="text-xs text-muted-foreground">
              All data is stored locally in your browser's IndexedDB. Nothing leaves your device.
              Clearing browser site data will erase your budget — export CSV/PDF regularly.
            </p>
          </div>
          <Button
            variant="destructive"
            className="w-full"
            onClick={async () => {
              if (!confirm("Erase ALL local data? This cannot be undone.")) return;
              const dbs = await indexedDB.databases?.();
              for (const d of dbs || []) if (d.name) indexedDB.deleteDatabase(d.name);
              location.reload();
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
  const { categories, upsertCategory, deleteCategory } = useApp();
  const [editing, setEditing] = useState<Category | null>(null);
  const grouped = (["income", "bills", "expenses", "savings", "debt"] as CategoryType[]).map((t) => ({
    type: t,
    items: categories.filter((c) => c.type === t),
  }));

  function newCat(type: CategoryType) {
    setEditing({ id: uid(), name: "", type, profileDefault: "household", monthlyBudget: 0, genericLabel: "" });
  }

  return (
    <div className="space-y-4">
      {grouped.map(({ type, items }) => (
        <div key={type} className="bg-card rounded-2xl border border-border p-3">
          <div className="flex justify-between items-center mb-2">
            <p className="font-semibold capitalize">{type}</p>
            <Button size="sm" variant="ghost" onClick={() => newCat(type)}>
              <Plus size={14} />
            </Button>
          </div>
          <div className="divide-y divide-border">
            {items.map((c) => (
              <div key={c.id} className="py-2 flex items-center justify-between gap-2">
                <button onClick={() => setEditing(c)} className="text-left flex-1 min-w-0">
                  <p className="text-sm font-medium">{c.name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {c.profileDefault} · budget {c.monthlyBudget} · {c.genericLabel || "—"}
                  </p>
                </button>
                <button onClick={() => { if (confirm("Delete?")) deleteCategory(c.id); }} className="text-muted-foreground p-1">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
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
  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-2xl p-4 w-full max-w-md space-y-3" onClick={(e) => e.stopPropagation()}>
        <p className="font-semibold">Category</p>
        <Input value={c.name} onChange={(e) => setC({ ...c, name: e.target.value })} placeholder="Name" />
        <div className="grid grid-cols-2 gap-2">
          <Select value={c.profileDefault} onValueChange={(v) => setC({ ...c, profileDefault: v as ProfileId })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="household">Household</SelectItem>
              <SelectItem value="personal">Personal</SelectItem>
            </SelectContent>
          </Select>
          <Input type="number" value={c.monthlyBudget} onChange={(e) => setC({ ...c, monthlyBudget: parseFloat(e.target.value) || 0 })} placeholder="Budget" />
        </div>
        <Input value={c.genericLabel} onChange={(e) => setC({ ...c, genericLabel: e.target.value })} placeholder="Generic label (used in discreet mode)" />
        <div className="flex gap-2 justify-end pt-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onSave(c)}>Save</Button>
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
      <div className="bg-card rounded-2xl border border-border p-3 space-y-2">
        <Label className="text-xs">Test against text</Label>
        <Input placeholder="e.g. REWE SAGT DANKE" value={test} onChange={(e) => setTest(e.target.value)} />
        {test && (
          <p className="text-xs text-muted-foreground">
            {(() => {
              const m = rules.find((r) => test.toLowerCase().includes(r.keyword.toLowerCase()));
              return m
                ? `Matches "${m.keyword}" → ${categories.find((c) => c.id === m.categoryId)?.name} (${m.profile})`
                : "No match";
            })()}
          </p>
        )}
      </div>

      <div className="flex justify-end">
        <Button size="sm" onClick={newRule}><Plus size={14} className="mr-1" /> New rule</Button>
      </div>

      <div className="bg-card rounded-2xl border border-border divide-y divide-border">
        {rules.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground text-center">No rules yet.</p>
        ) : (
          rules
            .sort((a, b) => b.priority - a.priority)
            .map((r) => {
              const c = categories.find((cc) => cc.id === r.categoryId);
              return (
                <div key={r.id} className="p-3 flex items-center gap-2">
                  <button className="flex-1 text-left min-w-0" onClick={() => setEditing(r)}>
                    <p className="text-sm font-medium truncate">"{r.keyword}"</p>
                    <p className="text-[11px] text-muted-foreground">
                      in {r.field} → {c?.name} · {r.profile} · p{r.priority}
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
            <p className="font-semibold">Rule</p>
            <Input
              placeholder="Keyword (e.g. REWE)"
              value={editing.keyword}
              onChange={(e) => setEditing({ ...editing, keyword: e.target.value })}
            />
            <div className="grid grid-cols-2 gap-2">
              <Select value={editing.field} onValueChange={(v) => setEditing({ ...editing, field: v as Rule["field"] })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="payee">Payee</SelectItem>
                  <SelectItem value="description">Description</SelectItem>
                  <SelectItem value="either">Either</SelectItem>
                </SelectContent>
              </Select>
              <Input type="number" value={editing.priority} onChange={(e) => setEditing({ ...editing, priority: parseInt(e.target.value) || 0 })} />
            </div>
            <Select value={editing.categoryId} onValueChange={(v) => setEditing({ ...editing, categoryId: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={editing.profile} onValueChange={(v) => setEditing({ ...editing, profile: v as ProfileId })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="household">Household</SelectItem>
                <SelectItem value="personal">Personal</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
              <Button onClick={async () => { await upsertRule(editing); setEditing(null); }}>Save</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}