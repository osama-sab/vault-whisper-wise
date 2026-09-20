import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useEffect, useState } from "react";
import { useApp } from "@/lib/store";
import AppShell from "@/components/AppShell";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import PassphraseGate from "@/components/PassphraseGate";
import { BrandMark } from "@/components/BrandMark";
import Dashboard from "./pages/Dashboard";
import TransactionsPage from "./pages/Transactions";
import BillsPage from "./pages/Bills";
import ImportPage from "./pages/Import";
import SettingsPage from "./pages/Settings";
import NotFound from "./pages/NotFound.tsx";

const queryClient = new QueryClient();

const App = () => {
  const init = useApp((s) => s.init);
  const ready = useApp((s) => s.ready);
  const locked = useApp((s) => s.locked);
  // init() was previously called with no .catch(): if IndexedDB was
  // unavailable the promise rejected, `ready` never flipped, and the window
  // sat on "Loading…" for ever with no message and no way to retry.
  const [initError, setInitError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    init().catch((e) => {
      if (!cancelled) setInitError(e instanceof Error ? e : new Error(String(e)));
    });
    return () => { cancelled = true; };
  }, [init]);

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <HashRouter>
            {initError ? (
              <div className="min-h-screen flex items-center justify-center p-6 bg-ground">
                <div className="max-w-md w-full bg-card border border-hairline rounded-panel shadow-panel p-6 space-y-3">
                  <BrandMark size={40} />
                  <h1 className="font-semibold text-lg tracking-tight">Pocket Money could not open your data</h1>
                  <p className="text-sm text-muted-foreground">
                    The vault could not be opened, so your transactions cannot be loaded. Your data
                    has not been changed.
                  </p>
                  <pre className="text-[11px] bg-secondary rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-words">
                    {initError.message}
                  </pre>
                  <button
                    className="w-full rounded-full bg-primary text-primary-foreground text-sm font-medium py-2.5 hover:bg-primary/90 transition-colors"
                    onClick={() => location.reload()}
                  >
                    Retry
                  </button>
                </div>
              </div>
            ) : locked ? (
              <PassphraseGate />
            ) : !ready ? (
              <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-ground text-muted-foreground">
                <BrandMark size={44} className="animate-pulse" />
                <p className="text-sm">Opening your vault…</p>
              </div>
            ) : (
              <Routes>
                <Route element={<AppShell />}>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/transactions" element={<TransactionsPage />} />
                  <Route path="/bills" element={<BillsPage />} />
                  <Route path="/import" element={<ImportPage />} />
                  <Route path="/settings" element={<SettingsPage />} />
                </Route>
                <Route path="*" element={<NotFound />} />
              </Routes>
            )}
          </HashRouter>
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
};

export default App;
