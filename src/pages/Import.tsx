import { useMemo, useRef, useState } from "react";
import { useApp } from "@/lib/store";
import {
  parseCSV, previewCSV, rowHash, autoCategorizeMerchant,
  type BankFormat, type ParsedRow, type DateOrder, type PreviewResult,
} from "@/lib/csv";
import { applyRules } from "@/lib/rules";
import { uid } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import type { Category, ProfileId, Transaction } from "@/lib/types";
import { Upload, ArrowDownLeft, ArrowUpRight, Sparkles, FileText, Eye, ChevronRight, AlertTriangle, Check, CalendarDays } from "lucide-react";
import { MerchantLogo } from "@/components/MerchantLogo";
import { formatDate, profileLabel } from "@/lib/format";
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
  sparkasse: { label: "Sparkasse (Germany)", hint: "CSV-CAMT export, semicolon-separated. Uses Valutadatum — the day the money actually moved — in preference to the booking date." },
  wise:      { label: "Wise (Borderless)",   hint: "Standard Wise statement export, comma-separated." },
  generic:   { label: "Generic CSV",         hint: "Auto-detects the columns, the number format and the date order." },
};

const DATE_ORDER_LABEL: Record<DateOrder, string> = {
  dmy: "Day first — 03/04 is 3 April",
  mdy: "Month first — 03/04 is 4 March",
};

