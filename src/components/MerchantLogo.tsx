import { brandTones, findMerchant } from "@/lib/merchants";
import { useMemo } from "react";
import { TrendingUp, ReceiptText, ShoppingBag, PiggyBank, CreditCard, type LucideIcon } from "lucide-react";
import { IconChip, toneText, type Tone } from "@/components/ui/surface";
import { cn } from "@/lib/utils";
import type { CategoryType } from "@/lib/types";

/**
 * The tile beside a payee.
 *
 * `size` is in pixels because callers sit in rows of different heights; the
 * radius and the type scale with it, so a 28px tile and a 40px tile are the
 * same object at two sizes rather than two different-looking things.
 */
export function MerchantLogo({
  payee,
  size = 36,
  className = "",
}: {
  payee: string;
  size?: number;
  className?: string;
}) {
  const merchant = useMemo(() => findMerchant(payee), [payee]);
  const pair = useMemo(() => (merchant ? brandTones(merchant.color) : null), [merchant]);

  const shell = cn(
    "flex-shrink-0 inline-flex items-center justify-center font-semibold select-none",
    "ring-1 ring-inset ring-foreground/[0.06]",
    className
  );
  const box = { width: size, height: size, borderRadius: Math.round(size * 0.32) };

  if (!merchant || !pair) {
    // No match: the initial on the app's own neutral, not a grey slug.
    const letter = (payee || "?").trim().charAt(0).toUpperCase() || "?";
    return (
      <span
        className={cn(shell, "bg-secondary text-muted-foreground")}
        style={{ ...box, fontSize: size * 0.4 }}
        aria-hidden
      >
        {letter}
      </span>
    );
  }

  const style = {
    ...box,
    ["--m-fg" as string]: pair.fgLight,
    ["--m-bg" as string]: pair.bgLight,
    ["--m-fg-dark" as string]: pair.fgDark,
    ["--m-bg-dark" as string]: pair.bgDark,
  } as React.CSSProperties;

  // A real brand mark wins over the monogram when one is defined.
  if (merchant.mark) {
    return (
      <span
        className={cn(shell, "bg-[color:var(--m-bg)] dark:bg-[color:var(--m-bg-dark)]")}
        style={style}
        title={merchant.label}
      >
        <svg
          width={size * 0.58}
          height={size * 0.58}
          viewBox="0 0 24 24"
          className="fill-[color:var(--m-fg)] dark:fill-[color:var(--m-fg-dark)]"
          aria-hidden="true"
        >
          <path d={merchant.mark} />
        </svg>
      </span>
    );
  }

  return (
    <span
      className={cn(
        shell,
        "bg-[color:var(--m-bg)] text-[color:var(--m-fg)]",
        "dark:bg-[color:var(--m-bg-dark)] dark:text-[color:var(--m-fg-dark)]"
      )}
      style={{
        ...style,
        fontSize: size * (merchant.abbrev.length > 2 ? 0.3 : 0.37),
        letterSpacing: "-0.02em",
      }}
      title={merchant.label}
    >
      {merchant.abbrev}
    </span>
  );
}

/**
 * The icon for a category type, in its own tinted chip.
 *
 * These were hand-drawn SVG paths with hardcoded hex colours — the "expenses"
 * glyph was a pair of crossed arrows that read as nothing, and none of the
 * colours came from the theme, so they stayed the same in dark mode. They are
 * now ordinary lucide icons on the app's semantic tones.
 */
export const CATEGORY_ICONS: Record<CategoryType, { icon: LucideIcon; tone: Tone }> = {
  income: { icon: TrendingUp, tone: "income" },
  bills: { icon: ReceiptText, tone: "bills" },
  expenses: { icon: ShoppingBag, tone: "expense" },
  savings: { icon: PiggyBank, tone: "savings" },
  debt: { icon: CreditCard, tone: "debt" },
};

export function CategoryIcon({
  type,
  size = "sm",
  className,
}: {
  type: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const info = CATEGORY_ICONS[type as CategoryType];
  if (!info) return null;
  return <IconChip icon={info.icon} tone={info.tone} size={size} className={className} />;
}

/** Just the glyph, for places that already provide their own container. */
export function CategoryGlyph({ type, size = 16, className }: { type: string; size?: number; className?: string }) {
  const info = CATEGORY_ICONS[type as CategoryType];
  if (!info) return null;
  const Icon = info.icon;
  return <Icon size={size} className={cn(toneText(info.tone), className)} />;
}
