import { useMemo, useState } from "react";
import { useApp } from "@/lib/store";
import { formatMoney, formatDate, isInMonth } from "@/lib/format";
import { reconcileMonth, filterByProfile } from "@/lib/budget";
import { Wallet, TrendingUp, TrendingDown, PiggyBank, CreditCard, ChevronLeft, ChevronRight, Repeat, Download, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DiscreetText } from "@/components/Discreet";
import { CategoryIcon, MerchantLogo } from "@/components/MerchantLogo";
import ExportDialog from "@/components/ExportDialog";
import CashflowChart from "@/components/CashflowChart";

export default function Dashboard() {
  const { transactions, categories, subscriptions, settings, billPayments } = useApp();
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);

  // Month membership by yyyy-mm prefix — new Date("2026-04-01") parses as UTC
  // midnight and lands in the previous month west of UTC.
  const monthTx = useMemo(
    () => filterByProfile(transactions, settings.activeProfile).filter((t) => isInMonth(t.date, month)),
    [transactions, month, settings.activeProfile]
  );

  const catMap = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  const profileSubs = useMemo(
    () => filterByProfile(subscriptions, settings.activeProfile),
    [subscriptions, settings.activeProfile]
  );

  /**
   * One reconciliation for the month. A subscription only counts as an outflow
   * if no transaction has settled it — previously its expected amount was
   * added on top of the imported transaction, so every paid bill hit the
   * month's total twice.
   */
  const recon = useMemo(
    () => reconcileMonth(monthTx, categories, profileSubs, billPayments),
    [monthTx, categories, profileSubs, billPayments]
  );

  const totals = useMemo(() => {
    const t = { income: 0, expenses: 0, bills: 0, savings: 0, debt: 0 };
    for (const tx of monthTx) {
      const c = catMap.get(tx.categoryId);
      if (!c) continue;
      t[c.type] += Math.abs(tx.amount);
    }
    return t;
  }, [monthTx, catMap]);

  const totalBudget = useMemo(
    () => categories
      .filter((c) => settings.activeProfile === "combined" || c.profileDefault === settings.activeProfile)
      .filter((c) => c.type !== "income")
      .reduce((s, c) => s + (c.monthlyBudget || 0), 0),
    [categories, settings.activeProfile]
  );

  const committed = recon.debit + recon.stillExpected;
  const leftToSpend = recon.credit - committed;
  const leftToBudget = totalBudget - committed;

  const byCategory = useMemo(() => {
    const spendOf = (id: string) => {
      const e = recon.byCategory.get(id);
      return (e?.credit ?? 0) + (e?.debit ?? 0);
    };
    // Only subscriptions with nothing settling them are added on top.
    const owed = new Map<string, number>();
    for (const s of recon.outstanding) {
      owed.set(s.categoryId, (owed.get(s.categoryId) || 0) + s.expectedAmount);
    }
    return categories
      .filter((c) => settings.activeProfile === "combined" || c.profileDefault === settings.activeProfile)
      .map((c) => ({ c, spent: spendOf(c.id) + (owed.get(c.id) || 0), pending: owed.get(c.id) || 0 }))
      .filter(({ c, spent }) => spent !== 0 || (c.monthlyBudget > 0 && c.type !== "income"));
  }, [recon, categories, settings.activeProfile]);

  // Hoisted out of the render loop, where it was recomputed for every row.
  const maxSpent = useMemo(
    () => Math.max(0, ...byCategory.map((x) => Math.abs(x.spent))),
    [byCategory]
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <button
          className="p-2 rounded-full bg-secondary"
          aria-label="Previous month"
          onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
        >
          <ChevronLeft size={16} />
        </button>
        <div className="text-center">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Month</p>
          <p className="font-semibold text-lg">
            {month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
          </p>
        </div>
        <button
          className="p-2 rounded-full bg-secondary"
          aria-label="Next month"
          onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
        >
          <ChevronRight size={16} />
        </button>
      </div>

      <div className="rounded-2xl bg-gradient-to-br from-primary to-primary-glow p-5 text-primary-foreground shadow-lg">
        <p className="text-xs opacity-80 uppercase tracking-wide">Left to spend</p>
        <p className="text-3xl font-bold mt-1 tabular-nums">
          <DiscreetText fallback="••••">{formatMoney(leftToSpend, settings.currency)}</DiscreetText>
        </p>
        <div className="flex justify-between mt-4 text-xs opacity-90">
          <div>
            <p className="opacity-70">Income</p>
            <p className="font-semibold tabular-nums">
              <DiscreetText fallback="••••">{formatMoney(recon.credit, settings.currency)}</DiscreetText>
            </p>
          </div>
          <div>
            <p className="opacity-70">Spent</p>
            <p className="font-semibold tabular-nums">
              <DiscreetText fallback="••••">{formatMoney(committed, settings.currency)}</DiscreetText>
            </p>
          </div>
          <div>
            <p className="opacity-70">Left to budget</p>
            <p className="font-semibold tabular-nums">
              <DiscreetText fallback="••••">{formatMoney(leftToBudget, settings.currency)}</DiscreetText>
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <SummaryCard icon={TrendingUp} label="Income" value={totals.income} color="text-income" currency={settings.currency} />
        <SummaryCard icon={TrendingDown} label="Expenses" value={totals.expenses} color="text-expense" currency={settings.currency} />
        <SummaryCard icon={Wallet} label="Bills" value={totals.bills} color="text-bills" currency={settings.currency} />
        <SummaryCard icon={PiggyBank} label="Savings" value={totals.savings} color="text-savings" currency={settings.currency} />
        <SummaryCard icon={CreditCard} label="Debt" value={totals.debt} color="text-debt" currency={settings.currency} />
        <SummaryCard icon={Repeat} label="Bills still due" value={recon.stillExpected} color="text-bills" currency={settings.currency} />
      </div>

      {(recon.outstanding.length > 0 || recon.fulfilled.length > 0) && (
        <div className="bg-card rounded-2xl border border-border p-3 text-xs text-muted-foreground">
          {recon.fulfilled.length > 0 && (
            <span>
              <span className="font-medium text-success">{recon.fulfilled.length} of {profileSubs.filter((s) => s.active).length}</span>{" "}
              subscriptions already paid this month.{" "}
            </span>
          )}
          {recon.outstanding.length > 0 ? (
            <span>
              <span className="font-medium text-foreground">{formatMoney(recon.stillExpected, settings.currency)}</span>{" "}
              still expected for {recon.outstanding.map((s) => s.name).join(", ")}.
            </span>
          ) : (
            <span>Nothing further is expected.</span>
          )}
        </div>
      )}

      <CashflowChart endMonth={month} />

      <div className="bg-card rounded-2xl border border-border p-4">
        <h2 className="font-semibold mb-3">Budgets</h2>
        {byCategory.length === 0 ? (
          <p className="text-sm text-muted-foreground">No activity this month yet.</p>
        ) : (
          <div className="space-y-3">
            {byCategory.map(({ c, spent, pending }) => {
              const hasBudget = c.monthlyBudget > 0;
              const pct = hasBudget
                ? Math.min(120, (Math.abs(spent) / c.monthlyBudget) * 100)
                : maxSpent > 0 ? (Math.abs(spent) / maxSpent) * 100 : 0;
              const isSelected = selectedCategoryId === c.id;
              return (
                <button
                  key={c.id}
                  onClick={() => setSelectedCategoryId(isSelected ? null : c.id)}
                  className={"w-full text-left rounded-xl p-2 -mx-2 transition-colors " + (isSelected ? "bg-primary/5 ring-1 ring-primary/20" : "hover:bg-secondary/50")}
                >
                  <div className="flex justify-between text-sm gap-2">
                    <span className="font-medium flex items-center gap-1.5 min-w-0">
                      <CategoryIcon type={c.type} size={16} />
                      <span className="truncate">{c.name}</span>
                      {pending > 0 && <span className="text-[10px] text-muted-foreground flex-shrink-0">· {formatMoney(pending, settings.currency)} due</span>}
                    </span>
                    <span className="text-muted-foreground tabular-nums flex-shrink-0">
                      <DiscreetText fallback="••">{formatMoney(Math.abs(spent), settings.currency)}</DiscreetText>
                      {hasBudget && <> / {formatMoney(c.monthlyBudget, settings.currency)}</>}
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-secondary overflow-hidden">
                    <div
                      className={
                        hasBudget && pct > 100 ? "h-full bg-destructive"
                          : hasBudget && pct > 80 ? "h-full bg-warning"
                          : "h-full bg-primary"
                      }
                      style={{ width: `${Math.min(100, pct)}%` }}
                    />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {selectedCategoryId && (() => {
        const cat = categories.find((x) => x.id === selectedCategoryId);
        const filtered = monthTx.filter((t) => t.categoryId === selectedCategoryId).sort((a, b) => b.date.localeCompare(a.date));
        const catTotal = filtered.reduce((s, t) => s + Math.abs(t.amount), 0);
        const isIncome = cat?.type === "income";
        return (
          <div className="bg-card rounded-2xl border border-primary/20 p-4 space-y-3">
            <div className="flex justify-between items-center gap-2">
              <h3 className="font-semibold text-sm flex items-center gap-1.5 min-w-0">
                <CategoryIcon type={cat?.type || "expenses"} size={16} />
                <span className="truncate">{cat?.name}</span>
                <span className="text-muted-foreground font-normal flex-shrink-0">
                  — {filtered.length} transaction{filtered.length === 1 ? "" : "s"}
                </span>
              </h3>
              <button onClick={() => setSelectedCategoryId(null)} className="text-xs text-muted-foreground hover:text-foreground flex-shrink-0">Close</button>
            </div>
            <p className="text-xs text-muted-foreground">
              Total: <span className="font-medium text-foreground tabular-nums">{formatMoney(catTotal, settings.currency)}</span>
              {cat?.monthlyBudget ? ` of ${formatMoney(cat.monthlyBudget, settings.currency)} budget` : ""}
            </p>
            {filtered.length === 0 ? (
              <p className="text-xs text-muted-foreground">No transactions in this category this month.</p>
            ) : (
              <div className="divide-y divide-border">
                {filtered.map((t) => {
                  const hide = settings.discreetMode || t.isVague;
                  const display = hide
                    ? t.displayDescription || cat?.genericLabel || cat?.name || "—"
                    : t.payee || t.description || "—";
                  return (
                    <div key={t.id} className="flex items-center gap-2 py-2">
                      <MerchantLogo payee={hide ? "" : (t.payee || "")} size={28} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm truncate">{display}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {formatDate(t.date, { day: "numeric", month: "short" })}
                        </p>
                      </div>
                      <p className={"text-sm font-semibold tabular-nums " + (isIncome ? "text-income" : "text-foreground")}>
                        {isIncome ? "+" : "−"}{formatMoney(Math.abs(t.amount), settings.currency)}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}

      <Button variant="outline" className="w-full" onClick={() => setExportOpen(true)}>
        <Download size={16} className="mr-2" />
        Export report
      </Button>

      <ExportDialog open={exportOpen} onOpenChange={setExportOpen} currentMonth={month} />
    </div>
  );
}

function SummaryCard({
  icon: Icon, label, value, color, currency,
}: {
  icon: LucideIcon;
  label: string; value: number; color: string; currency: string;
}) {
  return (
    <div className="bg-card rounded-2xl border border-border p-3">
      <div className="flex items-center gap-2">
        <Icon size={16} className={color} />
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
      <p className="font-semibold mt-1 tabular-nums">
        <DiscreetText fallback="••••">{formatMoney(Math.abs(value), currency)}</DiscreetText>
      </p>
    </div>
  );
}
