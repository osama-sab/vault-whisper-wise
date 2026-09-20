import { useMemo, useState } from "react";
import { useApp } from "@/lib/store";
import { formatMoney, formatDate, isInMonth } from "@/lib/format";
import { reconcileMonth, filterByProfile } from "@/lib/budget";
import {
  Wallet, TrendingUp, TrendingDown, PiggyBank, CreditCard, Repeat, Download,
  Target, X, SlidersHorizontal, ChevronDown, type LucideIcon,
} from "lucide-react";
import { DiscreetText } from "@/components/Discreet";
import { CategoryIcon, CategoryGlyph, MerchantLogo } from "@/components/MerchantLogo";
import ExportDialog from "@/components/ExportDialog";
import CashflowChart from "@/components/CashflowChart";
import SpendingDonut, { type SpendSlice } from "@/components/SpendingDonut";
import { TopExpenses, OverBudget, type BudgetBreach } from "@/components/Rankings";
import { ProfileTag } from "@/components/CategorySelect";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import {
  Card, CardHead, StatTile, MonthStepper, IconButton, EmptyState, type Tone,
} from "@/components/ui/surface";
import { cn } from "@/lib/utils";
import { DASHBOARD_PANELS, panelsOf, type DashboardPanel } from "@/lib/types";

/** What each panel is called where the user chooses it. */
const PANEL_LABEL: Record<DashboardPanel, { title: string; hint: string }> = {
  summary: { title: "Summary tiles", hint: "Income, expenses, bills, savings, debt" },
  trend: { title: "Money in vs out", hint: "The 1 / 3 / 12-month trend" },
  categories: { title: "Where it went", hint: "This month's spending as a share" },
  top: { title: "Top 5 expenses", hint: "The largest single payments" },
  overbudget: { title: "Over budget", hint: "Categories past their limit" },
  budgets: { title: "All budgets", hint: "Every category with its progress" },
};

