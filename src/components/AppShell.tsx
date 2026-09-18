import { NavLink, Outlet, useLocation } from "react-router-dom";
import { LayoutDashboard, Receipt, Calendar, Upload, Settings as SettingsIcon, Eye, EyeOff } from "lucide-react";
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
const hideProfileBarPaths = ["/settings", "/import", "/install"];

export default function AppShell() {
  const { settings, setActiveProfile, toggleDiscreet } = useApp();
  const location = useLocation();
  const showProfileBar = !hideProfileBarPaths.some((p) => location.pathname.startsWith(p));

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="sticky top-0 z-30 bg-card/90 backdrop-blur border-b border-border safe-top">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <img src="./pwa-192.png" alt="" className="w-7 h-7" />
            <h1 className="text-lg font-semibold tracking-tight text-primary">Pocket Money</h1>
          </div>
          <button
            onClick={toggleDiscreet}
            aria-label="Toggle discreet mode"
            className={cn(
              "p-2 rounded-full transition-colors",
              settings.discreetMode
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-secondary-foreground hover:bg-accent"
            )}
          >
            {settings.discreetMode ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
        {showProfileBar && (
          <div className="max-w-2xl mx-auto px-4 pb-3 flex gap-1.5">
            {profiles.map((p) => (
              <button
                key={p.value}
                onClick={() => setActiveProfile(p.value)}
                className={cn(
                  "flex-1 px-3 py-1.5 text-xs font-medium rounded-full transition-colors",
                  settings.activeProfile === p.value
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-secondary-foreground"
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
        )}
      </header>

      <main className="flex-1 max-w-2xl w-full mx-auto px-4 pt-4 pb-28">
        <Outlet />
      </main>

      <nav className="fixed bottom-0 inset-x-0 z-30 bg-card/95 backdrop-blur border-t border-border safe-bottom">
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
