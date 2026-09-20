import { Trophy, AlertTriangle } from "lucide-react";
import { Card, CardHead, EmptyState } from "@/components/ui/surface";
import { MerchantLogo, CategoryIcon } from "@/components/MerchantLogo";
import { ProfileTag } from "@/components/CategorySelect";
import { DiscreetText } from "@/components/Discreet";
import { formatMoney, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Category, Transaction } from "@/lib/types";

/**
 * Rankings, rather than another chart.
 *
 * "What were my five biggest expenses" and "which budgets am I over" are
 * ordinal questions with a handful of answers each — a sorted list answers
 * them faster and more precisely than any plot, and it stays readable when a
 * chart of the same data would be a row of near-identical bars.
 */

/** The rank badge. Gold for the top spot only; the rest stay quiet. */
function Rank({ n }: { n: number }) {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold tabular-nums flex-shrink-0",
        n === 1 ? "bg-warning/15 text-warning" : "bg-secondary text-muted-foreground"
      )}
    >
      {n}
    </span>
  );
}

export function TopExpenses({
  transactions, categories, currency, discreet, limit = 5,
}: {
  /** Already scoped to the month and profile by the caller. */
  transactions: Transaction[];
  categories: Category[];
  currency: string;
  discreet: boolean;
  limit?: number;
}) {
  const catMap = new Map(categories.map((c) => [c.id, c]));
  const rows = transactions
    .filter((t) => {
      const c = catMap.get(t.categoryId);
      return c && c.type !== "income";
    })
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
    .slice(0, limit);

  const biggest = rows.length > 0 ? Math.abs(rows[0].amount) : 0;

  return (
    <Card className="h-full">
      <CardHead
        icon={Trophy}
        tone="expense"
        title={`Top ${limit} expenses`}
        hint="Single largest payments this month"
      />
      {rows.length === 0 ? (
        <EmptyState icon={Trophy} title="No spending recorded this month" />
      ) : (
        <ol className="space-y-2.5">
          {rows.map((t, i) => {
            const c = catMap.get(t.categoryId);
            const hide = discreet || t.isVague;
            const label = hide
              ? t.displayDescription || c?.genericLabel || c?.name || "Hidden"
              : t.payee || t.description || c?.name || "—";
            const share = biggest > 0 ? (Math.abs(t.amount) / biggest) * 100 : 0;
            return (
              <li key={t.id} className="flex items-center gap-2.5 min-w-0">
                <Rank n={i + 1} />
                {hide
                  ? <CategoryIcon type={c?.type ?? "expenses"} size="sm" />
                  : <MerchantLogo payee={t.payee || c?.name || ""} size={30} />}
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium truncate leading-tight">{label}</p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {formatDate(t.date, { day: "numeric", month: "short" })} · {c?.name ?? "—"}
                  </p>
                  {/* A quiet bar relative to the biggest one: it turns the
                      list into a shape you can scan without reading numbers. */}
                  <div className="mt-1 h-1 rounded-full bg-secondary overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-expense/60 to-expense"
                      style={{ width: `${share}%` }}
                    />
                  </div>
                </div>
                <p className="text-[13px] font-semibold tabular-nums flex-shrink-0">
                  <DiscreetText fallback="••">{formatMoney(Math.abs(t.amount), currency)}</DiscreetText>
                </p>
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}

export interface BudgetBreach {
  category: Category;
  spent: number;
  budget: number;
  /** spent − budget, always positive here. */
  over: number;
  /** spent / budget as a percentage. */
  pct: number;
}

export function OverBudget({
  breaches, currency, limit = 5,
}: {
  breaches: BudgetBreach[];
  currency: string;
  limit?: number;
}) {
  const rows = breaches.slice(0, limit);

  return (
    <Card className="h-full">
      <CardHead
        icon={AlertTriangle}
        tone="bills"
        title="Over budget"
        hint={rows.length > 0 ? "Worst overspend first" : undefined}
      />
      {rows.length === 0 ? (
        <EmptyState icon={AlertTriangle} title="Nothing is over budget">
          Every category with a limit is still inside it this month.
        </EmptyState>
      ) : (
        <ol className="space-y-2.5">
          {rows.map((b, i) => (
            <li key={b.category.id} className="flex items-center gap-2.5 min-w-0">
              <Rank n={i + 1} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 min-w-0">
                  <p className="text-[13px] font-medium truncate leading-tight flex-1 min-w-0">
                    {b.category.name}
                  </p>
                  <ProfileTag profile={b.category.profileDefault} size="xs" />
                </div>
                <p className="text-[11px] text-muted-foreground tabular-nums mt-0.5">
                  {formatMoney(b.spent, currency)} of {formatMoney(b.budget, currency)}
                </p>
                {/* The bar is capped at full width and the overshoot is said
                    in words — a bar drawn past its own track is a lie about
                    the scale. */}
                <div className="mt-1 h-1.5 rounded-full bg-secondary overflow-hidden">
                  <div className="h-full rounded-full bg-gradient-to-r from-warning to-destructive" style={{ width: "100%" }} />
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-[13px] font-semibold tabular-nums text-destructive">
                  +{formatMoney(b.over, currency)}
                </p>
                <p className="text-[10.5px] text-muted-foreground tabular-nums">{Math.round(b.pct)}% used</p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