export default function Dashboard() {
  const { transactions, categories, subscriptions, settings, billPayments, saveSettings } = useApp();
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [showAllBudgets, setShowAllBudgets] = useState(false);

  const visible = panelsOf(settings);
  const shows = (p: DashboardPanel) => visible.includes(p);

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
  /** How much of what came in is already spoken for. */
  const usedPct = recon.credit > 0 ? Math.min(100, (committed / recon.credit) * 100) : 0;

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

  /** Money actually spent, per category — what the donut divides up. */
  const slices = useMemo<SpendSlice[]>(
    () => byCategory
      .filter(({ c }) => c.type !== "income")
      .map(({ c, spent }) => ({ id: c.id, name: c.name, value: Math.abs(spent), category: c }))
      .filter((s) => s.value > 0),
    [byCategory]
  );

  /** Budgets broken, worst overspend first. */
  const breaches = useMemo<BudgetBreach[]>(
    () => byCategory
      .filter(({ c, spent }) => c.type !== "income" && c.monthlyBudget > 0 && Math.abs(spent) > c.monthlyBudget)
      .map(({ c, spent }) => ({
        category: c,
        spent: Math.abs(spent),
        budget: c.monthlyBudget,
        over: Math.abs(spent) - c.monthlyBudget,
        pct: (Math.abs(spent) / c.monthlyBudget) * 100,
      }))
      .sort((a, b) => b.over - a.over),
    [byCategory]
  );

  // Hoisted out of the render loop, where it was recomputed for every row.
  const maxSpent = useMemo(
    () => Math.max(0, ...byCategory.map((x) => Math.abs(x.spent))),
    [byCategory]
  );

  const selected = selectedCategoryId ? categories.find((x) => x.id === selectedCategoryId) : null;

  /** The budgets list is long; show the busiest and let it expand. */
  const BUDGET_PREVIEW = 6;
  const budgetRows = useMemo(
    () => [...byCategory].sort((a, b) => Math.abs(b.spent) - Math.abs(a.spent)),
    [byCategory]
  );
  const shownBudgets = showAllBudgets ? budgetRows : budgetRows.slice(0, BUDGET_PREVIEW);

  function togglePanel(panel: DashboardPanel, on: boolean) {
    const next = on ? [...visible, panel] : visible.filter((p) => p !== panel);
    // Stored in canonical order so the layout never depends on click order.
    saveSettings({ dashboardPanels: DASHBOARD_PANELS.filter((p) => next.includes(p)) });
  }

  return (
    <div className="space-y-4">
      {/* The page's own toolbar: the scope on the left, what the page can do
          on the right. */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <MonthStepper month={month} onChange={setMonth} />
        <div className="flex items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <button className="inline-flex items-center gap-2 rounded-full bg-secondary px-3.5 py-2 text-[13px] font-medium text-secondary-foreground hover:bg-accent transition-colors">
                <SlidersHorizontal size={15} />
                Customise
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-[19rem] p-2">
              <p className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                Panels on this page
              </p>
              <div className="space-y-0.5">
                {DASHBOARD_PANELS.map((p) => (
                  <label
                    key={p}
                    className="flex items-start gap-3 rounded-lg px-2 py-2 hover:bg-secondary/60 cursor-pointer"
                  >
                    <Switch
                      checked={shows(p)}
                      onCheckedChange={(v) => togglePanel(p, v)}
                      aria-label={PANEL_LABEL[p].title}
                      className="mt-0.5 flex-shrink-0"
                    />
                    <span className="min-w-0">
                      <span className="block text-[13px] font-medium leading-tight">{PANEL_LABEL[p].title}</span>
                      <span className="block text-[11px] text-muted-foreground">{PANEL_LABEL[p].hint}</span>
                    </span>
                  </label>
                ))}
              </div>
            </PopoverContent>
          </Popover>

          <button
            onClick={() => setExportOpen(true)}
            className="inline-flex items-center gap-2 rounded-full bg-foreground text-background px-4 py-2 text-[13px] font-medium hover:opacity-90 transition-opacity"
          >
            <Download size={15} />
            Export report
          </button>
        </div>
      </div>

      {/*
        The balance card answers the one question the page exists for, so it
        takes the accent fill and the largest type; the trend sits beside it
        rather than below, which is what the width is for.
      */}
      <div className={cn("grid gap-4 items-stretch", shows("trend") && "xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]")}>
        <div className="hero-surface relative overflow-hidden rounded-card px-6 py-5 shadow-raised flex flex-col">
          {/* A soft highlight, so a large flat fill does not read as a slab. */}
          <div aria-hidden className="pointer-events-none absolute -right-16 -top-24 h-64 w-64 rounded-full bg-white/10 blur-2xl" />
          <div className="relative flex flex-col h-full">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center justify-center w-8 h-8 rounded-[10px] bg-white/20">
                <Wallet size={16} />
              </span>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] opacity-85">Left to spend</p>
            </div>

            <div className="flex-1 flex flex-col justify-center py-4">
              <p className="text-[2.75rem] leading-none font-semibold tabular-nums tracking-tight">
                <DiscreetText fallback="••••">{formatMoney(leftToSpend, settings.currency)}</DiscreetText>
              </p>

              {/* One bar for "how much of this month's income is spoken for" —
                  the figure above is a number, this is the shape of it. */}
              <div className="mt-5 h-1.5 rounded-full bg-white/25 overflow-hidden">
                <div className="h-full rounded-full bg-white/90" style={{ width: `${usedPct}%` }} />
              </div>
              <p className="text-[11px] opacity-85 mt-1.5">
                {recon.credit > 0
                  ? `${Math.round(usedPct)}% of this month's income is committed`
                  : "No income recorded for this month yet"}
              </p>
            </div>

            {/* Three related figures kept together: justify-between flung them
                to opposite edges of a wide window and they stopped reading as
                a set. */}
            <div className="pt-3.5 grid grid-cols-3 gap-4 border-t border-white/25">
              {([
                ["Income", recon.credit],
                ["Spent", committed],
                ["To budget", leftToBudget],
              ] as const).map(([label, amount]) => (
                <div key={label} className="min-w-0">
                  <p className="text-[10px] uppercase tracking-[0.1em] opacity-70 truncate">{label}</p>
                  <p className="font-semibold tabular-nums mt-0.5 truncate">
                    <DiscreetText fallback="••••">{formatMoney(amount, settings.currency)}</DiscreetText>
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {shows("trend") && <CashflowChart endMonth={month} />}
      </div>

      {shows("summary") && (
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
          <SummaryCard icon={TrendingUp} label="Income" value={totals.income} tone="income" currency={settings.currency} />
          <SummaryCard icon={TrendingDown} label="Expenses" value={totals.expenses} tone="expense" currency={settings.currency} />
          <SummaryCard icon={Wallet} label="Bills" value={totals.bills} tone="bills" currency={settings.currency} />
          <SummaryCard icon={PiggyBank} label="Savings" value={totals.savings} tone="savings" currency={settings.currency} />
          <SummaryCard icon={CreditCard} label="Debt" value={totals.debt} tone="debt" currency={settings.currency} />
          <SummaryCard icon={Repeat} label="Still due" value={recon.stillExpected} tone="bills" currency={settings.currency} />
        </div>
      )}

      {(recon.outstanding.length > 0 || recon.fulfilled.length > 0) && (
        <Card className="py-3 px-4 flex items-start gap-3">
          <CategoryIcon type="bills" size="sm" />
          <p className="text-xs text-muted-foreground leading-relaxed min-w-0">
            {recon.fulfilled.length > 0 && (
              <span>
                <span className="font-semibold text-success">
                  {recon.fulfilled.length} of {profileSubs.filter((s) => s.active).length}
                </span>{" "}
                subscriptions already paid this month.{" "}
              </span>
            )}
            {recon.outstanding.length > 0 ? (
              <span>
                <span className="font-semibold text-foreground">{formatMoney(recon.stillExpected, settings.currency)}</span>{" "}
                still expected for {recon.outstanding.map((s) => s.name).join(", ")}.
              </span>
            ) : (
              <span>Nothing further is expected.</span>
            )}
          </p>
        </Card>
      )}

      {/* The share and the ranking answer different halves of "where did it
          go", so they sit side by side. */}
      {(shows("categories") || shows("top")) && (
        <div className={cn("grid gap-4 items-stretch", shows("categories") && shows("top") && "xl:grid-cols-2")}>
          {shows("categories") && (
            <SpendingDonut
              slices={slices}
              currency={settings.currency}
              hint={month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
            />
          )}
          {shows("top") && (
            <TopExpenses
              transactions={monthTx}
              categories={categories}
              currency={settings.currency}
              discreet={settings.discreetMode}
            />
          )}
        </div>
      )}

      {shows("overbudget") && <OverBudget breaches={breaches} currency={settings.currency} />}

      {/* Budgets, and the drill-down they open, side by side on a wide window
          instead of the detail card pushing everything below the fold. */}
      {(shows("budgets") || selected) && (
        <div className={cn("grid gap-4 items-start", selected && shows("budgets") && "xl:grid-cols-2")}>
          {shows("budgets") && (
            <Card>
              <CardHead
                icon={Target}
                title="Budgets"
                hint={byCategory.length > 0 ? `${byCategory.length} categories this month` : undefined}
              />
              {byCategory.length === 0 ? (
                <EmptyState icon={Target} title="No activity this month yet">
                  Add a transaction or import a statement and the categories fill in here.
                </EmptyState>
              ) : (
                <>
                  <div className={cn("grid gap-x-6 gap-y-1", selected ? "grid-cols-1" : "xl:grid-cols-2")}>
                    {shownBudgets.map(({ c, spent, pending }) => {
                      const hasBudget = c.monthlyBudget > 0;
                      const pct = hasBudget
                        ? Math.min(120, (Math.abs(spent) / c.monthlyBudget) * 100)
                        : maxSpent > 0 ? (Math.abs(spent) / maxSpent) * 100 : 0;
                      const isSelected = selectedCategoryId === c.id;
                      return (
                        <button
                          key={c.id}
                          onClick={() => setSelectedCategoryId(isSelected ? null : c.id)}
                          className={cn(
                            "w-full text-left rounded-xl px-2.5 py-2 transition-colors",
                            isSelected ? "bg-primary/[0.07] ring-1 ring-primary/20" : "hover:bg-secondary/60"
                          )}
                        >
                          <div className="flex justify-between text-[13px] gap-2">
                            <span className="font-medium flex items-center gap-2 min-w-0">
                              <CategoryGlyph type={c.type} size={15} />
                              <span className="truncate">{c.name}</span>
                              {pending > 0 && (
                                <span className="text-[10px] text-bills bg-bills/10 rounded-full px-1.5 py-0.5 flex-shrink-0">
                                  {formatMoney(pending, settings.currency)} due
                                </span>
                              )}
                            </span>
                            <span className="text-muted-foreground tabular-nums flex-shrink-0">
                              <DiscreetText fallback="••">{formatMoney(Math.abs(spent), settings.currency)}</DiscreetText>
                              {hasBudget && <> / {formatMoney(c.monthlyBudget, settings.currency)}</>}
                            </span>
                          </div>
                          <div className="mt-1.5 h-1.5 rounded-full bg-secondary overflow-hidden">
                            <div
                              className={cn(
                                "h-full rounded-full transition-[width]",
                                hasBudget && pct > 100 ? "bg-gradient-to-r from-warning to-destructive"
                                  : hasBudget && pct > 80 ? "bg-gradient-to-r from-warning/70 to-warning"
                                  : "bg-gradient-to-r from-primary/70 to-primary"
                              )}
                              style={{ width: `${Math.min(100, pct)}%` }}
                            />
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {budgetRows.length > BUDGET_PREVIEW && (
                    <button
                      onClick={() => setShowAllBudgets((v) => !v)}
                      className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
                    >
                      <ChevronDown size={14} className={cn("transition-transform", showAllBudgets && "rotate-180")} />
                      {showAllBudgets ? "Show fewer" : `Show all ${budgetRows.length} categories`}
                    </button>
                  )}
                </>
              )}
            </Card>
          )}

          {selected && (() => {
            const filtered = monthTx
              .filter((t) => t.categoryId === selected.id)
              .sort((a, b) => b.date.localeCompare(a.date));
            const catTotal = filtered.reduce((s, t) => s + Math.abs(t.amount), 0);
            const isIncome = selected.type === "income";
            return (
              <Card className="ring-1 ring-primary/15">
                <CardHead
                  title={
                    <span className="flex items-center gap-2 min-w-0">
                      <span className="truncate">{selected.name}</span>
                      <ProfileTag profile={selected.profileDefault} size="xs" />
                    </span>
                  }
                  hint={
                    <>
                      {filtered.length} transaction{filtered.length === 1 ? "" : "s"} ·{" "}
                      <span className="tabular-nums font-medium text-foreground">
                        {formatMoney(catTotal, settings.currency)}
                      </span>
                      {selected.monthlyBudget ? ` of ${formatMoney(selected.monthlyBudget, settings.currency)}` : ""}
                    </>
                  }
                  action={
                    <IconButton onClick={() => setSelectedCategoryId(null)} aria-label="Close category detail">
                      <X size={16} />
                    </IconButton>
                  }
                />
                {filtered.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No transactions in this category this month.</p>
                ) : (
                  <div className="divide-y divide-hairline -my-1.5 max-h-[22rem] overflow-y-auto">
                    {filtered.map((t) => {
                      const hide = settings.discreetMode || t.isVague;
                      const display = hide
                        ? t.displayDescription || selected.genericLabel || selected.name || "—"
                        : t.payee || t.description || "—";
                      return (
                        <div key={t.id} className="flex items-center gap-2.5 py-2.5">
                          <MerchantLogo payee={hide ? "" : (t.payee || "")} size={30} />
                          <div className="flex-1 min-w-0">
                            <p className="text-[13px] truncate">{display}</p>
                            <p className="text-[11px] text-muted-foreground">
                              {formatDate(t.date, { day: "numeric", month: "short" })}
                            </p>
                          </div>
                          <p className={cn("text-[13px] font-semibold tabular-nums", isIncome ? "text-income" : "text-foreground")}>
                            {isIncome ? "+" : "−"}{formatMoney(Math.abs(t.amount), settings.currency)}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>
            );
          })()}
        </div>
      )}

      {visible.length === 0 && (
        <Card>
          <EmptyState icon={SlidersHorizontal} title="Every panel is switched off">
            Use “Customise” above to bring the ones you want back.
          </EmptyState>
        </Card>
      )}

      <ExportDialog open={exportOpen} onOpenChange={setExportOpen} currentMonth={month} />
    </div>
  );
}

function SummaryCard({
  icon, label, value, tone, currency,
}: {
  icon: LucideIcon;
  label: string; value: number; tone: Tone; currency: string;
}) {
  return (
    <StatTile
      icon={icon}
      tone={tone}
      label={label}
      value={<DiscreetText fallback="••••">{formatMoney(Math.abs(value), currency)}</DiscreetText>}
    />
  );
}
