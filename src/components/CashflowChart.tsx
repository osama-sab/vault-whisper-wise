import { useMemo } from "react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent, type ChartConfig } from "@/components/ui/chart";
import { useApp } from "@/lib/store";
import { filterByProfile, reconcileMonth } from "@/lib/budget";
import { formatMoney, isInMonth, monthKey } from "@/lib/format";

/**
 * Twelve months of money in against money out.
 *
 * This is the only view in the app with any history in it — every other screen
 * is a single month — so it is deliberately a trend and not another breakdown
 * of the current month, which the Budgets meters below already cover.
 *
 * Series colours are NOT the app's income-green / expense-red. That pair fails
 * colour-vision separation badly (ΔE 4.8 for deuteranopia, against a floor of
 * 8), so the two lines would be indistinguishable for a red-green colourblind
 * reader. Teal and amber were stepped until all six palette checks passed, per
 * theme: light ΔE 13.7, dark ΔE 13.0.
 */
const chartConfig = {
  income: {
    label: "Money in",
    theme: { light: "#0E9384", dark: "#1BA898" },
  },
  spending: {
    label: "Money out",
    theme: { light: "#C2600F", dark: "#CE7F32" },
  },
} satisfies ChartConfig;

const MONTHS_SHOWN = 12;

export default function CashflowChart({ endMonth }: { endMonth: Date }) {
  const { transactions, categories, subscriptions, settings } = useApp();

  const data = useMemo(() => {
    const scopedTx = filterByProfile(transactions, settings.activeProfile);
    const scopedSubs = filterByProfile(subscriptions, settings.activeProfile);

    return Array.from({ length: MONTHS_SHOWN }, (_, i) => {
      const month = new Date(endMonth.getFullYear(), endMonth.getMonth() - (MONTHS_SHOWN - 1 - i), 1);
      const monthTx = scopedTx.filter((t) => isInMonth(t.date, month));
      const recon = reconcileMonth(monthTx, categories, scopedSubs);
      return {
        key: monthKey(month),
        label: month.toLocaleDateString(undefined, { month: "short" }),
        full: month.toLocaleDateString(undefined, { month: "long", year: "numeric" }),
        income: recon.credit,
        spending: recon.debit,
      };
    });
  }, [transactions, categories, subscriptions, settings.activeProfile, endMonth]);

  const hasAny = data.some((d) => d.income > 0 || d.spending > 0);

  if (!hasAny) {
    return (
      <div className="bg-card rounded-2xl border border-border p-4">
        <h2 className="font-semibold mb-1">Last 12 months</h2>
        <p className="text-sm text-muted-foreground">
          Nothing recorded yet. Add a transaction or import a statement and the trend appears here.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-2xl border border-border p-4">
      <div className="flex items-baseline justify-between gap-2 mb-3">
        <h2 className="font-semibold">Last 12 months</h2>
        <p className="text-xs text-muted-foreground">
          {data[0].full} — {data[data.length - 1].full}
        </p>
      </div>

      {settings.discreetMode ? (
        // The shape of the lines leaks relative amounts on its own, so discreet
        // mode replaces the chart rather than blurring it.
        <p className="text-sm text-muted-foreground py-10 text-center">
          Hidden while discreet mode is on.
        </p>
      ) : (
        // A fixed height, not an aspect ratio. 16:7 of a wide desktop window is
        // over 600px tall, which pushed everything below the chart off-screen.
        // Twelve months of two series needs height for legibility, not area.
        <ChartContainer config={chartConfig} className="w-full aspect-auto h-[240px] sm:h-[280px] xl:h-[320px]">
          <LineChart data={data} margin={{ left: 4, right: 12, top: 4, bottom: 0 }}>
            {/* Recessive grid: horizontal only, so it guides the eye without competing. */}
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={52}
              tickMargin={4}
              tickFormatter={(v: number) =>
                // Compact, so the axis never grows wider than the plot.
                new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(v)
              }
            />
            <ChartTooltip
              cursor={{ strokeDasharray: "3 3" }}
              content={
                <ChartTooltipContent
                  labelFormatter={(_, payload) => payload?.[0]?.payload?.full ?? ""}
                  formatter={(value, name) => (
                    <span className="flex w-full justify-between gap-4">
                      <span className="text-muted-foreground">{chartConfig[name as keyof typeof chartConfig]?.label}</span>
                      <span className="font-medium tabular-nums">{formatMoney(Number(value), settings.currency)}</span>
                    </span>
                  )}
                />
              }
            />
            <ChartLegend content={<ChartLegendContent />} />
            {/* 2px strokes, 8px active markers, per the mark spec. Animation is
                off: the draw-in is decorative on a finance dashboard, it makes
                the chart render instantly, and it avoids motion for readers who
                do not want it. */}
            <Line
              dataKey="income" type="monotone" stroke="var(--color-income)" strokeWidth={2}
              dot={false} activeDot={{ r: 4 }} isAnimationActive={false}
            />
            <Line
              dataKey="spending" type="monotone" stroke="var(--color-spending)" strokeWidth={2}
              dot={false} activeDot={{ r: 4 }} isAnimationActive={false}
            />
          </LineChart>
        </ChartContainer>
      )}
    </div>
  );
}
