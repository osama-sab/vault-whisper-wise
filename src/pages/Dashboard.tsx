import { useMemo, useState } from "react";
import { useApp } from "@/lib/store";
import { formatMoney } from "@/lib/format";
import { Wallet, TrendingUp, TrendingDown, PiggyBank, CreditCard, FileText, ChevronLeft, ChevronRight } from "lucide-react";
import { generateMonthPDF } from "@/lib/pdf";
import { Button } from "@/components/ui/button";
import { DiscreetText } from "@/components/Discreet";

export default function Dashboard() {
  const { transactions, categories, settings } = useApp();
  const [month, setMonth] = useState(() => new Date());

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

  const committed = totals.bills + totals.expenses + totals.savings + totals.debt;
  const leftToSpend = totals.income - committed;
  const leftToBudget = totalBudget - committed;

  const byCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const tx of monthTx) map.set(tx.categoryId, (map.get(tx.categoryId) || 0) + tx.amount);
    return categories
      .map((c) => ({ c, spent: map.get(c.id) || 0 }))
      .filter(({ c, spent }) => spent !== 0 || (c.monthlyBudget > 0 && c.type !== "income"))
      .filter(({ c }) => settings.activeProfile === "combined" || c.profileDefault === settings.activeProfile);
  }, [monthTx, categories, settings.activeProfile]);

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
      </div>

      <div className="bg-card rounded-2xl border border-border p-4">
        <h2 className="font-semibold mb-3">Budgets</h2>
        {byCategory.length === 0 ? (
          <p className="text-sm text-muted-foreground">No activity this month yet.</p>
        ) : (
          <div className="space-y-3">
            {byCategory.map(({ c, spent }) => {
              const pct = c.monthlyBudget > 0 ? Math.min(100, (Math.abs(spent) / c.monthlyBudget) * 100) : 0;
              return (
                <div key={c.id}>
                  <div className="flex justify-between text-sm">
                    <span className="font-medium">{c.name}</span>
                    <span className="text-muted-foreground">
                      <DiscreetText fallback="••">{formatMoney(Math.abs(spent), settings.currency)}</DiscreetText>
                      {c.monthlyBudget > 0 && (
                        <> / {formatMoney(c.monthlyBudget, settings.currency)}</>
                      )}
                    </span>
                  </div>
                  {c.monthlyBudget > 0 && (
                    <div className="mt-1 h-1.5 rounded-full bg-secondary overflow-hidden">
                      <div
                        className={
                          pct > 100
                            ? "h-full bg-destructive"
                            : pct > 80
                            ? "h-full bg-warning"
                            : "h-full bg-primary"
                        }
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Button
        variant="outline"
        className="w-full"
        onClick={() =>
          generateMonthPDF({
            month,
            transactions: monthTx,
            categories,
            discreet: settings.discreetMode,
            profileLabel,
            currency: settings.currency,
          })
        }
      >
        <FileText size={16} className="mr-2" />
        Export monthly PDF
      </Button>
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