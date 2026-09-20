import { useEffect, useMemo, useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { CategorySelect } from "@/components/CategorySelect";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useApp } from "@/lib/store";
import { uid } from "@/lib/db";
import type { ProfileId, Transaction } from "@/lib/types";
import { todayISO } from "@/lib/format";
import { Plus, Trash2, ArrowDownLeft, ArrowUpRight } from "lucide-react";

interface SplitRow { amount: number; categoryId: string; profile: ProfileId; }

function normalizePayee(s: string) { return s.toLowerCase().replace(/\s+/g, " ").trim(); }

function buildPayeeDict(transactions: Transaction[]): Map<string, string> {
  const counts = new Map<string, Map<string, number>>();
  for (const t of transactions) {
    if (!t.payee) continue;
    const key = normalizePayee(t.payee);
    if (!counts.has(key)) counts.set(key, new Map());
    const spellings = counts.get(key)!;
    spellings.set(t.payee, (spellings.get(t.payee) || 0) + 1);
  }
  const dict = new Map<string, string>();
  for (const [, spellings] of counts) {
    let best = ""; let bestCount = 0;
    for (const [spelling, count] of spellings) {
      if (count > bestCount) { best = spelling; bestCount = count; }
    }
    dict.set(normalizePayee(best), best);
  }
  return dict;
}

