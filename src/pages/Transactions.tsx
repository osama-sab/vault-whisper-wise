import { useMemo, useState } from "react";
import { useApp } from "@/lib/store";
import { formatMoney, formatDate, isInMonth, monthKey, profileLabel } from "@/lib/format";
import { Plus, Pencil, Trash2, Search, X, FileDown, Receipt, ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import TransactionDialog from "@/components/TransactionDialog";
import { MerchantLogo, CategoryIcon, CategoryGlyph } from "@/components/MerchantLogo";
import type { Transaction } from "@/lib/types";
import { DiscreetText } from "@/components/Discreet";
import { exportTransactionsCSV, downloadFile } from "@/lib/csv";
import { Card, MonthStepper, IconButton, EmptyState, FieldLabel } from "@/components/ui/surface";
import { cn } from "@/lib/utils";

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

  /** Whether anything exists outside the current scope, for the "all time" hint. */
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
      {/* Scope left, actions right. Clicking the month's name switches between
          this month and all time, which used to be a full-width button. */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <MonthStepper
          month={month}
          onChange={setMonth}
          label={month ? undefined : "All time"}
          onLabelClick={() =>
            setMonth(month ? null : new Date(new Date().getFullYear(), new Date().getMonth(), 1))
          }
        />
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="rounded-full" onClick={exportCSV} disabled={list.length === 0}>
            <FileDown size={15} className="mr-1.5" /> CSV
          </Button>
          <Button size="sm" className="rounded-full" onClick={() => { setEditing(null); setOpen(true); }}>
            <Plus size={15} className="mr-1" /> Add
          </Button>
        </div>
      </div>

      {/* Search and the two totals on one line: the totals describe exactly
          what the search has narrowed to. */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="relative flex-1 min-w-0">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <Input
            className="pl-10 pr-10 h-10 rounded-full bg-card border-hairline"
            placeholder="Search payee, description or category"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
              onClick={() => setQuery("")}
            >
              <X size={15} />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <TotalPill icon={ArrowDownLeft} label="In" value={monthTotal.inflow} currency={settings.currency} tone="income" />
          <TotalPill icon={ArrowUpRight} label="Out" value={monthTotal.outflow} currency={settings.currency} tone="expense" />
        </div>
      </div>

      {grouped.length === 0 ? (
        <Card>
          <EmptyState
            icon={Receipt}
            title={
              query ? `Nothing matches “${query}”`
                : month ? `No transactions in ${month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}`
                : "No transactions yet"
            }
            action={
              month && hasAnyOutsideMonth && !query ? (
                <Button variant="outline" size="sm" className="rounded-full" onClick={() => setMonth(null)}>
                  Show all time instead
                </Button>
              ) : !month || !hasAnyOutsideMonth ? (
                <Button size="sm" className="rounded-full" onClick={() => { setEditing(null); setOpen(true); }}>
                  <Plus size={15} className="mr-1" /> Add a transaction
                </Button>
              ) : undefined
            }
          >
            {!query && !hasAnyOutsideMonth && "Add one by hand, or import a bank statement from the Import page."}
          </EmptyState>
        </Card>
      ) : (
        <div className="space-y-4">
          {grouped.map(([date, items]) => {
            const dayTotal = items.reduce((sum, t) => {
              const c = catMap.get(t.categoryId);
              return sum + (c?.type === "income" ? Math.abs(t.amount) : -Math.abs(t.amount));
            }, 0);
            return (
              <div key={date}>
                {/* The day's own header, with its net — a date alone said less
                    than the space it took. */}
                <div className="flex items-baseline justify-between gap-3 px-1 mb-1.5">
                  <p className="text-xs font-medium text-muted-foreground">
                    {formatDate(date, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
                  </p>
                  <p className={cn("text-xs font-semibold tabular-nums", dayTotal >= 0 ? "text-income" : "text-muted-foreground")}>
                    <DiscreetText fallback="••">
                      {dayTotal >= 0 ? "+" : "−"}{formatMoney(Math.abs(dayTotal), settings.currency)}
                    </DiscreetText>
                  </p>
                </div>

                <Card flush className="divide-y divide-hairline overflow-hidden">
                  {items.map((t) => {
                    const c = catMap.get(t.categoryId);
                    const hide = settings.discreetMode || t.isVague;
                    const display = hide
                      ? t.displayDescription || c?.genericLabel || c?.name
                      : t.payee || t.description || c?.name;
                    const isIncome = c?.type === "income";
                    return (
                      <div key={t.id} className="group flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-secondary/40">
                        {/* A hidden row has no merchant to show, and a "?" tile
                            is worse than nothing — use its category instead. */}
                        {hide
                          ? <CategoryIcon type={c?.type ?? "expenses"} size="md" />
                          : <MerchantLogo payee={t.payee || c?.name || ""} size={38} />}

                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-[14px] truncate leading-tight">
                            <DiscreetText fallback={c?.genericLabel || c?.name}>{display}</DiscreetText>
                            {t.splitGroupId && (
                              <span className="ml-2 align-middle text-[9.5px] font-semibold tracking-wide uppercase text-muted-foreground bg-secondary rounded px-1.5 py-0.5">
                                Split
                              </span>
                            )}
                          </p>
                          {/* Below lg this line carries the category; from lg
                              up the category moves into its own column. */}
                          <p className="text-[11.5px] text-muted-foreground truncate mt-0.5 lg:hidden">
                            {c?.name} · {profileLabel(t.profile)}
                          </p>
                          <p className="text-[11.5px] text-muted-foreground truncate mt-0.5 hidden lg:block">
                            {profileLabel(t.profile)}
                          </p>
                        </div>

                        <div className="hidden lg:flex items-center gap-2 w-[11rem] flex-shrink-0 min-w-0">
                          <CategoryGlyph type={c?.type ?? "expenses"} size={14} />
                          <span className="text-[12.5px] text-muted-foreground truncate">{c?.name}</span>
                        </div>

                        {/* Amount and actions sit on one line: stacking the
                            icons under the figure squeezed them and broke the
                            row's baseline. The actions keep their space
                            reserved, so nothing shifts on hover. */}
                        <p className={cn(
                          "font-semibold tabular-nums text-[14px] text-right flex-shrink-0 w-[7.5rem]",
                          isIncome ? "text-income" : "text-foreground"
                        )}>
                          <DiscreetText fallback="••">
                            {isIncome ? "+" : "−"}
                            {formatMoney(Math.abs(t.amount), settings.currency)}
                          </DiscreetText>
                        </p>

                        <div className="flex gap-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                          <IconButton
                            className="w-8 h-8"
                            aria-label="Edit transaction"
                            onClick={() => { setEditing(t); setOpen(true); }}
                          >
                            <Pencil size={14} />
                          </IconButton>
                          <IconButton
                            className="w-8 h-8"
                            tone="danger"
                            aria-label="Delete transaction"
                            onClick={() => {
                              if (t.splitGroupId) {
                                if (confirm("Delete every part of this split transaction?")) deleteSplitGroup(t.splitGroupId);
                              } else if (confirm("Delete this transaction?")) {
                                deleteTransaction(t.id);
                              }
                            }}
                          >
                            <Trash2 size={14} />
                          </IconButton>
                        </div>
                      </div>
                    );
                  })}
                </Card>
              </div>
            );
          })}
        </div>
      )}

      <TransactionDialog open={open} onOpenChange={setOpen} editing={editing} />
    </div>
  );
}

/** In / Out for whatever the filters currently select. */
function TotalPill({
  icon: Icon, label, value, currency, tone,
}: {
  icon: typeof ArrowDownLeft;
  label: string;
  value: number;
  currency: string;
  tone: "income" | "expense";
}) {
  return (
    <div className="flex items-center gap-2 rounded-full bg-card border border-hairline shadow-sm pl-1.5 pr-3.5 py-1.5">
      <span className={cn(
        "inline-flex items-center justify-center w-7 h-7 rounded-full",
        tone === "income" ? "bg-income/10 text-income" : "bg-expense/10 text-expense"
      )}>
        <Icon size={14} />
      </span>
      <span className="min-w-0">
        <FieldLabel className="leading-none">{label}</FieldLabel>
        <span className="block text-[13px] font-semibold tabular-nums leading-tight mt-0.5">
          <DiscreetText fallback="••">{formatMoney(value, currency)}</DiscreetText>
        </span>
      </span>
    </div>
  );
}
