import { findMerchant, type MerchantInfo } from "@/lib/merchants";
import { useMemo } from "react";

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
        className={`flex-shrink-0 rounded-full flex items-center justify-center font-bold text-white ${className}`}
        style={{
          width: size,
          height: size,
          fontSize: size * 0.4,
          backgroundColor: "#94a3b8",
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
        className={`flex-shrink-0 rounded-full flex items-center justify-center ${className}`}
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
      className={`flex-shrink-0 rounded-full flex items-center justify-center font-bold ${className}`}
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

/** Renders an SVG icon for a CategoryType */
export function CategoryIcon({
  type,
  size = 18,
  className = "",
}: {
  type: string;
  size?: number;
  className?: string;
}) {
  const info = CATEGORY_ICON_MAP[type];
  if (!info) return null;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={info.color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d={info.path} />
    </svg>
  );
}

const CATEGORY_ICON_MAP: Record<string, { path: string; color: string }> = {
  income: {
    path: "M12 20V4m0 0l-6 6m6-6l6 6",
    color: "#10B981",
  },
  bills: {
    path: "M9 7h6M9 11h6M9 15h4M5 3h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2z",
    color: "#8B5CF6",
  },
  expenses: {
    path: "M21 4H3M21 4l-3-3m3 3l-3 3M3 20h18M3 20l3-3m-3 3l3 3M12 8v8m0-8l-3 3m3-3l3 3",
    color: "#EF4444",
  },
  savings: {
    path: "M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0H5m14 0h2m-16 0H3M12 8a3 3 0 100 6 3 3 0 000-6z",
    color: "#0EA5E9",
  },
  debt: {
    path: "M12 2a10 10 0 100 20 10 10 0 000-20zm1 5h-2v6h2zm0 8h-2v2h2z",
    color: "#F59E0B",
  },
};