export default function TransactionDialog({ open, onOpenChange, editing }: {
  open: boolean; onOpenChange: (b: boolean) => void; editing: Transaction | null;
}) {
  const { categories, transactions, settings, upsertTransaction, bulkAddTransactions } = useApp();
  const [direction, setDirection] = useState<"in"|"out">("out");
  const [profile, setProfile] = useState<ProfileId>("household");
  const [date, setDate] = useState(todayISO());
  const [amount, setAmount] = useState<string>("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [payee, setPayee] = useState("");
  const [description, setDescription] = useState("");
  const [isVague, setIsVague] = useState(false);
  const [splitMode, setSplitMode] = useState(false);
  const [splits, setSplits] = useState<SplitRow[]>([]);
  const [showSugg, setShowSugg] = useState(false);
  const [error, setError] = useState("");
  const payeeRef = useRef<HTMLDivElement>(null);

  const payeeDict = useMemo(() => buildPayeeDict(transactions), [transactions]);
  const suggestions = useMemo(() => {
    if (!payee || payee.length < 2) return [];
    const norm = normalizePayee(payee);
    const out: string[] = [];
    for (const [key, canonical] of payeeDict) {
      if (key.includes(norm) && canonical.toLowerCase() !== payee.toLowerCase()) out.push(canonical);
    }
    return out.slice(0, 5);
  }, [payee, payeeDict]);

  // Categories filtered by BOTH direction and profile
  const filteredCats = useMemo(() => {
    return categories.filter(c => {
      if (direction === "in" && c.type !== "income") return false;
      if (direction === "out" && c.type === "income") return false;
      return c.profileDefault === profile;
    });
  }, [categories, direction, profile]);

  useEffect(() => {
    if (!open) return;
    setError("");
    if (editing) {
      const cat = categories.find(c => c.id === editing.categoryId);
      setDirection(cat?.type === "income" ? "in" : "out");
      setProfile(editing.profile);
      setDate(editing.date); setAmount(String(Math.abs(editing.amount)));
      setCategoryId(editing.categoryId);
      setPayee(editing.payee); setDescription(editing.description);
      setIsVague(editing.isVague); setSplitMode(false); setSplits([]);
    } else {
      setDirection("out");
      setProfile(settings.activeProfile === "combined" ? "household" : settings.activeProfile);
      setDate(todayISO()); setAmount("");
      setCategoryId(""); setPayee("");
      setDescription(""); setIsVague(false); setSplitMode(false); setSplits([]);
    }
    setShowSugg(false);
  }, [open, editing, categories, settings.activeProfile]);

  // Reset category when direction or profile changes (if current cat doesn't match)
  useEffect(() => {
    if (!open) return;
    const cur = categories.find(c => c.id === categoryId);
    const matchesDir = cur && ((cur.type === "income") === (direction === "in"));
    const matchesProfile = cur && cur.profileDefault === profile;
    if (matchesDir && matchesProfile) return;
    setCategoryId(filteredCats[0]?.id || "");
  }, [direction, profile, open]);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (payeeRef.current && !payeeRef.current.contains(e.target as Node)) setShowSugg(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  function addSplit() { setSplits(s => [...s, { amount: 0, categoryId: filteredCats[0]?.id || "", profile }]); }

  async function save() {
    setError("");
    const amt = parseFloat(amount);
    if (!amt || isNaN(amt) || amt <= 0) { setError("Please enter a positive amount"); return; }
    if (!splitMode && !categoryId) { setError("Please select a category"); return; }

    const cat = categories.find(c => c.id === categoryId);
    const display = isVague ? cat?.genericLabel || "" : "";
    let finalPayee = payee;
    const nk = normalizePayee(payee);
    if (payeeDict.has(nk)) finalPayee = payeeDict.get(nk)!;

    if (splitMode) {
      if (splits.length === 0) { setError("Please add at least one split"); return; }
      const sum = splits.reduce((s, r) => s + (r.amount || 0), 0);
      if (Math.abs(sum - amt) > 0.01) { setError(`Splits sum to ${sum.toFixed(2)} but total is ${amt.toFixed(2)}`); return; }
      const groupId = uid();
      await bulkAddTransactions(splits.map(s => ({
        id: uid(), date, amount: s.amount, categoryId: s.categoryId, profile: s.profile,
        payee: finalPayee, description,
        displayDescription: isVague ? categories.find(c => c.id === s.categoryId)?.genericLabel : undefined,
        isVague, splitGroupId: groupId,
      })));
    } else {
      await upsertTransaction({
        id: editing?.id || uid(), date, amount: amt, categoryId, profile,
        payee: finalPayee, description, displayDescription: display || undefined,
        isVague, splitGroupId: editing?.splitGroupId,
      });
    }
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{editing ? "Edit transaction" : "Add transaction"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {/* Step 1: Direction */}
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setDirection("in")}
              className={"flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-medium border transition-colors " +
                (direction === "in" ? "bg-emerald-50 dark:bg-emerald-950 border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300" : "border-border text-muted-foreground hover:bg-secondary")}>
              <ArrowDownLeft size={16} /> Money In
            </button>
            <button type="button" onClick={() => setDirection("out")}
              className={"flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-medium border transition-colors " +
                (direction === "out" ? "bg-red-50 dark:bg-red-950 border-red-300 dark:border-red-700 text-red-700 dark:text-red-300" : "border-border text-muted-foreground hover:bg-secondary")}>
              <ArrowUpRight size={16} /> Money Out
            </button>
          </div>

          {/* Step 2: Profile (drives category filter) */}
          {!splitMode && (
            <div>
              <Label>Profile</Label>
              <Select value={profile} onValueChange={v => setProfile(v as ProfileId)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="household">Household</SelectItem>
                  <SelectItem value="personal">Personal</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Step 3: Category (filtered by direction + profile) */}
          {!splitMode && (
            <div>
              <Label>Category</Label>
              <CategorySelect
                categories={filteredCats}
                profile={profile}
                value={categoryId}
                onChange={setCategoryId}
                placeholder={`No ${direction === "in" ? "income" : "expense"} categories for ${profile}`}
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div><Label>Date</Label><Input type="date" value={date} onChange={e => setDate(e.target.value)} /></div>
            <div><Label>Amount</Label><Input type="number" step="0.01" min="0" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" /></div>
          </div>

          <div ref={payeeRef} className="relative">
            <Label>Payee</Label>
            <Input value={payee} onChange={e => { setPayee(e.target.value); setShowSugg(true); }} onFocus={() => setShowSugg(true)} placeholder="e.g. REWE" autoComplete="off" />
            {showSugg && suggestions.length > 0 && (
              <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border border-border rounded-lg shadow-lg overflow-hidden">
                {suggestions.map(s => (
                  <button key={s} type="button" className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors"
                    onClick={() => { setPayee(s); setShowSugg(false); }}>{s}</button>
                ))}
              </div>
            )}
          </div>

          <div><Label>Description</Label><Input value={description} onChange={e => setDescription(e.target.value)} placeholder="optional" /></div>

          <div className="flex items-center gap-2">
            <Checkbox id="vague" checked={isVague} onCheckedChange={v => setIsVague(!!v)} />
            <Label htmlFor="vague" className="text-sm font-normal">Make vague — store only generic category label</Label>
          </div>

          {!editing && (
            <div className="flex items-center gap-2">
              <Checkbox id="split" checked={splitMode} onCheckedChange={v => { setSplitMode(!!v); if (v && splits.length === 0) addSplit(); }} />
              <Label htmlFor="split" className="text-sm font-normal">Split across categories / profiles</Label>
            </div>
          )}

          {splitMode && (
            <div className="space-y-2 border border-border rounded-xl p-3">
              {splits.map((row, i) => {
                const rowCats = categories.filter(c => {
                  if (direction === "in" && c.type !== "income") return false;
                  if (direction === "out" && c.type === "income") return false;
                  return c.profileDefault === row.profile;
                });
                return (
                  <div key={i} className="grid grid-cols-[1fr_1fr_80px_28px] gap-2 items-center">
                    <Select value={row.profile} onValueChange={v => setSplits(s => s.map((r, j) => j === i ? { ...r, profile: v as ProfileId, categoryId: "" } : r))}>
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="household">Household</SelectItem><SelectItem value="personal">Personal</SelectItem></SelectContent>
                    </Select>
                    <Select value={row.categoryId} onValueChange={v => setSplits(s => s.map((r, j) => j === i ? { ...r, categoryId: v } : r))}>
                      <SelectTrigger className="h-9"><SelectValue placeholder="Category" /></SelectTrigger>
                      <SelectContent>{rowCats.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                    </Select>
                    <Input type="number" step="0.01" min="0" value={row.amount || ""} onChange={e => setSplits(s => s.map((r, j) => j === i ? { ...r, amount: parseFloat(e.target.value) || 0 } : r))} className="h-9" />
                    <button className="text-muted-foreground hover:text-destructive" onClick={() => setSplits(s => s.filter((_, j) => j !== i))}><Trash2 size={14} /></button>
                  </div>
                );
              })}
              <div className="flex justify-between items-center pt-1">
                <Button size="sm" variant="outline" onClick={addSplit}><Plus size={14} className="mr-1" /> Add split</Button>
                <p className="text-xs text-muted-foreground">Σ {splits.reduce((s, r) => s + (r.amount || 0), 0).toFixed(2)} / {(parseFloat(amount) || 0).toFixed(2)}</p>
              </div>
            </div>
          )}

          {error && <p className="text-sm text-destructive font-medium">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
