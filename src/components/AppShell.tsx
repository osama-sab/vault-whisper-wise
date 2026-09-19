import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { LayoutDashboard, Receipt, Calendar, Upload, Settings as SettingsIcon, Eye, EyeOff, Sun, Moon } from "lucide-react";
import { useTheme } from "next-themes";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";
import type { ProfileFilter } from "@/lib/types";

const tabs = [
  { to: "/", label: "Home", icon: LayoutDashboard, end: true },
  { to: "/transactions", label: "Transactions", icon: Receipt },
  { to: "/bills", label: "Bills", icon: Calendar },
  { to: "/import", label: "Import", icon: Upload },
  { to: "/settings", label: "Settings", icon: SettingsIcon },
];

const profiles: { value: ProfileFilter; label: string }[] = [
  { value: "household", label: "Household" },
  { value: "personal", label: "Personal" },
  { value: "combined", label: "Combined" },
];

// Pages where the profile toggle bar should be hidden
const hideProfileBarPaths = ["/settings", "/import"];

/**
 * Two layouts from one tree.
 *
 * Below `lg` the app keeps its phone shape: header on top, tab bar pinned to
 * the bottom. From `lg` up it becomes a desktop window — a vertical nav rail
 * down the side, which is what the horizontal space was being wasted on.
 * Everything is driven by CSS breakpoints rather than a JS width listener, so
 * there is no resize handler to get wrong and no flash of the wrong layout.
 */
export default function AppShell() {
  const { settings, setActiveProfile, toggleDiscreet } = useApp();
  const location = useLocation();
  const showProfileBar = !hideProfileBarPaths.some((p) => location.pathname.startsWith(p));

  const { resolvedTheme, setTheme } = useTheme();
  // The resolved theme is unknown until after mount, so the icon would
  // otherwise flip on the first paint.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isDark = resolvedTheme === "dark";

  const iconButton = "p-2 rounded-full transition-colors bg-secondary text-secondary-foreground hover:bg-accent";

  const themeButton = (
    <button
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Light mode" : "Dark mode"}
      className={iconButton}
    >
      {mounted && isDark ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );

  const discreetButton = (
    <button
      onClick={toggleDiscreet}
      aria-label="Toggle discreet mode"
      title={settings.discreetMode ? "Show amounts" : "Hide amounts"}
      className={cn(
        "p-2 rounded-full transition-colors",
        settings.discreetMode
          ? "bg-primary text-primary-foreground"
          : "bg-secondary text-secondary-foreground hover:bg-accent"
      )}
    >
      {settings.discreetMode ? <EyeOff size={18} /> : <Eye size={18} />}
    </button>
  );

  const profileBar = (
    <div className="flex gap-1.5" role="group" aria-label="Profile">
      {profiles.map((p) => (
        <button
          key={p.value}
          onClick={() => setActiveProfile(p.value)}
          aria-pressed={settings.activeProfile === p.value}
          className={cn(
            "flex-1 lg:flex-none lg:px-4 px-3 py-1.5 text-xs font-medium rounded-full transition-colors whitespace-nowrap",
            settings.activeProfile === p.value
              ? "bg-primary text-primary-foreground"
              : "bg-secondary text-secondary-foreground hover:bg-accent"
          )}
        >
          {p.label}
        </button>
      ))}
    </div>
  );

  return (
    <div className="min-h-screen flex bg-background">
      {/* ── Desktop rail ─────────────────────────────── */}
      <aside className="hidden lg:flex lg:flex-col w-56 xl:w-60 flex-shrink-0 border-r border-border bg-card/40 sticky top-0 h-screen">
        <div className="flex items-center gap-2 px-4 h-16 flex-shrink-0">
          <img src="./pwa-192.png" alt="" className="w-7 h-7" />
          <h1 className="text-base font-semibold tracking-tight text-primary truncate">Pocket Money</h1>
        </div>

        <nav className="flex-1 px-3 space-y-1 overflow-y-auto">
          {tabs.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.end}
              className={({ isActive }) =>
                cn(
                  // The accent bar is what marks the current section; the tint
                  // behind it is secondary. A tint alone reads as a hover.
                  "relative flex items-center gap-3 rounded-xl pl-4 pr-3 py-2.5 text-sm font-medium transition-colors",
                  "before:absolute before:left-0 before:top-1/2 before:-translate-y-1/2 before:w-1 before:rounded-full before:transition-all",
                  isActive
                    ? "bg-primary/10 text-primary before:h-5 before:bg-primary"
                    : "text-muted-foreground hover:bg-secondary/70 hover:text-foreground before:h-0"
                )
              }
            >
              <t.icon size={18} className="flex-shrink-0" />
              <span className="truncate">{t.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="flex items-center gap-1.5 px-3 py-3 border-t border-border flex-shrink-0">
          {themeButton}
          {discreetButton}
        </div>
      </aside>

      {/* ── Main column ──────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-30 bg-card/90 backdrop-blur border-b border-border safe-top">
          {/* Narrow: brand + actions. Wide: the rail already has both. */}
          <div className="lg:hidden px-4 py-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <img src="./pwa-192.png" alt="" className="w-7 h-7 flex-shrink-0" />
              <h1 className="text-lg font-semibold tracking-tight text-primary truncate">Pocket Money</h1>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {themeButton}
              {discreetButton}
            </div>
          </div>

          {showProfileBar && (
            <div className="px-4 pb-3 lg:py-3.5 lg:pb-3.5">
              <div className="mx-auto w-full max-w-[1180px]">{profileBar}</div>
            </div>
          )}
        </header>

        {/* pb-28 clears the fixed tab bar, which only exists below lg. */}
        <main className="flex-1 w-full px-4 lg:px-8 pt-4 pb-28 lg:pb-10">
          <div className="mx-auto w-full max-w-[1180px]">
            <Outlet />
          </div>
        </main>
      </div>

      {/* ── Narrow-screen tab bar ────────────────────── */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-card/95 backdrop-blur border-t border-border safe-bottom">
        <div className="max-w-2xl mx-auto grid grid-cols-5">
          {tabs.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.end}
              className={({ isActive }) =>
                cn(
                  "flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium",
                  isActive ? "text-primary" : "text-muted-foreground"
                )
              }
            >
              <t.icon size={20} />
              <span>{t.label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
