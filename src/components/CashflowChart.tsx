import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Activity, EyeOff } from "lucide-react";
import {
  ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent, type ChartConfig,
} from "@/components/ui/chart";
import { useApp } from "@/lib/store";
import { filterByProfile, reconcileMonth } from "@/lib/budget";
import { formatMoney, isInMonth, monthKey, isoFromDate } from "@/lib/format";
import { Card, CardHead, EmptyState, Segmented } from "@/components/ui/surface";
import type { TrendRange } from "@/lib/types";

/**
 * Money in against money out, over a span you choose.
 *
 * Series colours are NOT the app's income-green / expense-red. That pair fails
 * colour-vision separation badly (ΔE 4.8 for deuteranopia, against a floor of
 * 8), so the two would be indistinguishable for a red-green colourblind
 * reader. Teal and amber were stepped until all six palette checks passed, per
 * theme: light ΔE 13.7, dark ΔE 13.0.
 *
 * Bars rather than lines: at three months a line chart has two points and a
 * slope, which says nothing. Columns compare two quantities per period, which
 * is the actual question, and they read the same at 1, 3 or 12 buckets.
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

const RANGES: { value: TrendRange; label: string }[] = [
  { value: "1m", label: "1M" },
  { value: "3m", label: "3M" },
  { value: "12m", label: "12M" },
];

const MONTHS_FOR: Record<TrendRange, number> = { "1m": 1, "3m": 3, "12m": 12 };

interface Bucket {
  key: string;
  label: string;
  full: string;
  income: number;
  spending: number;
}

export default function CashflowChart({ endMonth }: { endMonth: Date }) {
  const { transactions, categories, subscriptions, settings, saveSettings } = useApp();
  const range: TrendRange = settings.trendRange ?? "12m";

  const data = useMemo<Bucket[]>(() => {
    const scopedTx = filterByProfile(transactions, settings.activeProfile);
    const scopedSubs = filterByProfile(subscriptions, settings.activeProfile);

    // One month is shown by WEEK, not as a single column. A lone pair of bars
    // is a stat tile with axes; weeks show the shape of the month, which is
    // what someone looking at "1M" wants.
    if (range === "1m") {
      const year = endMonth.getFullYear();
      const month = endMonth.getMonth();
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const monthTx = scopedTx.filter((t) => isInMonth(t.date, endMonth));
      const catMap = new Map(categories.map((c) => [c.id, c]));

      const weeks: Bucket[] = [];
      for (let start = 1; start <= daysInMonth; start += 7) {
        const end = Math.min(start + 6, daysInMonth);
        const from = isoFromDate(new Date(year, month, start));
        const to = isoFromDate(new Date(year, month, end));
        let income = 0;
        let spending = 0;
        for (const t of monthTx) {
          if (t.date < from || t.date > to) continue;
          const c = catMap.get(t.categoryId);
          if (!c) continue;
          if (c.type === "income") income += Math.abs(t.amount);
          else spending += Math.abs(t.amount);
        }
        weeks.push({
          key: `${monthKey(endMonth)}-w${start}`,
          label: `${start}–${end}`,
          full: `${start}–${end} ${endMonth.toLocaleDateString(undefined, { month: "long" })}`,
          income,
          spending,
        });
      }
      return weeks;
    }

    const months = MONTHS_FOR[range];
    return Array.from({ length: months }, (_, i) => {
      const month = new Date(endMonth.getFullYear(), endMonth.getMonth() - (months - 1 - i), 1);
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
  }, [transactions, categories, subscriptions, settings.activeProfile, endMonth, range]);

  const hasAny = data.some((d) => d.income > 0 || d.spending > 0);

  const rangePicker = (
    <Segmented
      ariaLabel="Trend range"
      size="sm"
      options={RANGES}
      value={range}
      onChange={(v) => saveSettings({ trendRange: v })}
    />
  );

  const title = range === "1m" ? "This month, week by week"
    : range === "3m" ? "Last 3 months"
    : "Last 12 months";

  if (!hasAny) {
    return (
      <Card className="h-full">
        <CardHead icon={Activity} title={title} action={rangePicker} />
        <EmptyState icon={Activity} title="Nothing recorded in this period">
          Add a transaction or import a statement and the trend appears here.
        </EmptyState>
      </Card>
    );
  }

  return (
    <Card className="h-full">
      <CardHead
        icon={Activity}
        title={title}
        hint={range === "1m" ? undefined : `${data[0].full} — ${data[data.length - 1].full}`}
        action={rangePicker}
      />

      {settings.discreetMode ? (
        // The height of the bars leaks relative amounts on its own, so
        // discreet mode replaces the chart rather than blurring it.
        <EmptyState icon={EyeOff} title="Hidden while discreet mode is on">
          Turn discreet mode off in the sidebar to see the trend again.
        </EmptyState>
      ) : (
        // A fixed height, not an aspect ratio. 16:7 of a wide desktop window is
        // over 600px tall, which pushed everything below the chart off-screen.
        <ChartContainer config={chartConfig} className="w-full aspect-auto h-[232px] xl:h-[262px]">
          <BarChart data={data} margin={{ left: 4, right: 8, top: 4, bottom: 0 }} barGap={2}>
            <defs>
              {(["income", "spending"] as const).map((k) => (
                <linearGradient key={k} id={`bar-${k}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={`var(--color-${k})`} stopOpacity={0.95} />
                  <stop offset="100%" stopColor={`var(--color-${k})`} stopOpacity={0.45} />
                </linearGradient>
              ))}
            </defs>
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
              cursor={{ fill: "hsl(var(--secondary) / 0.6)", radius: 8 }}
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
            {/* Rounded tops anchored to the baseline — a bar rounded at both
                ends floats off its own axis. Animation is off: the grow-in is
                decorative on a finance dashboard and it delays the read. */}
            <Bar
              dataKey="income" fill="url(#bar-income)" radius={[6, 6, 0, 0]}
              maxBarSize={26} isAnimationActive={false}
            />
            <Bar
              dataKey="spending" fill="url(#bar-spending)" radius={[6, 6, 0, 0]}
              maxBarSize={26} isAnimationActive={false}
            />
          </BarChart>
        </ChartContainer>
      )}
    </Card>
  );
}
