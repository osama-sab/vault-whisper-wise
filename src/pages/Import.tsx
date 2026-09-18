import { useMemo, useRef, useState } from "react";
import { useApp } from "@/lib/store";
import { parseCSV, previewCSV, rowHash, autoCategorizeMerchant, type BankFormat, type ParsedRow } from "@/lib/csv";
import { applyRules } from "@/lib/rules";
import { uid } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import type { ProfileId, Transaction } from "@/lib/types";
import { Upload, ArrowDownLeft, ArrowUpRight, Sparkles, FileText, Eye, ChevronRight, AlertTriangle, Check } from "lucide-react";
import { MerchantLogo } from "@/components/MerchantLogo";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Pending extends ParsedRow {
  key: string;
  categoryId: string;
  profile: ProfileId;
  matched: "rule" | "merchant" | false;
  isVague: boolean;
  saveRule: boolean;
  ruleKeyword: string;
  selected: boolean;
}

type Step = "format" | "preview" | "review";

const FORMAT_INFO: Record<BankFormat, { label: string; hint: string }> = {
  sparkasse: { label: "Sparkasse (Germany)", hint: "CSV-CAMT export. Semicolon-separated, German date format (dd.mm.yyyy). Uses Valutadatum for dates." },
  wise:      { label: "Wise (Borderless)",   hint: "Standard Wise statement export. Comma-separated, English dates." },
  generic:   { label: "Generic CSV",         hint: "Auto-detects columns. Supports German (dd.mm.yyyy), English (mm/dd/yyyy), ISO (yyyy-mm-dd) dates." },
};

