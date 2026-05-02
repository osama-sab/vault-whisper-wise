import { useRef, useState } from "react";
import { useApp } from "@/lib/store";
import { parseCSV, rowHash, type BankFormat, type ParsedRow } from "@/lib/csv";
import { applyRules } from "@/lib/rules";
import { uid } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import type { ProfileId, Transaction } from "@/lib/types";
import { Upload } from "lucide-react";
import { toast } from "sonner";

interface Pending extends ParsedRow {
  key: string;
  categoryId: string;
  profile: ProfileId;
  matched: boolean;
  saveRule: boolean;
  ruleKeyword: string;
  selected: boolean;
}

export default function ImportPage() {
  const { categories, rules, transactions, bulkAddTransactions, upsertRule } = useApp();
  const [format, setFormat] = useState<BankFormat>("sparkasse");
  const [pending, setPending] = useState<Pending[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFile(f: File) {
    try {
      const rows = await parseCSV(f, format);
      const existing = new Set(transactions.map((t) => rowHash({ date: t.date, amount: t.amount, payee: t.payee })));
      const incoming: Pending[] = rows
        .filter((r) => !existing.has(rowHash(r)))
        .map((r) => {
          const m = applyRules(r.payee, r.description, rules);
          const fallback = categories.find((c) =>
            r.amount > 0 ? c.type === "income" : c.type === "expenses"
          ) || categories[0];
          return {
            ...r,
            key: uid(),
            categoryId: m?.categoryId || fallback.id,
            profile: m?.profile || "household",
            matched: !!m,
            saveRule: false,
            ruleKeyword: (r.payee || r.description || "").split(" ")[0]?.toUpperCase() || "",
            selected: true,
          };
        });
      setPending(incoming);
      toast.success(`Parsed ${rows.length} rows · ${incoming.length} new`);
    } catch (e: any) {
      toast.error("Import failed: " + e.message);
    }
  }

  async function importNow() {
    const selected = pending.filter((p) => p.selected);
    const txs: Transaction[] = selected.map((p) => ({
      id: uid(),
      date: p.date,
      amount: Math.abs(p.amount),
      categoryId: p.categoryId,
      profile: p.profile,
      payee: p.payee,
      description: p.description,
      isVague: false,
      importedFrom: format,
    }));
    await bulkAddTransactions(txs);

    // Save new rules
    for (const p of selected.filter((x) => !x.matched && x.saveRule && x.ruleKeyword)) {
      await upsertRule({
        id: uid(),
        keyword: p.ruleKeyword,
        field: "either",
        categoryId: p.categoryId,
        profile: p.profile,
        priority: 10,
      });
    }
    toast.success(`Imported ${txs.length} transactions`);
    setPending([]);
  }

  return (
    <div className="space-y-4">
      <div className="bg-card rounded-2xl border border-border p-4 space-y-3">
        <h2 className="font-semibold">Import CSV</h2>
        <div>
          <Label>Bank format</Label>
          <Select value={format} onValueChange={(v) => setFormat(v as BankFormat)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="sparkasse">Sparkasse (DE)</SelectItem>
              <SelectItem value="wise">Wise</SelectItem>
              <SelectItem value="generic">Generic</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            e.target.value = "";
          }}
        />
        <Button onClick={() => fileRef.current?.click()} className="w-full">
          <Upload size={16} className="mr-2" /> Choose CSV file
        </Button>
        <p className="text-xs text-muted-foreground">
          All processing happens locally on your device. Nothing is uploaded.
        </p>
      </div>

      {pending.length > 0 && (
        <div className="bg-card rounded-2xl border border-border p-3">
          <div className="flex justify-between items-center mb-3">
            <p className="text-sm font-semibold">{pending.length} rows to review</p>
            <Button size="sm" onClick={importNow}>Import {pending.filter((p) => p.selected).length}</Button>
          </div>
          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            {pending.map((p, i) => (
              <div key={p.key} className="border border-border rounded-lg p-2 space-y-2">
                <div className="flex items-start gap-2">
                  <Checkbox
                    checked={p.selected}
                    onCheckedChange={(v) =>
                      setPending((s) => s.map((x, j) => (j === i ? { ...x, selected: !!v } : x)))
                    }
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between gap-2 text-xs">
                      <span className="text-muted-foreground">{p.date}</span>
                      <span className="font-semibold">{p.amount.toFixed(2)}</span>
                    </div>
                    <p className="text-sm font-medium truncate">{p.payee || "—"}</p>
                    <p className="text-xs text-muted-foreground truncate">{p.description}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Select
                    value={p.categoryId}
                    onValueChange={(v) =>
                      setPending((s) => s.map((x, j) => (j === i ? { ...x, categoryId: v, matched: false } : x)))
                    }
                  >
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {categories.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={p.profile}
                    onValueChange={(v) =>
                      setPending((s) => s.map((x, j) => (j === i ? { ...x, profile: v as ProfileId } : x)))
                    }
                  >
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="household">Household</SelectItem>
                      <SelectItem value="personal">Personal</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {!p.matched && (
                  <div className="flex items-center gap-2 pt-1">
                    <Checkbox
                      checked={p.saveRule}
                      onCheckedChange={(v) =>
                        setPending((s) => s.map((x, j) => (j === i ? { ...x, saveRule: !!v } : x)))
                      }
                      id={`rule-${i}`}
                    />
                    <Label htmlFor={`rule-${i}`} className="text-xs">Save rule:</Label>
                    <Input
                      className="h-7 text-xs"
                      value={p.ruleKeyword}
                      onChange={(e) =>
                        setPending((s) => s.map((x, j) => (j === i ? { ...x, ruleKeyword: e.target.value } : x)))
                      }
                    />
                  </div>
                )}
                {p.matched && <p className="text-[10px] text-success">✓ Auto-matched by rule</p>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}