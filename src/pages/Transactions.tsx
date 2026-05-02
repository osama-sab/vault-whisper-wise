import { useMemo, useState } from "react";
import { useApp } from "@/lib/store";
import { formatMoney } from "@/lib/format";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import TransactionDialog from "@/components/TransactionDialog";
import type { Transaction } from "@/lib/types";
import { DiscreetText } from "@/components/Discreet";
import { exportTransactionsCSV, downloadFile } from "@/lib/csv";

export default function TransactionsPage() {
  const { transactions, categories, settings, deleteTransaction, deleteSplitGroup } = useApp();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const catMap = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  const list = useMemo(() => {
    return transactions
      .filter((t) => settings.activeProfile === "combined" || t.profile === settings.activeProfile)
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [transactions, settings.activeProfile]);

  const grouped = useMemo(() => {
    const m = new Map<string, Transaction[]>();
    for (const t of list) {
      m.set(t.date, [...(m.get(t.date) || []), t]);
    }
    return [...m.entries()];
  }, [list]);

  function exportCSV() {
    const rows = list.map((t) => {
      const c = catMap.get(t.categoryId);
      return {
        date: t.date,
        amount: t.amount,
        category: c?.name || "",
        type: c?.type || "",
        profile: t.profile,
        payee: settings.discreetMode ? "" : t.payee,
        description: settings.discreetMode ? c?.genericLabel || "" : t.description,
      };
    });
    downloadFile(`transactions-${new Date().toISOString().slice(0, 10)}.csv`, exportTransactionsCSV(rows));
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center gap-2">
        <h2 className="font-semibold">Transactions</h2>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportCSV}>
            CSV
          </Button>
          <Button
            size="sm"
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            <Plus size={16} className="mr-1" /> Add
          </Button>
        </div>
      </div>

      {grouped.length === 0 ? (
        <p className="text-sm text-muted-foreground py-12 text-center">
          No transactions yet. Tap Add to create one, or import a CSV.
        </p>
      ) : (
        <div className="space-y-4">
          {grouped.map(([date, items]) => (
            <div key={date}>
              <p className="text-xs text-muted-foreground mb-1.5 px-1">
                {new Date(date).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}
              </p>
              <div className="bg-card rounded-2xl border border-border divide-y divide-border">
                {items.map((t) => {
                  const c = catMap.get(t.categoryId);
                  const display = settings.discreetMode || t.isVague
                    ? t.displayDescription || c?.genericLabel || c?.name
                    : t.payee || t.description || c?.name;
                  return (
                    <div key={t.id} className="flex items-center gap-3 p-3">
                      <div
                        className="w-9 h-9 rounded-full flex items-center justify-center text-[10px] font-bold uppercase"
                        style={{
                          background: `hsl(var(--${c?.type || "muted"}) / 0.15)`,
                          color: `hsl(var(--${c?.type || "muted-foreground"}))`,
                        }}
                      >
                        {(c?.name || "?").slice(0, 2)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">
                          <DiscreetText fallback={c?.genericLabel || c?.name}>{display}</DiscreetText>
                          {t.splitGroupId && <span className="ml-2 text-[10px] text-muted-foreground">SPLIT</span>}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {c?.name} · {t.profile}
                        </p>
                      </div>
                      <div className="text-right">
                        <p
                          className={
                            "font-semibold " +
                            (c?.type === "income" ? "text-income" : "text-foreground")
                          }
                        >
                          <DiscreetText fallback="••">
                            {c?.type === "income" ? "+" : "-"}
                            {formatMoney(Math.abs(t.amount), settings.currency)}
                          </DiscreetText>
                        </p>
                        <div className="flex gap-1 justify-end mt-0.5">
                          <button
                            className="text-muted-foreground hover:text-foreground"
                            onClick={() => {
                              setEditing(t);
                              setOpen(true);
                            }}
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            className="text-muted-foreground hover:text-destructive"
                            onClick={() => {
                              if (t.splitGroupId) {
                                if (confirm("Delete entire split group?")) deleteSplitGroup(t.splitGroupId);
                              } else {
                                if (confirm("Delete transaction?")) deleteTransaction(t.id);
                              }
                            }}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <TransactionDialog open={open} onOpenChange={setOpen} editing={editing} />
    </div>
  );
}