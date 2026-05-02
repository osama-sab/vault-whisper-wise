import { useMemo, useState } from "react";
import { useApp } from "@/lib/store";
import { ChevronLeft, ChevronRight, Check } from "lucide-react";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

export default function CalendarPage() {
  const { subscriptions, billPayments, settings, upsertBillPayment, categories } = useApp();
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  const subs = useMemo(
    () =>
      subscriptions.filter(
        (s) => s.active && (settings.activeProfile === "combined" || s.profile === settings.activeProfile)
      ),
    [subscriptions, settings.activeProfile]
  );

  const catMap = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const paymentMap = useMemo(() => {
    const m = new Map<string, boolean>();
    for (const p of billPayments) {
      if (p.year === month.getFullYear() && p.month === month.getMonth()) m.set(p.subscriptionId, p.paid);
    }
    return m;
  }, [billPayments, month]);

  // Build calendar grid Sun-Sat
  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1).getDay();
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const today = new Date();

  const subsByDay = useMemo(() => {
    const m = new Map<number, typeof subs>();
    for (const s of subs) {
      const day = Math.min(s.dueDay, daysInMonth);
      m.set(day, [...(m.get(day) || []), s]);
    }
    return m;
  }, [subs, daysInMonth]);

  function togglePaid(subId: string) {
    const id = `${subId}-${month.getFullYear()}-${month.getMonth()}`;
    const current = paymentMap.get(subId) || false;
    upsertBillPayment({
      id,
      subscriptionId: subId,
      year: month.getFullYear(),
      month: month.getMonth(),
      paid: !current,
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button className="p-2 rounded-full bg-secondary" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>
          <ChevronLeft size={16} />
        </button>
        <p className="font-semibold">{month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</p>
        <button className="p-2 rounded-full bg-secondary" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>
          <ChevronRight size={16} />
        </button>
      </div>

      <div className="bg-card rounded-2xl border border-border p-2">
        <div className="grid grid-cols-7 text-[10px] text-center text-muted-foreground font-medium pb-1">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div key={d}>{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((d, i) => {
            const isToday =
              d === today.getDate() && today.getMonth() === month.getMonth() && today.getFullYear() === month.getFullYear();
            const isPayday = d != null && settings.paydays.includes(d);
            const billsHere = d != null ? subsByDay.get(d) || [] : [];
            return (
              <div
                key={i}
                className={cn(
                  "aspect-square rounded-lg border text-[11px] p-1 flex flex-col gap-0.5",
                  d == null ? "border-transparent" : "border-border",
                  isToday && "border-primary bg-primary/5"
                )}
              >
                {d != null && (
                  <div className="flex justify-between items-center">
                    <span className={cn("font-semibold", isToday && "text-primary")}>{d}</span>
                    {isPayday && <span className="w-1.5 h-1.5 rounded-full bg-income" title="Payday" />}
                  </div>
                )}
                <div className="flex flex-wrap gap-0.5">
                  {billsHere.map((s) => {
                    const paid = paymentMap.get(s.id);
                    return (
                      <button
                        key={s.id}
                        onClick={() => togglePaid(s.id)}
                        title={`${s.name} ${formatMoney(s.expectedAmount, settings.currency)}`}
                        className={cn(
                          "w-full text-[9px] truncate rounded px-1 leading-tight",
                          paid ? "bg-success/20 text-success" : "bg-warning/20 text-warning"
                        )}
                      >
                        {paid ? "✓" : "•"} {s.name.slice(0, 6)}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="bg-card rounded-2xl border border-border p-4">
        <h3 className="font-semibold mb-2">Bills this month</h3>
        {subs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No active subscriptions.</p>
        ) : (
          <div className="space-y-1.5">
            {subs
              .sort((a, b) => a.dueDay - b.dueDay)
              .map((s) => {
                const paid = paymentMap.get(s.id);
                const c = catMap.get(s.categoryId);
                return (
                  <button
                    key={s.id}
                    onClick={() => togglePaid(s.id)}
                    className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-secondary/50 text-left"
                  >
                    <div
                      className={cn(
                        "w-6 h-6 rounded-full border-2 flex items-center justify-center",
                        paid ? "bg-success border-success text-success-foreground" : "border-border"
                      )}
                    >
                      {paid && <Check size={12} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{s.name}</p>
                      <p className="text-xs text-muted-foreground">
                        Due day {s.dueDay} · {c?.name} · {s.profile}
                      </p>
                    </div>
                    <p className="font-semibold text-sm">{formatMoney(s.expectedAmount, settings.currency)}</p>
                  </button>
                );
              })}
          </div>
        )}
      </div>
    </div>
  );
}