export default function ImportPage() {
  const { categories, rules, transactions, bulkAddTransactions, upsertRule } = useApp();
  const [step, setStep] = useState<Step>("format");
  const [format, setFormat] = useState<BankFormat>("sparkasse");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [dateOrder, setDateOrder] = useState<DateOrder>("dmy");
  const [pending, setPending] = useState<Pending[]>([]);
  const [skipped, setSkipped] = useState<{ line: number; reason: string }[]>([]);
  const [markAllVague, setMarkAllVague] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const stats = useMemo(() => {
    const sel = pending.filter((p) => p.selected);
    return {
      total: pending.length,
      selected: sel.length,
      matchedRule: sel.filter((p) => p.matched === "rule").length,
      matchedMerchant: sel.filter((p) => p.matched === "merchant").length,
      unmatched: sel.filter((p) => !p.matched).length,
      credit: sel.filter((p) => p.amount > 0).length,
      debit: sel.filter((p) => p.amount < 0).length,
    };
  }, [pending]);

  async function onFileSelected(f: File) {
    setFile(f);
    setBusy(true);
    try {
      const pv = await previewCSV(f, format);
      setPreview(pv);
      setDateOrder(pv.dateOrder);
      setStep("preview");
    } catch (e) {
      toast.error("Could not read that file: " + (e as Error).message);
    }
    setBusy(false);
  }

  /** Re-read the preview when the user overrides the detected date order. */
  async function changeDateOrder(order: DateOrder) {
    setDateOrder(order);
    if (!file) return;
    try {
      setPreview(await previewCSV(file, format, { dateOrder: order }));
    } catch { /* keep the existing preview */ }
  }

  async function proceedToReview() {
    if (!file) return;
    setBusy(true);
    try {
      const { rows, skipped: dropped } = await parseCSV(file, format, { dateOrder });

      // Hash the EXISTING transactions in their stored shape, and each incoming
      // row in the shape it will be stored as, so the two are comparable.
      const existing = new Set(
        transactions.map((t) => rowHash({
          date: t.date,
          amount: t.amount,
          payee: t.payee,
          description: t.description,
          isCredit: categories.find((c) => c.id === t.categoryId)?.type === "income",
        }))
      );

      const seen = new Set<string>();
      const incoming: Pending[] = [];
      let dupes = 0;

      for (const r of rows) {
        const h = rowHash(r);
        // Skip rows already stored, and identical rows repeated in this file.
        if (existing.has(h) || seen.has(h)) { dupes++; continue; }
        seen.add(h);
        incoming.push(categorize(r));
      }

      setPending(incoming);
      setSkipped(dropped);
      setStep("review");

      const bits = [`${incoming.length} new`];
      if (dupes) bits.push(`${dupes} duplicate${dupes === 1 ? "" : "s"} skipped`);
      if (dropped.length) bits.push(`${dropped.length} unreadable`);
      toast.success(bits.join(" · "));
    } catch (e) {
      toast.error("Could not parse that file: " + (e as Error).message);
    }
    setBusy(false);
  }

  /**
   * Direction comes from the CSV sign FIRST, then a category is chosen from
   * among those matching that direction. Previously a rule or merchant match
   * could drop an incoming refund into an expense category, and Math.abs()
   * then erased the sign — so a €40 refund was recorded as €40 spent.
   */
  function categorize(r: ParsedRow): Pending {
    const isCredit = r.amount > 0;
    const ofDirection = (c: Category) => (isCredit ? c.type === "income" : c.type !== "income");

    const ruleMatch = applyRules(r.payee, r.description, rules);
    if (ruleMatch) {
      const cat = categories.find((c) => c.id === ruleMatch.categoryId);
      if (cat && ofDirection(cat)) return mkPending(r, cat.id, ruleMatch.profile, "rule");
    }

    const merchantMatch = autoCategorizeMerchant(r.payee, r.description, categories, isCredit);
    if (merchantMatch) return mkPending(r, merchantMatch.categoryId, merchantMatch.profile, "merchant");

    const fallback = categories.find(ofDirection) ?? categories[0];
    return mkPending(r, fallback?.id ?? "", fallback?.profileDefault ?? "household", false);
  }

  function mkPending(r: ParsedRow, categoryId: string, profile: ProfileId, matched: Pending["matched"]): Pending {
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
    const words = text.split(/[\s/\\,;]+/).filter((w) => w.length >= 3);
    return (words[0] || text.split(" ")[0] || "").toUpperCase();
  }

  function patch(i: number, changes: Partial<Pending>) {
    setPending((s) => s.map((x, j) => (j === i ? { ...x, ...changes } : x)));
  }

  async function importNow() {
    const selected = pending.filter((p) => p.selected);
    if (selected.length === 0) { toast.error("Select at least one transaction to import"); return; }

    const cat = (id: string) => categories.find((c) => c.id === id);
    const txs: Transaction[] = selected.map((p) => {
      const c = cat(p.categoryId);
      const generic = c?.genericLabel || c?.name || "Personal";
      return {
        id: uid(),
        date: p.date,
        amount: Math.abs(p.amount),
        categoryId: p.categoryId,
        profile: p.profile,
        payee: p.isVague ? "" : p.payee,
        // A vague transaction carries no description at all; the generic label
        // lives in displayDescription, which is what the UI and report show.
        description: p.isVague ? "" : p.description,
        displayDescription: p.isVague ? generic : undefined,
        isVague: p.isVague,
        importedFrom: format,
      };
    });
    await bulkAddTransactions(txs);

    const newRules = selected.filter((x) => !x.matched && x.saveRule && x.ruleKeyword.trim());
    for (const p of newRules) {
      await upsertRule({
        id: uid(), keyword: p.ruleKeyword.trim(), field: "either",
        categoryId: p.categoryId, profile: p.profile, priority: 10,
      });
    }

    toast.success(`Imported ${txs.length} transactions` + (newRules.length ? ` · ${newRules.length} new rules saved` : ""));
    setPending([]); setSkipped([]); setFile(null); setPreview(null); setStep("format");
  }

  const steps: Step[] = ["format", "preview", "review"];
  const stepIndex = steps.indexOf(step);

  return (
    <div className="space-y-4">
      {/* Progress */}
      <div className="flex items-center gap-2 px-1">
        {steps.map((s, i) => (
          <div key={s} className="flex items-center gap-2 flex-1">
            <div className={cn("w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center flex-shrink-0",
              step === s ? "bg-primary text-primary-foreground"
                : stepIndex > i ? "bg-primary/20 text-primary" : "bg-secondary text-muted-foreground")}>
              {stepIndex > i ? <Check size={12} /> : i + 1}
            </div>
            {i < 2 && <div className="flex-1 h-px bg-border" />}
          </div>
        ))}
      </div>

      {/* STEP 1 — FORMAT */}
      {step === "format" && (
        <div className="bg-card rounded-2xl border border-hairline shadow-card p-4 space-y-4">
          <div className="flex items-center gap-2">
            <FileText size={18} className="text-primary" />
            <h2 className="font-semibold">Import a bank statement</h2>
          </div>
          <p className="text-sm text-muted-foreground max-w-[62ch]">
            Export a CSV from your bank and open it here. Transactions are categorised using your rules and
            the built-in store list. Everything is processed on this computer — nothing is uploaded.
          </p>

          <div>
            <Label className="text-sm font-medium">Bank format</Label>
            <Select value={format} onValueChange={(v) => setFormat(v as BankFormat)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(FORMAT_INFO) as BankFormat[]).map((k) => (
                  <SelectItem key={k} value={k}>{FORMAT_INFO[k].label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground mt-1">{FORMAT_INFO[format].hint}</p>
          </div>

          <div className="flex items-center gap-2">
            <Switch checked={markAllVague} onCheckedChange={setMarkAllVague} id="vague-all" />
            <Label htmlFor="vague-all" className="text-sm font-normal">
              Mark every transaction vague (hides payee and description)
            </Label>
          </div>

          <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onFileSelected(f); e.target.value = ""; }} />
          <Button onClick={() => fileRef.current?.click()} className="w-full sm:w-auto" disabled={busy}>
            <Upload size={16} className="mr-2" /> {busy ? "Reading…" : "Choose CSV file"}
          </Button>
        </div>
      )}

      {/* STEP 2 — PREVIEW */}
      {step === "preview" && preview && (
        <div className="bg-card rounded-2xl border border-hairline shadow-card p-4 space-y-4">
          <div>
            <h2 className="font-semibold">Check the columns</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {preview.count} rows in {file?.name}. Confirm this looks right before importing.
            </p>
          </div>

          {/* What the app matched each field to */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <MappingRow label="Date" col={preview.mapping.date} />
            <MappingRow label="Amount" col={preview.mapping.amount} />
            <MappingRow label="Payee" col={preview.mapping.payee} />
            <MappingRow label="Description" col={preview.mapping.desc} />
          </div>

          {(!preview.mapping.date || !preview.mapping.amount) && (
            <div className="text-xs bg-destructive/10 text-destructive rounded-lg p-2 flex items-start gap-2">
              <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
              <span>
                No {!preview.mapping.date ? "date" : "amount"} column was recognised. Try a different bank
                format — importing now would skip every row.
              </span>
            </div>
          )}

          {/* Date order — the single most important thing to get right */}
          <div className="rounded-lg border border-border p-3 space-y-2">
            <div className="flex items-center gap-2">
              <CalendarDays size={14} className="text-primary" />
              <Label className="text-sm font-medium">Date order</Label>
              {preview.dateOrderConfident && (
                <span className="text-[10px] text-success font-medium">detected from this file</span>
              )}
            </div>
            <Select value={dateOrder} onValueChange={(v) => changeDateOrder(v as DateOrder)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="dmy">{DATE_ORDER_LABEL.dmy}</SelectItem>
                <SelectItem value="mdy">{DATE_ORDER_LABEL.mdy}</SelectItem>
              </SelectContent>
            </Select>
            {preview.sampleDates.length > 0 && (
              <div className="text-[11px] text-muted-foreground space-y-0.5">
                {preview.sampleDates.map((d, i) => (
                  <div key={i} className="flex gap-2">
                    <span className="font-mono">{d.raw}</span>
                    <span>→</span>
                    <span className={cn("font-medium", d.parsed ? "text-foreground" : "text-destructive")}>
                      {d.parsed ? formatDate(d.parsed, { day: "numeric", month: "long", year: "numeric" }) : "not understood"}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {!preview.dateOrderConfident && (
              <p className="text-[11px] text-warning">
                Every date in this file could be read either way. Check the examples above against your
                statement before continuing.
              </p>
            )}
          </div>

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

          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => { setStep("format"); setPreview(null); }}>
              Back
            </Button>
            <Button className="flex-1" onClick={proceedToReview} disabled={busy}>
              {busy ? "Reading…" : <>Continue — read {preview.count} rows <ChevronRight size={14} className="ml-1" /></>}
            </Button>
          </div>
        </div>
      )}

      {/* STEP 3 — REVIEW */}
      {step === "review" && (
        <>
          <div className="bg-card rounded-2xl border border-hairline shadow-card p-4 space-y-3">
            <h2 className="font-semibold">Review and import</h2>
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

            {skipped.length > 0 && (
              <div className="text-xs bg-warning/10 rounded-lg p-2 space-y-1">
                <p className="flex items-center gap-1.5 font-medium text-warning">
                  <AlertTriangle size={13} /> {skipped.length} row{skipped.length === 1 ? "" : "s"} could not be read
                </p>
                <ul className="text-muted-foreground space-y-0.5 max-h-24 overflow-y-auto">
                  {skipped.slice(0, 8).map((s, i) => <li key={i}>Line {s.line}: {s.reason}</li>)}
                  {skipped.length > 8 && <li>…and {skipped.length - 8} more</li>}
                </ul>
              </div>
            )}

            <div className="flex gap-2 flex-wrap">
              <Button size="sm" variant="outline" onClick={() => setPending((s) => s.map((p) => ({ ...p, selected: true })))}>All</Button>
              <Button size="sm" variant="outline" onClick={() => setPending((s) => s.map((p) => ({ ...p, selected: false })))}>None</Button>
              <Button size="sm" variant="outline" onClick={() => setPending((s) => s.map((p) => ({ ...p, isVague: true })))}>All vague</Button>
              <Button size="sm" variant="outline" onClick={() => setPending((s) => s.map((p) => ({ ...p, isVague: false })))}>None vague</Button>
              <div className="flex-1" />
              <Button size="sm" variant="outline" onClick={() => setStep("preview")}>Back</Button>
              <Button size="sm" onClick={importNow}>Import {stats.selected}</Button>
            </div>
          </div>

          {pending.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-10">
              Nothing new to import — every row in this file is already recorded.
            </p>
          )}

          <div className="space-y-2">
            {pending.map((p, i) => {
              const isIn = p.amount > 0;
              // All categories of the right direction are offered, grouped by
              // their default profile — filing a household-default category
              // against the personal profile is a legitimate thing to want.
              const choices = categories.filter((c) => (isIn ? c.type === "income" : c.type !== "income"));
              return (
                <div key={p.key} className={cn("bg-card border border-hairline rounded-xl shadow-card p-3 space-y-2",
                  p.selected ? "border-border" : "border-border/30 opacity-50")}>
                  <div className="flex items-center gap-2">
                    <Checkbox checked={p.selected} onCheckedChange={(v) => patch(i, { selected: !!v })} />
                    <MerchantLogo payee={p.payee} size={28} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{p.payee || p.description || "—"}</p>
                      <p className="text-[11px] text-muted-foreground truncate">
                        {formatDate(p.date, { day: "numeric", month: "short", year: "numeric" })}
                        {p.description && p.payee ? ` · ${p.description}` : ""}
                      </p>
                    </div>
                    <div className={cn("text-right font-semibold text-sm flex items-center gap-0.5 tabular-nums",
                      isIn ? "text-income" : "text-expense")}>
                      {isIn ? <ArrowDownLeft size={12} /> : <ArrowUpRight size={12} />}
                      {Math.abs(p.amount).toFixed(2)}
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <Select value={p.profile} onValueChange={(v) => patch(i, { profile: v as ProfileId })}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="household">Household</SelectItem>
                        <SelectItem value="personal">Personal</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={p.categoryId} onValueChange={(v) => patch(i, { categoryId: v, matched: false })}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {choices.length === 0
                          ? <div className="px-2 py-1.5 text-xs text-muted-foreground">No {isIn ? "income" : "expense"} categories</div>
                          : choices.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.name} <span className="text-muted-foreground">· {profileLabel(c.profileDefault)}</span>
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                    <div className="flex items-center gap-1.5">
                      <Switch checked={p.isVague} onCheckedChange={(v) => patch(i, { isVague: !!v })} />
                      <span className="text-[10px] text-muted-foreground">Vague</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    {p.matched === "rule" ? (
                      <p className="text-[10px] text-success flex items-center gap-1"><Sparkles size={10} /> Matched by rule</p>
                    ) : p.matched === "merchant" ? (
                      <p className="text-[10px] text-primary flex items-center gap-1"><Eye size={10} /> Recognised store</p>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <Checkbox checked={p.saveRule} onCheckedChange={(v) => patch(i, { saveRule: !!v })} id={`r-${i}`} />
                        <Label htmlFor={`r-${i}`} className="text-[10px] text-muted-foreground">Remember as rule:</Label>
                        <Input className="h-5 text-[10px] w-24" value={p.ruleKeyword}
                          onChange={(e) => patch(i, { ruleKeyword: e.target.value })} />
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

function MappingRow({ label, col }: { label: string; col: string | null }) {
  return (
    <div className="flex items-baseline gap-1.5 min-w-0">
      <span className="text-muted-foreground flex-shrink-0">{label}</span>
      <span className={cn("font-medium truncate", col ? "text-foreground" : "text-destructive")}>
        {col ?? "not found"}
      </span>
    </div>
  );
}

function Stat({ label, value, icon, color }: { label: string; value: string; icon?: React.ReactNode; color?: string }) {
  return (
    <div className="bg-secondary rounded-lg p-2 text-center">
      <p className="text-muted-foreground text-[10px] uppercase tracking-wide flex items-center justify-center gap-1">{icon}{label}</p>
      <p className={cn("font-semibold text-xs mt-0.5 tabular-nums", color)}>{value}</p>
    </div>
  );
}
