import { useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import {
  LayoutDashboard, Receipt, CalendarDays, Upload, Settings as SettingsIcon,
  Eye, EyeOff, Sun, Moon, ShieldCheck, type LucideIcon,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";
import { BrandMark } from "@/components/BrandMark";
import { IconButton, Segmented } from "@/components/ui/surface";
import type { ProfileFilter } from "@/lib/types";

type Tab = {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
};

/**
 * The nav in groups rather than one undifferentiated run of five.
 *
 * Five items in a flat list give no sense of where the app's weight is;
 * grouping says "this is the money, this is the plumbing" before the labels
 * are even read.
 */
const GROUPS: { label: string; tabs: Tab[] }[] = [
  {
    label: "Overview",
    tabs: [
      { to: "/", label: "Home", icon: LayoutDashboard, end: true },
    ],
  },
  {
    label: "Money",
    tabs: [
      { to: "/transactions", label: "Transactions", icon: Receipt },
      { to: "/bills", label: "Bills", icon: CalendarDays },
      { to: "/import", label: "Import", icon: Upload },
    ],
  },
  {
    label: "General",
    tabs: [
      { to: "/settings", label: "Settings", icon: SettingsIcon },
    ],
  },
];

const TABS = GROUPS.flatMap((g) => g.tabs);

/**
 * The switch takes the colour of the profile it is switched to.
 *
 * Household is blue and Personal violet everywhere else in the app — on
 * category rows, in dropdown groups, on import rows — so the control that
 * chooses between them says which world you are in without being read.
 * Combined is the app's own primary, because it is not one of the two.
 *
 * The foreground flips by theme: the dark steps of these hues are light, so
 * white text on them would not hold up.
 */
const PROFILES: { value: ProfileFilter; label: string; activeClass: string }[] = [
  { value: "household", label: "Household", activeClass: "bg-household text-white dark:text-background shadow-sm" },
  { value: "personal", label: "Personal", activeClass: "bg-personal text-white dark:text-background shadow-sm" },
  { value: "combined", label: "Combined", activeClass: "bg-primary text-primary-foreground shadow-sm" },
];

/** Pages where the profile switch does nothing, so it should not be offered. */
const HIDE_PROFILE_ON = ["/settings", "/import"];

/**
 * Two layouts from one tree.
 *
 * Below `lg` the app keeps its phone shape: header on top, tab bar pinned to
 * the bottom. From `lg` up it is a desktop window — a white rail and a white
 * header panel floating on the tinted ground, which is the shape the app is
 * actually used in. Everything is driven by CSS breakpoints rather than a JS
 * width listener, so there is no resize handler to get wrong.
 *
 * The content column is capped at `max-w-shell`. Before, rows ran the full
 * width of the window: on a wide display a subscription's name sat half a
 * screen away from its amount and the eye could not carry the line.
 */
export default function AppShell() {
  const { settings, setActiveProfile, toggleDiscreet, subscriptions } = useApp();
  const location = useLocation();

  const showProfile = !HIDE_PROFILE_ON.some((p) => location.pathname.startsWith(p));

  const { resolvedTheme, setTheme } = useTheme();
  // The resolved theme is unknown until after mount, so the icon would
  // otherwise flip on the first paint.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isDark = mounted && resolvedTheme === "dark";

  /** A live count beside Bills, so the rail carries information, not just links. */
  const activeSubs = useMemo(
    () => subscriptions.filter(
      (s) => s.active && (settings.activeProfile === "combined" || s.profile === settings.activeProfile)
    ).length,
    [subscriptions, settings.activeProfile]
  );
  const badgeFor = (to: string) => (to === "/bills" && activeSubs > 0 ? activeSubs : null);

  const themeButton = (
    <IconButton
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Light mode" : "Dark mode"}
    >
      {isDark ? <Sun size={17} /> : <Moon size={17} />}
    </IconButton>
  );

  const discreetButton = (
    <IconButton
      onClick={toggleDiscreet}
      active={settings.discreetMode}
      aria-label="Toggle discreet mode"
      title={settings.discreetMode ? "Show amounts" : "Hide amounts"}
    >
      {settings.discreetMode ? <EyeOff size={17} /> : <Eye size={17} />}
    </IconButton>
  );

  return (
    <div className="min-h-screen bg-ground lg:flex lg:gap-3 lg:p-3">
      {/* ── Desktop rail ─────────────────────────────── */}
      <aside className="hidden lg:flex lg:flex-col w-[236px] xl:w-[252px] flex-shrink-0 rounded-panel bg-card border border-hairline shadow-card sticky top-3 h-[calc(100vh-1.5rem)]">
        <div className="px-4 pt-4 pb-3 flex items-center gap-2.5 min-w-0">
          <BrandMark size={34} className="flex-shrink-0" />
          <span className="min-w-0 leading-tight">
            <span className="block text-[15px] font-semibold tracking-tight truncate">Pocket Money</span>
            <span className="block text-[10px] text-muted-foreground truncate">Offline budget tracker</span>
          </span>
        </div>

        <nav className="flex-1 px-3 pb-2 overflow-y-auto space-y-4">
          {GROUPS.map((group) => (
            <div key={group.label}>
              <p className="eyebrow px-2.5 mb-1.5">{group.label}</p>
              <div className="space-y-0.5">
                {group.tabs.map((t) => {
                  const badge = badgeFor(t.to);
                  return (
                    <NavLink
                      key={t.to}
                      to={t.to}
                      end={t.end}
                      className={({ isActive }) =>
                        cn(
                          // The current section is a solid pill, not a tint:
                          // a tint on its own reads as a hover state.
                          "flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-[13.5px] font-medium transition-colors",
                          isActive
                            ? "bg-primary text-primary-foreground shadow-sm"
                            : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                        )
                      }
                    >
                      {({ isActive }) => (
                        <>
                          <t.icon size={17} className="flex-shrink-0" strokeWidth={2} />
                          <span className="truncate flex-1">{t.label}</span>
                          {badge != null && (
                            <span
                              className={cn(
                                "text-[10px] font-semibold tabular-nums rounded-full px-1.5 py-0.5 flex-shrink-0",
                                isActive ? "bg-primary-foreground/20" : "bg-secondary text-muted-foreground"
                              )}
                            >
                              {badge}
                            </span>
                          )}
                        </>
                      )}
                    </NavLink>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* The app's whole premise, stated where a template would put an upsell. */}
        <div className="px-3 pb-3 space-y-2">
          <div className="rounded-xl bg-primary-soft/70 px-3 py-2.5">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold text-accent-foreground">
              <ShieldCheck size={13} /> Local &amp; encrypted
            </p>
            <p className="text-[10.5px] text-muted-foreground mt-0.5 leading-snug">
              Nothing leaves this computer. Your vault is encrypted on disk.
            </p>
          </div>
          <div className="flex items-center gap-1 pt-1 border-t border-hairline">
            {themeButton}
            {discreetButton}
            <span className="text-[10.5px] text-muted-foreground ml-1 truncate">
              {settings.discreetMode ? "Amounts hidden" : "Amounts shown"}
            </span>
          </div>
        </div>
      </aside>

      {/* ── Main column ──────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Below lg there is no rail, so the brand and the two toggles need a
            home. From lg up the rail carries both and this is not rendered —
            a bar restating the page name is something the nav already says. */}
        <header className="lg:hidden sticky top-0 z-30 bg-card/90 backdrop-blur-md border-b border-hairline safe-top">
          <div className="px-4 py-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <BrandMark size={30} className="flex-shrink-0" />
              <span className="text-[15px] font-semibold tracking-tight truncate">Pocket Money</span>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              {themeButton}
              {discreetButton}
            </div>
          </div>
        </header>

        {/* pb-24 clears the fixed tab bar, which only exists below lg. */}
        <main className="flex-1 w-full px-4 lg:px-6 pt-4 lg:pt-5 pb-24 lg:pb-6">
          <div className="mx-auto w-full max-w-shell">
            {/* The one control that changes what every page below it means,
                centred and on its own line rather than tucked into a corner. */}
            {showProfile && (
              <div className="flex justify-center mb-4 lg:mb-5">
                <Segmented
                  ariaLabel="Profile"
                  options={PROFILES}
                  value={settings.activeProfile}
                  onChange={setActiveProfile}
                  size="lg"
                  className="max-w-full overflow-x-auto"
                />
              </div>
            )}

            <div key={location.pathname} className="animate-rise">
              <Outlet />
            </div>
          </div>
        </main>
      </div>

      {/* ── Narrow-screen tab bar ────────────────────── */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-card/95 backdrop-blur border-t border-hairline safe-bottom">
        <div className="max-w-2xl mx-auto grid grid-cols-5">
          {TABS.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.end}
              className={({ isActive }) =>
                cn(
                  "flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium transition-colors",
                  isActive ? "text-primary" : "text-muted-foreground"
                )
              }
            >
              <t.icon size={19} />
              <span>{t.label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
