import { useMemo, useState } from "react";
import { useApp } from "@/lib/store";
import { formatMoney } from "@/lib/format";
import { Wallet, TrendingUp, TrendingDown, PiggyBank, CreditCard, FileText, ChevronLeft, ChevronRight, Repeat, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DiscreetText } from "@/components/Discreet";
import { CategoryIcon, MerchantLogo } from "@/components/MerchantLogo";
import ExportDialog from "@/components/ExportDialog";

export default function Dashboard() {
  const { transactions, categories, subscriptions, settings } = useApp();
  const [month, setMonth] = useState(() => new Date());
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);

  const monthTx = useMemo(
    () =>
      transactions.filter((t) => {
        if (settings.activeProfile !== "combined" && t.profile !== settings.activeProfile) return false;
        const d = new Date(t.date);
        return d.getFullYear() === month.getFullYear() && d.getMonth() === month.getMonth();
      }),
    [transactions, month, settings.activeProfile]
  );

  const catMap = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  // Active subscriptions for current profile — always counted as committed outflow
  const activeSubs = useMemo(() => {
    return subscriptions.filter(
      (s) => s.active && (settings.activeProfile === "combined" || s.profile === settings.activeProfile)
    );
  }, [subscriptions, settings.activeProfile]);

  const subsTotal = useMemo(
    () => activeSubs.reduce((sum, s) => sum + s.expectedAmount, 0),
    [activeSubs]
  );

  const totals = useMemo(() => {
    const t = { income: 0, expenses: 0, bills: 0, savings: 0, debt: 0 };
    for (const tx of monthTx) {
      const c = catMap.get(tx.categoryId);
      if (!c) continue;
      t[c.type] = (t[c.type] || 0) + tx.amount;
    }
    return t;
  }, [monthTx, catMap]);

  const totalBudget = useMemo(() => {
    return categories
      .filter((c) => settings.activeProfile === "combined" || c.profileDefault === settings.activeProfile)
      .filter((c) => c.type !== "income")
      .reduce((s, c) => s + (c.monthlyBudget || 0), 0);
  }, [categories, settings.activeProfile]);

  // Actual logged spending plus all active subscription commitments
  const spent = totals.bills + totals.expenses + totals.savings + totals.debt;
  const committed = spent + subsTotal;
  const leftToSpend = totals.income - committed;
  const leftToBudget = totalBudget - committed;

  const byCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const tx of monthTx) map.set(tx.categoryId, (map.get(tx.categoryId) || 0) + tx.amount);
    // Add active subscription amounts to their categories
    for (const sub of activeSubs) {
      map.set(sub.categoryId, (map.get(sub.categoryId) || 0) + sub.expectedAmount);
    }
    return categories
      .map((c) => ({ c, spent: map.get(c.id) || 0 }))
      .filter(({ c, spent }) => spent !== 0 || (c.monthlyBudget > 0 && c.type !== "income"))
      .filter(({ c }) => settings.activeProfile === "combined" || c.profileDefault === settings.activeProfile);
  }, [monthTx, categories, activeSubs, settings.activeProfile]);

  const [exportOpen, setExportOpen] = useState(false);

  const profileLabel =
    settings.activeProfile === "combined" ? "Combined" : settings.activeProfile === "household" ? "Household" : "Personal";

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <button
          className="p-2 rounded-full bg-secondary"
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
          onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
        >
          <ChevronRight size={16} />
        </button>
      </div>

      <div className="rounded-2xl bg-gradient-to-br from-primary to-primary-glow p-5 text-primary-foreground shadow-lg">
        <p className="text-xs opacity-80 uppercase tracking-wide">Left to spend</p>
        <p className="text-3xl font-bold mt-1">
          <DiscreetText fallback="••••">{formatMoney(leftToSpend, settings.currency)}</DiscreetText>
        </p>
        <div className="flex justify-between mt-4 text-xs opacity-90">
          <div>
            <p className="opacity-70">Income</p>
            <p className="font-semibold">
              <DiscreetText fallback="••••">{formatMoney(totals.income, settings.currency)}</DiscreetText>
            </p>
          </div>
          <div>
            <p className="opacity-70">Spent</p>
            <p className="font-semibold">
              <DiscreetText fallback="••••">{formatMoney(committed, settings.currency)}</DiscreetText>
            </p>
          </div>
          <div>
            <p className="opacity-70">Left to budget</p>
            <p className="font-semibold">
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
        <SummaryCard icon={Repeat} label="Subscriptions" value={subsTotal} color="text-bills" currency={settings.currency} />
      </div>

      {subsTotal > 0 && (
        <div className="bg-card rounded-2xl border border-border p-3 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{formatMoney(subsTotal, settings.currency)}</span> in active subscriptions are deducted from "Left to spend" each month. Toggle them off on the Bills page if you cancel.
        </div>
      )}

      <div className="bg-card rounded-2xl border border-border p-4">
        <h2 className="font-semibold mb-3">Budgets</h2>
        {byCategory.length === 0 ? (
          <p className="text-sm text-muted-foreground">No activity this month yet.</p>
        ) : (
          <div className="space-y-3">
            {byCategory.map(({ c, spent }) => {
              const maxSpent = Math.max(...byCategory.map(x => Math.abs(x.spent)));
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
                  <div className="flex justify-between text-sm">
                    <span className="font-medium flex items-center gap-1.5">
                      <CategoryIcon type={c.type} size={16} />
                      {c.name}
                    </span>
                    <span className="text-muted-foreground">
                      <DiscreetText fallback="••">{formatMoney(Math.abs(spent), settings.currency)}</DiscreetText>
                      {hasBudget && (
                        <> / {formatMoney(c.monthlyBudget, settings.currency)}</>
                      )}
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-secondary overflow-hidden">
                    <div
                      className={
                        hasBudget && pct > 100
                          ? "h-full bg-destructive"
                          : hasBudget && pct > 80
                          ? "h-full bg-warning"
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

      {/* Category transaction filter */}
      {selectedCategoryId && (() => {
        const cat = categories.find(x => x.id === selectedCategoryId);
        const filtered = monthTx.filter(t => t.categoryId === selectedCategoryId).sort((a, b) => b.date.localeCompare(a.date));
        const catTotal = filtered.reduce((s, t) => s + t.amount, 0);
        return (
          <div className="bg-card rounded-2xl border border-primary/20 p-4 space-y-3">
            <div className="flex justify-between items-center">
              <h3 className="font-semibold text-sm flex items-center gap-1.5">
                <CategoryIcon type={cat?.type || "expenses"} size={16} />
                {cat?.name} — {filtered.length} transaction{filtered.length === 1 ? "" : "s"}
              </h3>
              <button onClick={() => setSelectedCategoryId(null)} className="text-xs text-muted-foreground hover:text-foreground">Close</button>
            </div>
            <p className="text-xs text-muted-foreground">
              Total: <span className="font-medium text-foreground">{formatMoney(catTotal, settings.currency)}</span>
              {cat?.monthlyBudget ? ` of ${formatMoney(cat.monthlyBudget, settings.currency)} budget` : ""}
            </p>
            {filtered.length === 0 ? (
              <p className="text-xs text-muted-foreground">No transactions in this category this month.</p>
            ) : (
              <div className="divide-y divide-border">
                {filtered.map(t => {
                  const isIncome = cat?.type === "income";
                  const display = settings.discreetMode || t.isVague
                    ? cat?.genericLabel || cat?.name || "—"
                    : t.payee || t.description || "—";
                  return (
                    <div key={t.id} className="flex items-center gap-2 py-2">
                      <MerchantLogo payee={settings.discreetMode ? "" : (t.payee || "")} size={28} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm truncate">{display}</p>
                        <p className="text-[11px] text-muted-foreground">{new Date(t.date).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</p>
                      </div>
                      <p className={"text-sm font-semibold " + (isIncome ? "text-income" : "text-foreground")}>
                        {isIncome ? "+" : "-"}{formatMoney(t.amount, settings.currency)}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}

      <Button
        variant="outline"
        className="w-full"
        onClick={() => setExportOpen(true)}
      >
        <Download size={16} className="mr-2" />
        Export report
      </Button>

      <ExportDialog open={exportOpen} onOpenChange={setExportOpen} currentMonth={month} />
    </div>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  color,
  currency,
}: {
  icon: any;
  label: string;
  value: number;
  color: string;
  currency: string;
}) {
  return (
    <div className="bg-card rounded-2xl border border-border p-3">
      <div className="flex items-center gap-2">
        <Icon size={16} className={color} />
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
      <p className="font-semibold mt-1">
        <DiscreetText fallback="••••">{formatMoney(Math.abs(value), currency)}</DiscreetText>
      </p>
    </div>
  );
}