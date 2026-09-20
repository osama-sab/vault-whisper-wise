import * as React from "react";
import { ChevronLeft, ChevronRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The app's visual primitives, in one place.
 *
 * Every page used to write its own `bg-card rounded-2xl border border-hairline
 * p-4` and its own header row, so radius, padding, title size and edge
 * treatment drifted apart screen by screen — and each page invented its own
 * month stepper, which is why one of them flung its arrows to opposite edges
 * of the window. These carry the decisions instead:
 *
 *  - a card is a raised white surface with a hairline, never an outlined box;
 *  - a card's header is always an icon chip, a title, and an optional action
 *    on the right — that repeated chip is the app's signature;
 *  - an icon never sits loose on a surface, it sits in a tint of its own tone;
 *  - numbers are large and tabular, labels small, muted and uppercase — that
 *    contrast is the hierarchy, rather than everything being one size;
 *  - controls that step or switch are pills, grouped in a tinted track.
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

/* ─── Surfaces ──────────────────────────────────────────────────────────── */

/** A raised panel. `flush` drops the padding for lists that draw their own. */
export const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { flush?: boolean; interactive?: boolean }
>(({ className, flush, interactive, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "bg-card rounded-card border border-hairline shadow-card",
      !flush && "p-5",
      interactive && "transition-shadow hover:shadow-raised",
      className
    )}
    {...props}
  />
));
Card.displayName = "Card";

/**
 * A card's header: chip, title, action.
 *
 * `tight` is for cards whose body starts immediately underneath (a list),
 * where the default gap would double up with the first row's own padding.
 */
export function CardHead({
  icon, tone = "primary", title, hint, action, className, tight,
}: {
  icon?: LucideIcon;
  tone?: Tone;
  title: React.ReactNode;
  hint?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  tight?: boolean;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-3", tight ? "mb-0" : "mb-4", className)}>
      <div className="flex items-center gap-2.5 min-w-0">
        {icon && <IconChip icon={icon} tone={tone} size="sm" />}
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold tracking-tight truncate leading-tight">{title}</h2>
          {hint && <p className="text-xs text-muted-foreground truncate mt-0.5">{hint}</p>}
        </div>
      </div>
      {action && <div className="flex-shrink-0 flex items-center gap-2">{action}</div>}
    </div>
  );
}

/** An icon in a tinted rounded square — never a bare glyph on the surface. */
export function IconChip({
  icon: Icon, tone = "primary", size = "md", className,
}: {
  icon: LucideIcon;
  tone?: Tone;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const box = { sm: "w-8 h-8 rounded-[10px]", md: "w-10 h-10 rounded-xl", lg: "w-12 h-12 rounded-2xl" }[size];
  const glyph = { sm: 16, md: 18, lg: 22 }[size];
  return (
    <span className={cn("inline-flex items-center justify-center flex-shrink-0", box, TONE_CHIP[tone], className)}>
      <Icon size={glyph} strokeWidth={2} />
    </span>
  );
}

/** A heading for a group of cards (not for a card's own header). */
export function SectionTitle({
  children, action, className,
}: { children: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-center justify-between gap-3 mb-3", className)}>
      <h2 className="text-[15px] font-semibold tracking-tight">{children}</h2>
      {action}
    </div>
  );
}

/** The small uppercase label above a figure. */
export function FieldLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={cn("text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground", className)}>
      {children}
    </p>
  );
}

/** Body copy capped at a comfortable measure, for explanatory paragraphs. */
export function Prose({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn("text-sm text-muted-foreground max-w-[64ch]", className)}>{children}</p>;
}

/** What a list says when it has nothing in it. */
export function EmptyState({
  icon: Icon, title, children, action,
}: { icon?: LucideIcon; title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="py-10 px-4 text-center">
      {Icon && (
        <span className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-secondary text-muted-foreground mb-3">
          <Icon size={22} strokeWidth={1.75} />
        </span>
      )}
      <p className="text-sm font-medium">{title}</p>
      {children && <p className="text-xs text-muted-foreground mt-1 max-w-[46ch] mx-auto">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/**
 * A quiet explanatory strip.
 *
 * These were previously a `<p>` given a card shadow and a 2xl radius, which
 * made a footnote look as important as the data above it.
 */
export function Note({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={cn("text-xs text-muted-foreground bg-secondary/60 rounded-xl px-3.5 py-2.5 leading-relaxed", className)}>
      {children}
    </p>
  );
}

/* ─── Figures ───────────────────────────────────────────────────────────── */

/**
 * Label, figure, and an icon chip. The figure is the point, so it gets the
 * size and the tabular figures; the label stays quiet beneath it.
 */
export function StatTile({
  label, value, icon, tone = "neutral", hint, badge, className,
}: {
  label: string;
  value: React.ReactNode;
  icon?: LucideIcon;
  tone?: Tone;
  hint?: React.ReactNode;
  badge?: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("p-4", className)}>
      <div className="flex items-center justify-between gap-2">
        {icon && <IconChip icon={icon} tone={tone} size="sm" />}
        {badge}
      </div>
      <p className="text-[21px] font-semibold tabular-nums tracking-tight mt-3 truncate leading-none">{value}</p>
      <FieldLabel className="mt-2">{label}</FieldLabel>
      {hint && <p className="text-[11px] text-muted-foreground mt-1 truncate">{hint}</p>}
    </Card>
  );
}

/** The small pill that sits beside a figure. */
export function Delta({ value, suffix = "", className }: { value: number; suffix?: string; className?: string }) {
  const up = value >= 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums",
        up ? "bg-income/10 text-income" : "bg-expense/10 text-expense",
        className
      )}
    >
      {up ? "↑" : "↓"}
      {Math.abs(value).toFixed(1)}%{suffix}
    </span>
  );
}

