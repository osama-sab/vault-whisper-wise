import { useMemo, useState } from "react";
import { Plus, Trash2, Pencil, Check, X, ArrowLeftRight, Search } from "lucide-react";
import { useApp } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardHead, IconButton, Segmented, FieldLabel, EmptyState, Note } from "@/components/ui/surface";
import { CategoryIcon } from "@/components/MerchantLogo";
import { PROFILE_META } from "@/lib/profiles";
import { currencySymbol, formatMoney, isInMonth } from "@/lib/format";
import { uid } from "@/lib/db";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { Category, CategoryType, ProfileId } from "@/lib/types";

const TYPE_LABELS: Record<CategoryType, string> = {
  income: "Income",
  bills: "Bills",
  expenses: "Expenses",
  savings: "Savings",
  debt: "Debt",
};

const TYPE_ORDER: CategoryType[] = ["income", "bills", "expenses", "savings", "debt"];

/**
 * Categories, arranged the way people actually think about them.
 *
 * The old editor stacked both profiles' five type-groups down one page — ten
 * cards, no totals, and the monthly limit only reachable through a modal, so
 * "what am I budgeting in total" and "raise Groceries by twenty" were both
 * several clicks and a scroll away.
 *
 * Now: one profile at a time (they are separate budgets, so showing both at
 * once only invites filing things in the wrong one), each limit editable in
 * place, a running total per group and for the profile, and adding happens on
 * the row where the new category will appear.
 */
