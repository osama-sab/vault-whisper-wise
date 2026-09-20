/**
 * The app's mark.
 *
 * What shipped before was `pwa-192.png` — a raster "M" with a trend arrow, in
 * a blue that belongs to no token in the palette, scaled down to 28px in the
 * sidebar where it was visibly soft. The mark is now a wallet drawn in vector,
 * on the app's own primary, so it stays crisp at any size and follows the
 * theme. `scripts/make-icons.py` draws the identical geometry for favicon.ico
 * and the PWA PNGs, so the window, the taskbar and the sidebar agree.
 */
export function BrandMark({ size = 34, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      role="img"
      aria-label="Pocket Money"
      className={className}
    >
      <defs>
        <linearGradient id="pm-mark" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="hsl(var(--primary-glow))" />
          <stop offset="100%" stopColor="hsl(var(--primary))" />
        </linearGradient>
      </defs>
      {/* The tile. A squircle-ish radius, matching the card radius scale. */}
      <rect x="0" y="0" width="48" height="48" rx="13" fill="url(#pm-mark)" />
      {/* Wallet body. */}
      <rect x="10" y="14" width="26" height="21" rx="6" fill="white" fillOpacity="0.96" />
      {/* The card slot, cut out of the body's right edge so the mark still
          reads as a wallet at 24px rather than a plain rounded box. */}
      <path
        d="M27 21h11a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H27a3.5 3.5 0 0 1 0-7Z"
        fill="hsl(var(--primary))"
        fillOpacity="0.92"
      />
      <circle cx="30.5" cy="24.5" r="1.9" fill="white" />
    </svg>
  );
}

/** Mark plus wordmark, for the sidebar head and the lock screen. */
export function BrandLockup({ className }: { className?: string }) {
  return (
    <span className={"flex items-center gap-2.5 min-w-0 " + (className ?? "")}>
      <BrandMark size={34} className="flex-shrink-0 rounded-[10px] shadow-sm" />
      <span className="min-w-0 leading-tight">
        <span className="block text-[15px] font-semibold tracking-tight truncate">Pocket Money</span>
        <span className="block text-[10px] text-muted-foreground tracking-wide truncate">Local &amp; encrypted</span>
      </span>
    </span>
  );
}