export default function ImportPage() {
  const { categories, rules, transactions, bulkAddTransactions, upsertRule } = useApp();
  const [step, setStep] = useState<Step>("format");
  const [format, setFormat] = useState<BankFormat>("sparkasse");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<{ headers: string[]; rows: string[][]; count: number } | null>(null);
  const [pending, setPending] = useState<Pending[]>([]);
  const [markAllVague, setMarkAllVague] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const stats = useMemo(() => {
    const sel = pending.filter(p => p.selected);
    return {
      total: pending.length,
      selected: sel.length,
      matchedRule: sel.filter(p => p.matched === "rule").length,
      matchedMerchant: sel.filter(p => p.matched === "merchant").length,
      unmatched: sel.filter(p => !p.matched).length,
      credit: sel.filter(p => p.amount > 0).length,
      debit: sel.filter(p => p.amount < 0).length,
    };
  }, [pending]);

  async function onFileSelected(f: File) {
    setFile(f);
    try {
      const pv = await previewCSV(f, format);
      setPreview(pv);
      setStep("preview");
    } catch (e: any) {
      toast.error("Could not read file: " + e.message);
    }
  }

  async function proceedToReview() {
    if (!file) return;
    try {
      const rows = await parseCSV(file, format);
      const existing = new Set(transactions.map(t => rowHash({ date: t.date, amount: t.amount, payee: t.payee })));
      const incoming: Pending[] = rows
        .filter(r => !existing.has(rowHash(r)))
        .map(r => {
          // 1. Try saved rules first
          const ruleMatch = applyRules(r.payee, r.description, rules);
          if (ruleMatch) {
            return mkPending(r, ruleMatch.categoryId, ruleMatch.profile, "rule");
          }
          // 2. Try merchant auto-categorization
          const merchantMatch = autoCategorizeMerchant(r.payee, r.description, categories);
          if (merchantMatch) {
            return mkPending(r, merchantMatch.categoryId, merchantMatch.profile, "merchant");
          }
          // 3. Fallback: infer from amount sign
          const fallback = categories.find(c => r.amount > 0 ? c.type === "income" : c.type === "expenses") || categories[0];
          return mkPending(r, fallback?.id || "", "household", false);
        });
      setPending(incoming);
      setStep("review");
      const dupes = rows.length - incoming.length;
      toast.success(`${incoming.length} new transactions` + (dupes > 0 ? ` · ${dupes} duplicates skipped` : ""));
    } catch (e: any) {
      toast.error("Parse failed: " + e.message);
    }
  }

  function mkPending(r: ParsedRow, categoryId: string, profile: ProfileId, matched: "rule" | "merchant" | false): Pending {
    return {
      ...r,
      key: uid(),
      categoryId,
      profile,
      matched,
      isVague: markAllVague,
      saveRule: false,
      ruleKeyword: extractKeyword(r.payee || r.description),
      selected: true,
    };
  }

  function extractKeyword(text: string): string {
    // Extract the most meaningful keyword (first word, uppercase, skip short words)
    const words = text.split(/[\s\/\\,;]+/).filter(w => w.length >= 3);
    return (words[0] || text.split(" ")[0] || "").toUpperCase();
  }

  async function importNow() {
    const selected = pending.filter(p => p.selected);
    if (selected.length === 0) { toast.error("Select at least one transaction"); return; }

    const cat = (id: string) => categories.find(c => c.id === id);
    const txs: Transaction[] = selected.map(p => ({
      id: uid(),
      date: p.date,
      amount: Math.abs(p.amount),
      categoryId: p.categoryId,
      profile: p.profile,
      payee: p.isVague ? "" : p.payee,
      description: p.isVague ? (cat(p.categoryId)?.genericLabel || cat(p.categoryId)?.name || "Personal") : p.description,
      displayDescription: p.isVague ? (cat(p.categoryId)?.genericLabel || "Personal") : undefined,
      isVague: p.isVague,
      importedFrom: format,
    }));
    await bulkAddTransactions(txs);

    // Save new rules for unmatched transactions where user opted in
    let newRules = 0;
    for (const p of selected.filter(x => !x.matched && x.saveRule && x.ruleKeyword.trim())) {
      await upsertRule({
        id: uid(), keyword: p.ruleKeyword.trim(), field: "either",
        categoryId: p.categoryId, profile: p.profile, priority: 10,
      });
      newRules++;
    }
    toast.success(`Imported ${txs.length} transactions` + (newRules > 0 ? ` · ${newRules} new rules saved` : ""));
    setPending([]); setFile(null); setPreview(null); setStep("format");
  }

  return (
    <div className="space-y-4">
      {/* Progress bar */}
      <div className="flex items-center gap-2 px-1">
        {(["format", "preview", "review"] as Step[]).map((s, i) => (
          <div key={s} className="flex items-center gap-2 flex-1">
            <div className={cn("w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center",
              step === s ? "bg-primary text-primary-foreground"
                : (["format","preview","review"].indexOf(step) > i) ? "bg-primary/20 text-primary" : "bg-secondary text-muted-foreground")}>
              {["format","preview","review"].indexOf(step) > i ? <Check size={12} /> : i + 1}
            </div>
            {i < 2 && <div className="flex-1 h-px bg-border" />}
          </div>
        ))}
      </div>

      {/* STEP 1: FORMAT */}
      {step === "format" && (
        <div className="bg-card rounded-2xl border border-border p-4 space-y-4">
          <div className="flex items-center gap-2">
            <FileText size={18} className="text-primary" />
            <h2 className="font-semibold">Import bank statement</h2>
          </div>
          <p className="text-xs text-muted-foreground">
            Export a CSV from your bank and upload it here. The app auto-categorizes transactions using your rules and merchant recognition. All processing is local — nothing leaves your device.
          </p>

          <div>
            <Label className="text-sm font-medium">Bank format</Label>
            <Select value={format} onValueChange={v => setFormat(v as BankFormat)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(FORMAT_INFO) as BankFormat[]).map(k => (
                  <SelectItem key={k} value={k}>{FORMAT_INFO[k].label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground mt-1">{FORMAT_INFO[format].hint}</p>
          </div>

          <div className="flex items-center gap-2">
            <Switch checked={markAllVague} onCheckedChange={setMarkAllVague} id="vague-all" />
            <Label htmlFor="vague-all" className="text-sm font-normal">
              Mark personal transactions as vague (hides payee details)
            </Label>
          </div>

          <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) onFileSelected(f); e.target.value = ""; }} />
          <Button onClick={() => fileRef.current?.click()} className="w-full">
            <Upload size={16} className="mr-2" /> Choose CSV file
          </Button>
        </div>
      )}

      {/* STEP 2: PREVIEW (wizard) */}
      {step === "preview" && preview && (
        <div className="bg-card rounded-2xl border border-border p-4 space-y-4">
          <h2 className="font-semibold">Preview: {file?.name}</h2>
          <p className="text-xs text-muted-foreground">
            {preview.count} rows detected. Verify the columns look correct below before continuing.
          </p>

          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="text-[11px] w-full">
              <thead className="bg-secondary">
                <tr>
                  {preview.headers.map((h, i) => (
                    <th key={i} className="px-2 py-1.5 text-left font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {preview.rows.map((row, ri) => (
                  <tr key={ri} className={ri % 2 === 0 ? "" : "bg-secondary/30"}>
                    {row.map((cell, ci) => (
                      <td key={ci} className="px-2 py-1 whitespace-nowrap max-w-[200px] truncate">{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {format === "sparkasse" && (
            <div className="text-xs text-muted-foreground bg-secondary rounded-lg p-2 flex items-start gap-2">
              <AlertTriangle size={14} className="text-warning flex-shrink-0 mt-0.5" />
              <span>Using <strong>Valutadatum</strong> (value date) as the transaction date. This is the day the transaction actually happened, not the booking date.</span>
            </div>
          )}

          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => { setStep("format"); setPreview(null); }}>
              Back
            </Button>
            <Button className="flex-1" onClick={proceedToReview}>
              Continue — parse {preview.count} rows <ChevronRight size={14} className="ml-1" />
            </Button>
          </div>
        </div>
      )}

      {/* STEP 3: REVIEW */}
      {step === "review" && (
        <>
          <div className="bg-card rounded-2xl border border-border p-4 space-y-3">
            <h2 className="font-semibold">Review & import</h2>
            <div className="grid grid-cols-4 gap-2 text-xs">
              <Stat label="Selected" value={`${stats.selected}`} />
              <Stat label="By rules" value={`${stats.matchedRule}`} icon={<Sparkles size={10} className="text-primary" />} />
              <Stat label="By store" value={`${stats.matchedMerchant}`} icon={<Eye size={10} className="text-primary" />} />
              <Stat label="Manual" value={`${stats.unmatched}`} />
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <Stat label="Credit (in)" value={`${stats.credit}`} color="text-income" />
              <Stat label="Debit (out)" value={`${stats.debit}`} color="text-expense" />
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setPending(s => s.map(p => ({...p, selected: true})))}>All</Button>
              <Button size="sm" variant="outline" onClick={() => setPending(s => s.map(p => ({...p, selected: false})))}>None</Button>
              <Button size="sm" variant="outline" onClick={() => setPending(s => s.map(p => ({...p, isVague: true})))}>All vague</Button>
              <div className="flex-1" />
              <Button size="sm" variant="outline" onClick={() => { setStep("preview"); }}>Back</Button>
              <Button size="sm" onClick={importNow}>Import {stats.selected}</Button>
            </div>
          </div>

          <div className="space-y-2">
            {pending.map((p, i) => {
              const isIn = p.amount > 0;
              const profileCats = categories.filter(c => c.profileDefault === p.profile && (isIn ? c.type === "income" : c.type !== "income"));
              return (
                <div key={p.key} className={cn("bg-card border rounded-xl p-3 space-y-2",
                  p.selected ? "border-border" : "border-border/30 opacity-50")}>
                  <div className="flex items-center gap-2">
                    <Checkbox checked={p.selected} onCheckedChange={v => setPending(s => s.map((x, j) => j === i ? {...x, selected: !!v} : x))} />
                    <MerchantLogo payee={p.payee} size={28} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{p.payee || p.description || "—"}</p>
                      <p className="text-[11px] text-muted-foreground truncate">{p.date} {p.description && p.payee ? `· ${p.description}` : ""}</p>
                    </div>
                    <div className={cn("text-right font-semibold text-sm flex items-center gap-0.5",
                      isIn ? "text-income" : "text-expense")}>
                      {isIn ? <ArrowDownLeft size={12} /> : <ArrowUpRight size={12} />}
                      {Math.abs(p.amount).toFixed(2)}
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <Select value={p.profile} onValueChange={v => setPending(s => s.map((x, j) => j === i ? {...x, profile: v as ProfileId,
                      categoryId: categories.find(c => c.profileDefault === v && (isIn ? c.type === "income" : c.type !== "income"))?.id || x.categoryId} : x))}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="household">Household</SelectItem>
                        <SelectItem value="personal">Personal</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={p.categoryId} onValueChange={v => setPending(s => s.map((x, j) => j === i ? {...x, categoryId: v, matched: false} : x))}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {profileCats.length === 0 ? <div className="px-2 py-1.5 text-xs text-muted-foreground">No categories</div>
                          : profileCats.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <div className="flex items-center gap-1.5">
                      <Switch checked={p.isVague} onCheckedChange={v => setPending(s => s.map((x, j) => j === i ? {...x, isVague: !!v} : x))} />
                      <span className="text-[10px] text-muted-foreground">Vague</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    {p.matched === "rule" ? (
                      <p className="text-[10px] text-success flex items-center gap-1"><Sparkles size={10} /> Matched by rule</p>
                    ) : p.matched === "merchant" ? (
                      <p className="text-[10px] text-primary flex items-center gap-1"><Eye size={10} /> Auto-detected store</p>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <Checkbox checked={p.saveRule} onCheckedChange={v => setPending(s => s.map((x, j) => j === i ? {...x, saveRule: !!v} : x))} id={`r-${i}`} />
                        <Label htmlFor={`r-${i}`} className="text-[10px] text-muted-foreground">Save rule:</Label>
                        <Input className="h-5 text-[10px] w-24" value={p.ruleKeyword}
                          onChange={e => setPending(s => s.map((x, j) => j === i ? {...x, ruleKeyword: e.target.value} : x))} />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, icon, color }: { label: string; value: string; icon?: React.ReactNode; color?: string }) {
  return (
    <div className="bg-secondary rounded-lg p-2 text-center">
      <p className="text-muted-foreground text-[10px] uppercase tracking-wide flex items-center justify-center gap-1">{icon}{label}</p>
      <p className={cn("font-semibold text-xs mt-0.5", color)}>{value}</p>
    </div>
  );
}
