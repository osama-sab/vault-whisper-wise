import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The app's visual primitives, in one place.
 *
 * Every page previously wrote its own `bg-card rounded-2xl border border-border
 * p-4`, so radius, padding and edge treatment drifted apart screen by screen.
 * These carry the decisions instead:
 *
 *  - surfaces are raised with a soft shadow and a hairline, not outlined with a
 *    1px border, which is what made the old cards read as boxes;
 *  - an icon always sits in a tinted chip of its own colour, never loose;
 *  - numbers are large and tabular, labels small and muted — that contrast is
 *    the hierarchy, rather than everything being 14px.
 */

/** The semantic families the app already colours by. */
export type Tone = "primary" | "income" | "expense" | "bills" | "savings" | "debt" | "neutral";

const TONE_CHIP: Record<Tone, string> = {
  primary: "bg-primary/10 text-primary",
  income: "bg-income/10 text-income",
  expense: "bg-expense/10 text-expense",
  bills: "bg-bills/10 text-bills",
  savings: "bg-savings/10 text-savings",
  debt: "bg-debt/10 text-debt",
  neutral: "bg-secondary text-muted-foreground",
};

const TONE_TEXT: Record<Tone, string> = {
  primary: "text-primary",
  income: "text-income",
  expense: "text-expense",
  bills: "text-bills",
  savings: "text-savings",
  debt: "text-debt",
  neutral: "text-foreground",
};

export const toneText = (tone: Tone) => TONE_TEXT[tone];

/** A raised panel. `flush` drops the padding for lists that draw their own. */
export const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { flush?: boolean; interactive?: boolean }
>(({ className, flush, interactive, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "bg-card rounded-2xl border border-hairline shadow-card",
      !flush && "p-5",
      interactive && "transition-shadow hover:shadow-raised",
      className
    )}
    {...props}
  />
));
Card.displayName = "Card";

/** An icon in a tinted rounded square — never a bare glyph on the surface. */
export function IconChip({
  icon: Icon, tone = "primary", size = "md", className,
}: {
  icon: LucideIcon;
  tone?: Tone;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const box = { sm: "w-7 h-7 rounded-lg", md: "w-9 h-9 rounded-xl", lg: "w-11 h-11 rounded-xl" }[size];
  const glyph = { sm: 14, md: 17, lg: 20 }[size];
  return (
    <span className={cn("inline-flex items-center justify-center flex-shrink-0", box, TONE_CHIP[tone], className)}>
      <Icon size={glyph} strokeWidth={2} />
    </span>
  );
}

/** A heading for a group of cards. */
export function SectionTitle({
  children, action, className,
}: { children: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-center justify-between gap-3 mb-3", className)}>
      <h2 className="text-base font-semibold tracking-tight">{children}</h2>
      {action}
    </div>
  );
}

/** The small uppercase label above a figure. */
export function FieldLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={cn("text-[11px] font-medium uppercase tracking-wider text-muted-foreground", className)}>
      {children}
    </p>
  );
}

/**
 * Label, figure, and an icon chip. The figure is the point, so it gets the
 * size and the tabular figures; the label stays quiet above it.
 */
export function StatTile({
  label, value, icon, tone = "neutral", hint, className,
}: {
  label: string;
  value: React.ReactNode;
  icon?: LucideIcon;
  tone?: Tone;
  hint?: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("flex items-start gap-3", className)}>
      {icon && <IconChip icon={icon} tone={tone} />}
      <div className="min-w-0 flex-1">
        <FieldLabel>{label}</FieldLabel>
        <p className="text-xl font-semibold tabular-nums tracking-tight mt-1 truncate">{value}</p>
        {hint && <p className="text-xs text-muted-foreground mt-0.5 truncate">{hint}</p>}
      </div>
    </Card>
  );
}

/** Body copy capped at a comfortable measure, for explanatory paragraphs. */
export function Prose({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn("text-sm text-muted-foreground max-w-[68ch]", className)}>{children}</p>;
}
