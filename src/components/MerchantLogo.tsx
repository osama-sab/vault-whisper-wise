import { findMerchant, type MerchantInfo } from "@/lib/merchants";
import { useMemo } from "react";
import { TrendingUp, ReceiptText, ShoppingBag, PiggyBank, CreditCard, type LucideIcon } from "lucide-react";
import { IconChip, toneText, type Tone } from "@/components/ui/surface";
import { cn } from "@/lib/utils";
import type { CategoryType } from "@/lib/types";

/** Renders a small brand-colored circle with the merchant's abbreviation */
export function MerchantLogo({
  payee,
  size = 32,
  className = "",
}: {
  payee: string;
  size?: number;
  className?: string;
}) {
  const merchant = useMemo(() => findMerchant(payee), [payee]);

  if (!merchant) {
    // Fallback: generic gray circle with first letter
    const letter = (payee || "?").charAt(0).toUpperCase();
    return (
      <div
        className={`flex-shrink-0 rounded-xl flex items-center justify-center font-semibold text-white ${className}`}
        style={{
          width: size,
          height: size,
          fontSize: size * 0.4,
          backgroundColor: "hsl(var(--muted-foreground))",
        }}
      >
        {letter}
      </div>
    );
  }

  // A real brand mark wins over the monogram when one is defined.
  if (merchant.mark) {
    return (
      <div
        className={`flex-shrink-0 rounded-xl flex items-center justify-center ${className}`}
        style={{ width: size, height: size, backgroundColor: `${merchant.color}1A` }}
        title={merchant.label}
      >
        <svg width={size * 0.62} height={size * 0.62} viewBox="0 0 24 24" fill={merchant.color} aria-hidden="true">
          <path d={merchant.mark} />
        </svg>
      </div>
    );
  }

  // Determine text color (white or black based on brand color brightness)
  const textColor = isLight(merchant.color) ? "#000" : "#fff";

  return (
    <div
      className={`flex-shrink-0 rounded-xl flex items-center justify-center font-semibold ${className}`}
      style={{
        width: size,
        height: size,
        fontSize: size * (merchant.abbrev.length > 2 ? 0.3 : 0.38),
        backgroundColor: merchant.color,
        color: textColor,
        letterSpacing: "-0.02em",
      }}
      title={merchant.label}
    >
      {merchant.abbrev}
    </div>
  );
}

/** Check if a hex color is "light" (needs dark text) */
function isLight(hex: string): boolean {
  const c = hex.replace("#", "");
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 150;
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
