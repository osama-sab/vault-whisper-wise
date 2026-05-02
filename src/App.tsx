import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useEffect } from "react";
import { useApp } from "@/lib/store";
import AppShell from "@/components/AppShell";
import Dashboard from "./pages/Dashboard";
import TransactionsPage from "./pages/Transactions";
import CalendarPage from "./pages/Calendar";
import SubscriptionsPage from "./pages/Subscriptions";
import ImportPage from "./pages/Import";
import SettingsPage from "./pages/Settings";
import InstallPage from "./pages/Install";
import NotFound from "./pages/NotFound.tsx";

const queryClient = new QueryClient();

const App = () => {
  const init = useApp((s) => s.init);
  const ready = useApp((s) => s.ready);
  useEffect(() => {
    init();
  }, [init]);
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          {!ready ? (
            <div className="min-h-screen flex items-center justify-center text-muted-foreground">
              Loading…
            </div>
          ) : (
            <Routes>
              <Route element={<AppShell />}>
                <Route path="/" element={<Dashboard />} />
                <Route path="/transactions" element={<TransactionsPage />} />
                <Route path="/calendar" element={<CalendarPage />} />
                <Route path="/subscriptions" element={<SubscriptionsPage />} />
                <Route path="/import" element={<ImportPage />} />
                <Route path="/settings" element={<SettingsPage />} />
              </Route>
              <Route path="/install" element={<InstallPage />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          )}
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