export default function CategoriesEditor() {
  const { categories, transactions, settings, upsertCategory, deleteCategory } = useApp();
  const [profile, setProfile] = useState<ProfileId>(
    settings.activeProfile === "personal" ? "personal" : "household"
  );
  const [editing, setEditing] = useState<Category | null>(null);
  const [query, setQuery] = useState("");

  const thisMonth = useMemo(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  }, []);

  /** Spent per category this month, so a limit can be read against something. */
  const spentByCategory = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of transactions) {
      if (!isInMonth(t.date, thisMonth)) continue;
      m.set(t.categoryId, (m.get(t.categoryId) ?? 0) + Math.abs(t.amount));
    }
    return m;
  }, [transactions, thisMonth]);

  /** How many transactions each category owns — what a delete would strand. */
  const usageByCategory = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of transactions) m.set(t.categoryId, (m.get(t.categoryId) ?? 0) + 1);
    return m;
  }, [transactions]);

  const mine = useMemo(
    () => categories.filter((c) => c.profileDefault === profile),
    [categories, profile]
  );

  const q = query.trim().toLowerCase();
  const matches = (c: Category) => !q || c.name.toLowerCase().includes(q);

  const totalLimit = mine
    .filter((c) => c.type !== "income")
    .reduce((s, c) => s + (c.monthlyBudget || 0), 0);
  const withoutLimit = mine.filter((c) => c.type !== "income" && !c.monthlyBudget).length;

  const counts = { household: 0, personal: 0 };
  for (const c of categories) counts[c.profileDefault]++;

  async function setBudget(c: Category, value: number) {
    await upsertCategory({ ...c, monthlyBudget: Math.max(0, value) });
  }

  async function remove(c: Category) {
    const used = usageByCategory.get(c.id) ?? 0;
    // Deleting a category used to be silent. The transactions filed under it
    // are not deleted with it, but they stop being attributable — they vanish
    // from every total and every budget — so the count has to be said first.
    const warning = used > 0
      ? `"${c.name}" still has ${used} transaction${used === 1 ? "" : "s"} filed under it.\n\n` +
        "They will not be deleted, but they will stop counting towards any budget " +
        "until you re-file them.\n\nDelete the category anyway?"
      : `Delete "${c.name}"?`;
    if (!confirm(warning)) return;
    await deleteCategory(c.id);
    toast.success(`${c.name} deleted`);
  }

  async function moveToOtherProfile(c: Category) {
    const target: ProfileId = c.profileDefault === "household" ? "personal" : "household";
    await upsertCategory({ ...c, profileDefault: target });
    toast.success(`${c.name} moved to ${PROFILE_META[target].label}`);
  }

  const meta = PROFILE_META[profile];

  return (
    <div className="space-y-3">
      <Note>
        Categories are how each transaction is classified, and each one belongs to either Household
        or Personal. Only the categories of the profile you are entering a transaction for are
        offered, so the two budgets never mix.
      </Note>

      {/* Which world, and what it costs. */}
      <Card className="p-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <Segmented<ProfileId>
            ariaLabel="Profile"
            value={profile}
            onChange={setProfile}
            options={[
              { value: "household", label: `Household · ${counts.household}`, icon: PROFILE_META.household.icon },
              { value: "personal", label: `Personal · ${counts.personal}`, icon: PROFILE_META.personal.icon },
            ]}
          />
          <Button
            size="sm"
            className="rounded-full"
            onClick={() => setEditing({
              id: uid(), name: "", type: "expenses", profileDefault: profile,
              monthlyBudget: 0, genericLabel: "",
            })}
          >
            <Plus size={15} className="mr-1" /> New category
          </Button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-4 pt-4 border-t border-hairline">
          <div className="min-w-0">
            <FieldLabel>Monthly limit</FieldLabel>
            <p className={cn("text-[19px] font-semibold tabular-nums tracking-tight mt-1 truncate", meta.text)}>
              {formatMoney(totalLimit, settings.currency)}
            </p>
          </div>
          <div className="min-w-0">
            <FieldLabel>Categories</FieldLabel>
            <p className="text-[19px] font-semibold tabular-nums tracking-tight mt-1">{mine.length}</p>
          </div>
          <div className="min-w-0">
            <FieldLabel>Without a limit</FieldLabel>
            <p className="text-[19px] font-semibold tabular-nums tracking-tight mt-1">{withoutLimit}</p>
          </div>
        </div>
      </Card>

      {mine.length > 6 && (
        <div className="relative">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <Input
            className="pl-10 h-9 rounded-full bg-card border-hairline"
            placeholder={`Search ${meta.label.toLowerCase()} categories`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      )}

      {mine.length === 0 ? (
        <Card>
          <EmptyState
            icon={PROFILE_META[profile].icon}
            title={`No ${meta.label.toLowerCase()} categories yet`}
            action={
              <Button
                size="sm"
                className="rounded-full"
                onClick={() => setEditing({
                  id: uid(), name: "", type: "expenses", profileDefault: profile,
                  monthlyBudget: 0, genericLabel: "",
                })}
              >
                <Plus size={15} className="mr-1" /> Add the first one
              </Button>
            }
          >
            Categories group your spending — Groceries, Rent, Transport — and carry the monthly
            limit you want to keep to.
          </EmptyState>
        </Card>
      ) : (
        <div className="grid gap-3 2xl:grid-cols-2 items-start">
          {TYPE_ORDER.map((type) => {
            const items = mine
              .filter((c) => c.type === type && matches(c))
              .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
            const all = mine.filter((c) => c.type === type);
            if (all.length === 0 && q) return null;

            const groupLimit = all.reduce((s, c) => s + (c.monthlyBudget || 0), 0);

            return (
              <Card key={type} className="p-4">
                <CardHead
                  title={
                    <span className="flex items-center gap-2">
                      {TYPE_LABELS[type]}
                      <span className="text-[11px] font-normal text-muted-foreground tabular-nums">{all.length}</span>
                    </span>
                  }
                  hint={
                    type === "income"
                      ? "No limits — money coming in"
                      : groupLimit > 0
                        ? `${formatMoney(groupLimit, settings.currency)} a month`
                        : "No limits set"
                  }
                  action={
                    <IconButton
                      className="w-8 h-8"
                      aria-label={`Add a ${TYPE_LABELS[type].toLowerCase()} category`}
                      onClick={() => setEditing({
                        id: uid(), name: "", type, profileDefault: profile,
                        monthlyBudget: 0, genericLabel: "",
                      })}
                    >
                      <Plus size={15} />
                    </IconButton>
                  }
                />

                {items.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    {q ? "Nothing matches here." : `No ${TYPE_LABELS[type].toLowerCase()} categories yet.`}
                  </p>
                ) : (
                  <div className="divide-y divide-hairline">
                    {items.map((c) => (
                      <CategoryRow
                        key={c.id}
                        category={c}
                        currency={settings.currency}
                        symbol={currencySymbol(settings.currency)}
                        spent={spentByCategory.get(c.id) ?? 0}
                        used={usageByCategory.get(c.id) ?? 0}
                        onBudget={(v) => setBudget(c, v)}
                        onEdit={() => setEditing(c)}
                        onMove={() => moveToOtherProfile(c)}
                        onDelete={() => remove(c)}
                      />
                    ))}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {editing && (
        <CategoryDialog
          cat={editing}
          onClose={() => setEditing(null)}
          onSave={async (c) => {
            await upsertCategory(c);
            setEditing(null);
            toast.success(`${c.name} saved`);
          }}
        />
      )}
    </div>
  );
}

/**
 * One category: what it is, what it costs, and what it is allowed to cost.
 *
 * The limit is an input, not a label — changing it is the single most common
 * thing anyone does on this page and it should not need a modal.
 */
function CategoryRow({
  category: c, currency, symbol, spent, used, onBudget, onEdit, onMove, onDelete,
}: {
  category: Category;
  currency: string;
  symbol: string;
  spent: number;
  used: number;
  onBudget: (value: number) => void;
  onEdit: () => void;
  onMove: () => void;
  onDelete: () => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const isIncome = c.type === "income";
  const pct = c.monthlyBudget > 0 ? Math.min(100, (spent / c.monthlyBudget) * 100) : 0;
  const over = c.monthlyBudget > 0 && spent > c.monthlyBudget;

  function commit() {
    if (draft === null) return;
    const value = parseFloat(draft.replace(",", "."));
    onBudget(Number.isFinite(value) ? value : 0);
    setDraft(null);
  }

  return (
    <div className="group py-2.5">
      <div className="flex items-center gap-2.5">
        <CategoryIcon type={c.type} size="sm" />

        <button onClick={onEdit} className="min-w-0 flex-1 text-left">
          <p className="text-[13.5px] font-medium truncate leading-tight">{c.name}</p>
          <p className="text-[11px] text-muted-foreground truncate">
            {spent > 0 ? `${formatMoney(spent, currency)} this month` : "Nothing yet this month"}
            {c.genericLabel ? ` · shown as “${c.genericLabel}”` : ""}
          </p>
        </button>

        {/* Income has no ceiling, so it gets no input rather than a disabled
            one that invites a click. */}
        {!isIncome && (
          <div className="flex items-center gap-1 flex-shrink-0">
            <div className="relative">
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground pointer-events-none">
                {symbol}
              </span>
            <Input
              aria-label={`Monthly limit for ${c.name}`}
              inputMode="decimal"
              className="h-8 w-[6.25rem] text-right text-[13px] tabular-nums pl-6 pr-2"
              value={draft ?? (c.monthlyBudget ? String(c.monthlyBudget) : "")}
              placeholder="No limit"
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
                if (e.key === "Escape") { setDraft(null); e.currentTarget.blur(); }
              }}
            />
            </div>
            {draft !== null && (
              <span className="flex items-center gap-0.5">
                <IconButton className="w-7 h-7" aria-label="Save limit" onMouseDown={(e) => e.preventDefault()} onClick={commit}>
                  <Check size={14} />
                </IconButton>
                <IconButton className="w-7 h-7" aria-label="Cancel" onMouseDown={(e) => e.preventDefault()} onClick={() => setDraft(null)}>
                  <X size={14} />
                </IconButton>
              </span>
            )}
          </div>
        )}

        <div className="flex items-center gap-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
          <IconButton className="w-8 h-8" aria-label={`Edit ${c.name}`} onClick={onEdit}>
            <Pencil size={14} />
          </IconButton>
          <IconButton
            className="w-8 h-8"
            aria-label={`Move ${c.name} to the other profile`}
            title={`Move to ${c.profileDefault === "household" ? "Personal" : "Household"}`}
            onClick={onMove}
          >
            <ArrowLeftRight size={14} />
          </IconButton>
          <IconButton
            className="w-8 h-8"
            tone="danger"
            aria-label={`Delete ${c.name}`}
            title={used > 0 ? `${used} transactions use this` : "Delete"}
            onClick={onDelete}
          >
            <Trash2 size={14} />
          </IconButton>
        </div>
      </div>

      {/* Only drawn where there is a limit to be inside of. */}
      {!isIncome && c.monthlyBudget > 0 && (
        <div className="mt-1.5 ml-[2.6rem] h-1 rounded-full bg-secondary overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full",
              over ? "bg-gradient-to-r from-warning to-destructive"
                : pct > 80 ? "bg-gradient-to-r from-warning/70 to-warning"
                : "bg-gradient-to-r from-primary/70 to-primary"
            )}
            style={{ width: `${Math.max(2, pct)}%` }}
          />
        </div>
      )}
    </div>
  );
}

function CategoryDialog({
  cat, onClose, onSave,
}: { cat: Category; onClose: () => void; onSave: (c: Category) => void }) {
  const [c, setC] = useState(cat);
  const [error, setError] = useState("");
  const isNew = !cat.name;

  function save() {
    if (!c.name.trim()) { setError("Please enter a name"); return; }
    if (c.monthlyBudget < 0) { setError("A limit cannot be negative"); return; }
    onSave({ ...c, name: c.name.trim(), monthlyBudget: c.monthlyBudget || 0 });
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-background/80 backdrop-blur flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-card border border-hairline rounded-panel shadow-panel p-5 w-full max-w-md space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5">
          <CategoryIcon type={c.type} size="sm" />
          <p className="font-semibold tracking-tight">{isNew ? "New category" : c.name}</p>
        </div>

        <div>
          <Label htmlFor="cat-name">Name</Label>
          <Input
            id="cat-name"
            autoFocus
            value={c.name}
            onChange={(e) => setC({ ...c, name: e.target.value })}
            onKeyDown={(e) => { if (e.key === "Enter") save(); }}
            placeholder="e.g. Groceries"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Type</Label>
            <Select value={c.type} onValueChange={(v) => setC({ ...c, type: v as CategoryType })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TYPE_ORDER.map((t) => (
                  <SelectItem key={t} value={t}>{TYPE_LABELS[t]}</SelectItem>
                ))}
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

        {c.type !== "income" && (
          <div>
            <Label htmlFor="cat-budget">Monthly limit (optional)</Label>
            <Input
              id="cat-budget"
              type="number"
              min="0"
              step="0.01"
              value={c.monthlyBudget || ""}
              onChange={(e) => setC({ ...c, monthlyBudget: Math.max(0, parseFloat(e.target.value) || 0) })}
              placeholder="No limit"
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              Leave it empty to track the category without holding it to a number.
            </p>
          </div>
        )}

        <div>
          <Label htmlFor="cat-generic">Generic label</Label>
          <Input
            id="cat-generic"
            value={c.genericLabel}
            onChange={(e) => setC({ ...c, genericLabel: e.target.value })}
            placeholder="e.g. Food"
          />
          <p className="text-[11px] text-muted-foreground mt-1">
            Shown instead of the payee while discreet mode is on.
          </p>
        </div>

        {error && <p className="text-sm text-destructive font-medium">{error}</p>}

        <div className="flex gap-2 justify-end pt-1">
          <Button variant="outline" className="rounded-full" onClick={onClose}>Cancel</Button>
          <Button className="rounded-full" onClick={save}>{isNew ? "Create" : "Save"}</Button>
        </div>
      </div>
    </div>
  );
}