/* ─── Controls ──────────────────────────────────────────────────────────── */

/**
 * A pill switch: options in a tinted track, the active one raised out of it.
 *
 * The profile switch, the theme picker and the transactions scope were three
 * different-looking versions of this idea; they are now one.
 */
export function Segmented<T extends string>({
  options, value, onChange, size = "md", className, ariaLabel,
}: {
  options: {
    value: T;
    label: React.ReactNode;
    icon?: LucideIcon;
    /**
     * What the pill looks like while it is the selected one. Given per option
     * so a switch can take the colour of the thing being switched to — the
     * profile switch is blue on Household and violet on Personal, which says
     * which world you are in without reading the label.
     */
    activeClass?: string;
  }[];
  value: T;
  onChange: (v: T) => void;
  size?: "sm" | "md" | "lg";
  className?: string;
  ariaLabel?: string;
}) {
  const pad = { sm: "p-1", md: "p-1", lg: "p-1.5" }[size];
  const pill = {
    sm: "px-3 py-1 text-xs",
    md: "px-3.5 py-1.5 text-[13px]",
    lg: "px-5 py-2 text-[14px]",
  }[size];
  const glyph = { sm: 13, md: 14, lg: 16 }[size];

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn("inline-flex items-center gap-1 rounded-full bg-secondary", pad, className)}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            aria-pressed={active}
            className={cn(
              "inline-flex items-center justify-center gap-1.5 rounded-full font-medium transition-colors whitespace-nowrap",
              pill,
              active
                ? (o.activeClass ?? "bg-card text-foreground shadow-sm")
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {o.icon && <o.icon size={glyph} />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** A round icon-only button — the app's tertiary action. */
export const IconButton = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean; tone?: "default" | "danger" }
>(({ className, active, tone = "default", ...props }, ref) => (
  <button
    ref={ref}
    type="button"
    className={cn(
      "inline-flex items-center justify-center w-9 h-9 rounded-full transition-colors flex-shrink-0",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
      "disabled:opacity-40 disabled:pointer-events-none",
      active
        ? "bg-primary text-primary-foreground hover:bg-primary/90"
        : tone === "danger"
          ? "text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          : "text-muted-foreground hover:bg-secondary hover:text-foreground",
      className
    )}
    {...props}
  />
));
IconButton.displayName = "IconButton";

/**
 * A month as ONE control.
 *
 * Bills and Transactions each built their own out of `justify-between`, so on
 * a wide window the arrows ended up a thousand pixels apart with the month
 * stranded in the middle. Grouping them is the fix, and sharing the component
 * is what keeps it fixed.
 */
export function MonthStepper({
  month, onChange, label, className, onLabelClick,
}: {
  month: Date | null;
  onChange: (d: Date) => void;
  /** Overrides the formatted month, for an "All time" scope. */
  label?: React.ReactNode;
  className?: string;
  onLabelClick?: () => void;
}) {
  const step = (delta: number) => {
    if (!month) return;
    onChange(new Date(month.getFullYear(), month.getMonth() + delta, 1));
  };
  const text = label ?? month?.toLocaleDateString(undefined, { month: "long", year: "numeric" }) ?? "";

  return (
    <div className={cn("inline-flex items-center gap-0.5 rounded-full bg-secondary p-1", className)}>
      <button
        type="button"
        onClick={() => step(-1)}
        disabled={!month}
        aria-label="Previous month"
        className="inline-flex items-center justify-center w-7 h-7 rounded-full text-muted-foreground hover:bg-card hover:text-foreground hover:shadow-sm transition-all disabled:opacity-40 disabled:pointer-events-none"
      >
        <ChevronLeft size={16} />
      </button>
      {onLabelClick ? (
        <button
          type="button"
          onClick={onLabelClick}
          className="px-3 text-[13px] font-semibold tracking-tight min-w-[9.5rem] text-center rounded-full hover:text-primary transition-colors"
        >
          {text}
        </button>
      ) : (
        <span className="px-3 text-[13px] font-semibold tracking-tight min-w-[9.5rem] text-center">{text}</span>
      )}
      <button
        type="button"
        onClick={() => step(1)}
        disabled={!month}
        aria-label="Next month"
        className="inline-flex items-center justify-center w-7 h-7 rounded-full text-muted-foreground hover:bg-card hover:text-foreground hover:shadow-sm transition-all disabled:opacity-40 disabled:pointer-events-none"
      >
        <ChevronRight size={16} />
      </button>
    </div>
  );
}
