import { useMemo, useState } from "react";
import { useApp } from "@/lib/store";
import { formatMoney, formatDate, isInMonth, monthKey, profileLabel } from "@/lib/format";
import { Plus, Pencil, Trash2, Search, ChevronLeft, ChevronRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import TransactionDialog from "@/components/TransactionDialog";
import { MerchantLogo, CategoryIcon } from "@/components/MerchantLogo";
import type { Transaction } from "@/lib/types";
import { DiscreetText } from "@/components/Discreet";
import { exportTransactionsCSV, downloadFile } from "@/lib/csv";

export default function TransactionsPage() {
  const { transactions, categories, settings, deleteTransaction, deleteSplitGroup } = useApp();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [query, setQuery] = useState("");
  // The page used to render every transaction ever recorded, with no filter,
  // search or paging — thousands of rows once a year of statements is in.
  const [month, setMonth] = useState<Date | null>(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const catMap = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  const scoped = useMemo(
    () => transactions
      .filter((t) => settings.activeProfile === "combined" || t.profile === settings.activeProfile)
      .filter((t) => !month || isInMonth(t.date, month)),
    [transactions, settings.activeProfile, month]
  );

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return scoped
      .filter((t) => {
        if (!q) return true;
        const c = catMap.get(t.categoryId);
        return `${t.payee} ${t.description} ${t.displayDescription ?? ""} ${c?.name ?? ""}`.toLowerCase().includes(q);
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [scoped, query, catMap]);

  const monthTotal = useMemo(() => {
    let inflow = 0, outflow = 0;
    for (const t of list) {
      const c = catMap.get(t.categoryId);
      if (c?.type === "income") inflow += Math.abs(t.amount);
      else outflow += Math.abs(t.amount);
    }
    return { inflow, outflow };
  }, [list, catMap]);

  const grouped = useMemo(() => {
    const m = new Map<string, Transaction[]>();
    for (const t of list) {
      const bucket = m.get(t.date);
      if (bucket) bucket.push(t);
      else m.set(t.date, [t]);
    }
    return [...m.entries()];
  }, [list]);

  /** Months that actually contain data, for the "all time" jump list. */
  const hasAnyOutsideMonth = transactions.length > list.length;

  function exportCSV() {
    const rows = list.map((t) => {
      const c = catMap.get(t.categoryId);
      const hide = settings.discreetMode || t.isVague;
      return {
        Date: t.date,
        Type: c?.type === "income" ? "Credit" : "Debit",
        Profile: profileLabel(t.profile),
        Category: c?.name || "",
        Payee: hide ? "" : t.payee,
        Description: hide ? (t.displayDescription || c?.genericLabel || "") : t.description,
        Amount: c?.type === "income" ? Math.abs(t.amount) : -Math.abs(t.amount),
      };
    });
    const scope = month ? monthKey(month) : "all";
    downloadFile(`pocket-money-transactions-${scope}.csv`, exportTransactionsCSV(rows));
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center gap-2">
        <h2 className="font-semibold">Transactions</h2>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportCSV} disabled={list.length === 0}>CSV</Button>
          <Button size="sm" onClick={() => { setEditing(null); setOpen(true); }}>
            <Plus size={16} className="mr-1" /> Add
          </Button>
        </div>
      </div>

      {/* Month scope */}
      <div className="flex items-center gap-2">
        <button
          className="p-2 rounded-full bg-secondary disabled:opacity-40"
          aria-label="Previous month"
          disabled={!month}
          onClick={() => month && setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
        >
          <ChevronLeft size={15} />
        </button>
        <button
          className="flex-1 text-sm font-medium py-1.5 rounded-lg bg-secondary hover:bg-accent transition-colors"
          onClick={() => setMonth(month ? null : new Date(new Date().getFullYear(), new Date().getMonth(), 1))}
        >
          {month ? month.toLocaleDateString(undefined, { month: "long", year: "numeric" }) : "All time"}
          <span className="text-muted-foreground font-normal"> · {list.length}</span>
        </button>
        <button
          className="p-2 rounded-full bg-secondary disabled:opacity-40"
          aria-label="Next month"
          disabled={!month}
          onClick={() => month && setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
        >
          <ChevronRight size={15} />
        </button>
      </div>

      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <Input
          className="pl-9 pr-9"
          placeholder="Search payee, description or category"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query && (
          <button
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label="Clear search"
            onClick={() => setQuery("")}
          >
            <X size={14} />
          </button>
        )}
      </div>

      {list.length > 0 && (
        <div className="flex gap-3 text-xs text-muted-foreground px-1">
          <span>In <span className="font-medium text-income tabular-nums">{formatMoney(monthTotal.inflow, settings.currency)}</span></span>
          <span>Out <span className="font-medium text-expense tabular-nums">{formatMoney(monthTotal.outflow, settings.currency)}</span></span>
        </div>
      )}

      {grouped.length === 0 ? (
        <div className="py-12 text-center space-y-2">
          <p className="text-sm text-muted-foreground">
            {query ? `Nothing matches "${query}".`
              : month ? `No transactions in ${month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}.`
              : "No transactions yet. Tap Add to create one, or import a CSV."}
          </p>
          {month && hasAnyOutsideMonth && !query && (
            <button className="text-xs text-primary font-medium" onClick={() => setMonth(null)}>
              Show all time instead
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {grouped.map(([date, items]) => (
            <div key={date}>
              <p className="text-xs text-muted-foreground mb-1.5 px-1">
                {formatDate(date, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
              </p>
              <div className="bg-card rounded-2xl border border-hairline shadow-card divide-y divide-hairline">
                {items.map((t) => {
                  const c = catMap.get(t.categoryId);
                  const hide = settings.discreetMode || t.isVague;
                  const display = hide
                    ? t.displayDescription || c?.genericLabel || c?.name
                    : t.payee || t.description || c?.name;
                  const isIncome = c?.type === "income";
                  return (
                    <div key={t.id} className="group flex items-center gap-3 px-4 py-3">
                      {/* A hidden row has no merchant to show, and a "?" tile
                          is worse than nothing — use its category instead. */}
                      {hide
                        ? <CategoryIcon type={c?.type ?? "expenses"} size="md" />
                        : <MerchantLogo payee={t.payee || c?.name || ""} size={36} />}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">
                          <DiscreetText fallback={c?.genericLabel || c?.name}>{display}</DiscreetText>
                          {t.splitGroupId && <span className="ml-2 text-[10px] text-muted-foreground">SPLIT</span>}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {c?.name} · {profileLabel(t.profile)}
                        </p>
                      </div>
                      {/* Amount and actions sit on one line: stacking the icons
                          under the figure squeezed them and broke the row's
                          baseline. They stay reserved space, so nothing shifts
                          when they appear on hover. */}
                      <p className={"font-semibold tabular-nums text-right " + (isIncome ? "text-income" : "text-foreground")}>
                        <DiscreetText fallback="••">
                          {isIncome ? "+" : "−"}
                          {formatMoney(Math.abs(t.amount), settings.currency)}
                        </DiscreetText>
                      </p>
                      <div className="flex gap-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                          <button
                            className="p-1.5 rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground"
                            aria-label="Edit transaction"
                            onClick={() => { setEditing(t); setOpen(true); }}
                          >
                            <Pencil size={15} />
                          </button>
                          <button
                            className="p-1.5 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                            aria-label="Delete transaction"
                            onClick={() => {
                              if (t.splitGroupId) {
                                if (confirm("Delete every part of this split transaction?")) deleteSplitGroup(t.splitGroupId);
                              } else if (confirm("Delete this transaction?")) {
                                deleteTransaction(t.id);
                              }
                            }}
                          >
                            <Trash2 size={15} />
                          </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <TransactionDialog open={open} onOpenChange={setOpen} editing={editing} />
    </div>
  );
}
