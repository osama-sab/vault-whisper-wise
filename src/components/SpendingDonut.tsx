import { useMemo } from "react";
import { Cell, Label, Pie, PieChart } from "recharts";
import { PieChart as PieIcon } from "lucide-react";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import { Card, CardHead, EmptyState } from "@/components/ui/surface";
import { MAX_SLICES, slotAt } from "@/lib/chartPalette";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Category } from "@/lib/types";

export interface SpendSlice {
  id: string;
  name: string;
  value: number;
  category?: Category;
}

/**
 * Where this month's money went, as a share.
 *
 * A donut answers "what is the shape of my spending" in one look, which a
 * column of progress bars does not — you had to read fifteen rows and hold
 * them in your head. It is deliberately capped: the eight-slot palette is
 * validated only that far, and a pie with twenty slivers is unreadable
 * regardless of colour, so everything past the top slices folds into "Other".
 *
 * The legend is not decoration — it carries the name and the amount for every
 * slice, which is what lets the chart meet its contrast obligation in light
 * mode and what makes it usable for a colourblind reader.
 */
export default function SpendingDonut({
  slices, currency, title = "Where it went", hint,
}: {
  slices: SpendSlice[];
  currency: string;
  title?: string;
  hint?: string;
}) {
  const { data, config, total } = useMemo(() => {
    const sorted = [...slices].filter((s) => s.value > 0).sort((a, b) => b.value - a.value);
    const head = sorted.slice(0, MAX_SLICES);
    const tail = sorted.slice(MAX_SLICES);

    const rows = head.map((s, i) => ({
      key: `s${i}`,
      name: s.name,
      value: s.value,
      slot: slotAt(i),
    }));
    if (tail.length > 0) {
      rows.push({
        key: "other",
        name: `Other (${tail.length})`,
        value: tail.reduce((sum, s) => sum + s.value, 0),
        slot: slotAt(MAX_SLICES),
      });
    }

    const cfg: ChartConfig = {};
    for (const r of rows) cfg[r.key] = { label: r.name, theme: { light: r.slot.light, dark: r.slot.dark } };

    return { data: rows, config: cfg, total: rows.reduce((sum, r) => sum + r.value, 0) };
  }, [slices]);

  if (data.length === 0) {
    return (
      <Card className="h-full">
        <CardHead icon={PieIcon} title={title} hint={hint} />
        <EmptyState icon={PieIcon} title="Nothing spent yet this month">
          Once transactions land, this shows how the month divides up.
        </EmptyState>
      </Card>
    );
  }

  return (
    <Card className="h-full">
      <CardHead icon={PieIcon} title={title} hint={hint} />

      <div className="grid gap-4 sm:grid-cols-[minmax(0,168px)_minmax(0,1fr)] items-center">
        <ChartContainer config={config} className="aspect-square w-full max-w-[168px] mx-auto">
          <PieChart>
            <defs>
              {/* A soft vertical gradient per slice: the validated hue at the
                  top easing into the same hue a shade softer, so the ring
                  reads as a rounded object rather than flat paint. The legend
                  swatch stays the solid, validated colour. */}
              {data.map((d) => (
                <linearGradient key={d.key} id={`slice-${d.key}`} x1="0" y1="0" x2="0.4" y2="1">
                  <stop offset="0%" stopColor={`var(--color-${d.key})`} stopOpacity={1} />
                  <stop offset="100%" stopColor={`var(--color-${d.key})`} stopOpacity={0.72} />
                </linearGradient>
              ))}
            </defs>

            <ChartTooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0].payload as (typeof data)[number];
                return (
                  <div className="rounded-lg border border-hairline bg-popover px-2.5 py-1.5 text-xs shadow-raised">
                    <p className="font-medium">{p.name}</p>
                    <p className="text-muted-foreground tabular-nums">
                      {formatMoney(p.value, currency)} · {Math.round((p.value / total) * 100)}%
                    </p>
                  </div>
                );
              }}
            />

            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius="62%"
              outerRadius="96%"
              // Rounded ends and a gap of surface between neighbours: the two
              // things that stop a ring of segments reading as a hard wheel.
              cornerRadius={6}
              paddingAngle={2}
              strokeWidth={2}
              className="stroke-card"
              isAnimationActive={false}
            >
              {data.map((d) => (
                <Cell key={d.key} fill={`url(#slice-${d.key})`} />
              ))}
              <Label
                content={({ viewBox }) => {
                  if (!viewBox || !("cx" in viewBox)) return null;
                  const { cx, cy } = viewBox as { cx: number; cy: number };
                  return (
                    // stroke="none" is load-bearing: the <Pie> sets a 2px
                    // surface-coloured stroke to gap its segments, and these
                    // labels are inside it — inheriting it outlines every
                    // glyph in the card colour and eats the figure.
                    <g stroke="none">
                      <text
                        x={cx} y={cy - 5} textAnchor="middle" stroke="none"
                        className="fill-foreground text-[16px] font-bold tabular-nums"
                      >
                        {formatMoney(total, currency)}
                      </text>
                      <text
                        x={cx} y={cy + 13} textAnchor="middle" stroke="none"
                        className="fill-muted-foreground text-[10px] font-medium"
                      >
                        total out
                      </text>
                    </g>
                  );
                }}
              />
            </Pie>
          </PieChart>
        </ChartContainer>

        {/* The legend doubles as the table view: every slice named, with its
            amount and share in text. */}
        <ul className="space-y-1.5 min-w-0">
          {data.map((d) => (
            <li key={d.key} className="flex items-center gap-2 text-[12.5px] min-w-0">
              {/* The legend lives outside ChartContainer, so the --color-*
                  variables it emits are out of scope here. Both steps ride on
                  the element itself and the theme picks one, which keeps the
                  swatch correct with no JS and no first-paint flip. */}
              <span
                className={cn(
                  "w-2.5 h-2.5 rounded-[3px] flex-shrink-0",
                  "bg-[color:var(--sw)] dark:bg-[color:var(--sw-dark)]"
                )}
                style={{
                  ["--sw" as string]: d.slot.light,
                  ["--sw-dark" as string]: d.slot.dark,
                } as React.CSSProperties}
                aria-hidden
              />
              <span className="truncate flex-1 min-w-0">{d.name}</span>
              <span className="tabular-nums text-muted-foreground flex-shrink-0">
                {Math.round((d.value / total) * 100)}%
              </span>
              <span className="tabular-nums font-medium flex-shrink-0 w-[5.5rem] text-right">
                {formatMoney(d.value, currency)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}
