import { useEffect, useMemo, useState } from "react";
import { useApp } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Plus, Pencil, Trash2, ChevronLeft, ChevronRight } from "lucide-react";
import { uid } from "@/lib/db";
import { MerchantLogo } from "@/components/MerchantLogo";
import type { ProfileId, Subscription } from "@/lib/types";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

export default function BillsPage() {
  const { subscriptions, categories, settings, upsertSubscription, deleteSubscription } = useApp();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Subscription | null>(null);
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  // All subs for current profile (active and inactive both shown in list)
  const allSubs = useMemo(
    () => subscriptions.filter(s => settings.activeProfile === "combined" || s.profile === settings.activeProfile),
    [subscriptions, settings.activeProfile]
  );

  // Only active subs for calendar display and totals
  const activeSubs = useMemo(() => allSubs.filter(s => s.active), [allSubs]);
  const total = activeSubs.reduce((sum, s) => sum + s.expectedAmount, 0);
  const catMap = useMemo(() => new Map(categories.map(c => [c.id, c])), [categories]);

  // Calendar grid
  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1).getDay();
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  const today = new Date();

  const subsByDay = useMemo(() => {
    const m = new Map<number, typeof activeSubs>();
    for (const s of activeSubs) {
      const day = Math.min(s.dueDay, daysInMonth);
      m.set(day, [...(m.get(day) || []), s]);
    }
    return m;
  }, [activeSubs, daysInMonth]);

  return (
    <div className="space-y-4">
      {/* Month nav + calendar */}
      <div className="flex items-center justify-between">
        <button className="p-2 rounded-full bg-secondary" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><ChevronLeft size={16} /></button>
        <p className="font-semibold">{month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</p>
        <button className="p-2 rounded-full bg-secondary" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><ChevronRight size={16} /></button>
      </div>

      <div className="bg-card rounded-2xl border border-border p-2">
        <div className="grid grid-cols-7 text-[10px] text-center text-muted-foreground font-medium pb-1">
          {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d => <div key={d}>{d}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((d, i) => {
            const isToday = d === today.getDate() && today.getMonth() === month.getMonth() && today.getFullYear() === month.getFullYear();
            const isPayday = d != null && settings.paydays.includes(d);
            const billsHere = d != null ? subsByDay.get(d) || [] : [];
            return (
              <div key={i} className={cn("aspect-square rounded-lg border text-[11px] p-1 flex flex-col gap-0.5",
                d == null ? "border-transparent" : "border-border", isToday && "border-primary bg-primary/5")}>
                {d != null && (
                  <div className="flex justify-between items-center">
                    <span className={cn("font-semibold", isToday && "text-primary")}>{d}</span>
                    {isPayday && <span className="w-1.5 h-1.5 rounded-full bg-income" title="Payday" />}
                  </div>
                )}
                <div className="flex flex-wrap gap-0.5">
                  {billsHere.map(s => (
                    <div key={s.id}
                      title={`${s.name} ${formatMoney(s.expectedAmount, settings.currency)}`}
                      className="w-full text-[9px] truncate rounded px-1 leading-tight bg-bills/20 text-bills">
                      {s.name.slice(0, 8)}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Subscriptions list */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="font-semibold">Subscriptions & Recurring Bills</h2>
          <p className="text-xs text-muted-foreground">
            {activeSubs.length} active · {formatMoney(total, settings.currency)} per month
          </p>
        </div>
        <Button size="sm" onClick={() => { setEditing(null); setOpen(true); }}>
          <Plus size={16} className="mr-1" /> Add
        </Button>
      </div>

      <p className="text-xs text-muted-foreground bg-card border border-border rounded-2xl p-3">
        Active subscriptions are automatically deducted from your "Left to spend" each month.
        Toggle a subscription off if you cancel it.
      </p>

      {allSubs.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">No subscriptions yet. Tap "Add" to create one.</p>
      ) : (
        <div className="bg-card rounded-2xl border border-border divide-y divide-border">
          {allSubs.map(s => {
            const c = catMap.get(s.categoryId);
            return (
              <div key={s.id} className={cn("p-3 flex items-center gap-3", !s.active && "opacity-50")}>
                <Switch
                  checked={s.active}
                  onCheckedChange={(v) => upsertSubscription({ ...s, active: v })}
                  aria-label="Active"
                />
                <MerchantLogo payee={s.name} size={32} />
                <button onClick={() => { setEditing(s); setOpen(true); }} className="flex-1 min-w-0 text-left">
                  <p className="font-medium">{s.name}</p>
                  <p className="text-xs text-muted-foreground">
                    Due day {s.dueDay} · {c?.name || "—"} · {s.profile === "household" ? "Household" : "Personal"}
                  </p>
                </button>
                <p className="font-semibold">{formatMoney(s.expectedAmount, settings.currency)}</p>
                <button onClick={() => { setEditing(s); setOpen(true); }} className="text-muted-foreground p-1" aria-label="Edit"><Pencil size={14} /></button>
                <button onClick={() => { if (confirm(`Delete "${s.name}"?`)) deleteSubscription(s.id); }} className="text-muted-foreground p-1" aria-label="Delete"><Trash2 size={14} /></button>
              </div>
            );
          })}
        </div>
      )}

      <SubDialog open={open} onOpenChange={setOpen} editing={editing} />
    </div>
  );
}

function SubDialog({ open, onOpenChange, editing }: {
  open: boolean; onOpenChange: (b: boolean) => void; editing: Subscription | null;
}) {
  const { categories, settings, upsertSubscription } = useApp();
  const [name, setName] = useState("");
  const [dueDay, setDueDay] = useState(1);
  const [expectedAmount, setExpectedAmount] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [profile, setProfile] = useState<ProfileId>("household");
  const [active, setActive] = useState(true);
  const [error, setError] = useState("");

  // Categories filtered by chosen profile (and excluding income — bills are outflows)
  const filteredCats = useMemo(
    () => categories.filter(c => c.type !== "income" && c.profileDefault === profile),
    [categories, profile]
  );

  useEffect(() => {
    if (!open) return;
    setError("");
    if (editing) {
      setName(editing.name); setDueDay(editing.dueDay);
      setExpectedAmount(String(editing.expectedAmount));
      setCategoryId(editing.categoryId); setProfile(editing.profile); setActive(editing.active);
    } else {
      setName(""); setDueDay(1); setExpectedAmount("");
      const startProfile: ProfileId = settings.activeProfile === "combined" ? "household" : settings.activeProfile;
      setProfile(startProfile);
      const defaultCat = categories.find(c => c.type === "bills" && c.profileDefault === startProfile)
        || categories.find(c => c.type !== "income" && c.profileDefault === startProfile);
      setCategoryId(defaultCat?.id || "");
      setActive(true);
    }
  }, [open, editing, categories, settings.activeProfile]);

  // Reset category when profile changes (if current cat doesn't match new profile)
  useEffect(() => {
    if (!open) return;
    const cur = categories.find(c => c.id === categoryId);
    if (cur && cur.profileDefault === profile) return;
    const defaultCat = categories.find(c => c.type === "bills" && c.profileDefault === profile)
      || filteredCats[0];
    setCategoryId(defaultCat?.id || "");
  }, [profile, open]);

  async function save() {
    if (!name.trim()) { setError("Please enter a name"); return; }
    if (!categoryId) { setError("Please select a category"); return; }
    const amt = parseFloat(expectedAmount);
    if (!amt || isNaN(amt) || amt <= 0) { setError("Please enter a positive amount"); return; }
    const day = Math.max(1, Math.min(31, dueDay || 1));
    await upsertSubscription({
      id: editing?.id || uid(), name: name.trim(),
      dueDay: day, expectedAmount: amt,
      categoryId, profile, active,
    });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{editing ? "Edit" : "Add"} subscription</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Name</Label><Input value={name} onChange={e => setName(e.target.value)} placeholder="Netflix" /></div>

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

          <div>
            <Label>Category</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
              <SelectContent>
                {filteredCats.length === 0 ? (
                  <div className="px-2 py-1.5 text-xs text-muted-foreground">
                    No categories for {profile} — add one in Settings
                  </div>
                ) : (
                  filteredCats.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Due day (1–31)</Label>
              <Input type="number" min={1} max={31} value={dueDay} onChange={e => setDueDay(parseInt(e.target.value) || 1)} />
            </div>
            <div>
              <Label>Amount per month</Label>
              <Input type="number" step="0.01" min="0" value={expectedAmount} onChange={e => setExpectedAmount(e.target.value)} placeholder="0.00" />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Switch checked={active} onCheckedChange={setActive} id="active" />
            <Label htmlFor="active" className="text-sm font-normal">
              Active — include this in monthly budget calculations
            </Label>
          </div>

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
