import { useEffect, useMemo, useState } from "react";
import { useApp } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Plus, Pencil, Trash2, CalendarDays, Repeat, Check, Wallet } from "lucide-react";
import { toast } from "sonner";
import { uid } from "@/lib/db";
import { MerchantLogo } from "@/components/MerchantLogo";
import { CategorySelect } from "@/components/CategorySelect";
import type { ProfileId, Subscription } from "@/lib/types";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  Card, CardHead, MonthStepper, IconButton, FieldLabel, EmptyState, Note,
} from "@/components/ui/surface";

export default function BillsPage() {
  const {
    subscriptions, categories, settings, billPayments, accounts,
    upsertSubscription, deleteSubscription, upsertTransaction, upsertBillPayment,
  } = useApp();
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
  const isThisMonth = today.getMonth() === month.getMonth() && today.getFullYear() === month.getFullYear();

  const paymentKey = (subId: string) => `${subId}-${month.getFullYear()}-${month.getMonth()}`;
  const isPaid = (subId: string) => billPayments.some((p) => p.id === paymentKey(subId) && p.paid);

  async function markPaid(s: Subscription) {
    if (isPaid(s.id)) return;
    const day = Math.min(s.dueDay, new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate());
    const date = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const txId = uid();

    await upsertTransaction({
      id: txId,
      date,
      amount: s.expectedAmount,
      categoryId: s.categoryId,
      profile: s.profile,
      payee: s.name,
      description: "Recurring payment",
      isVague: false,
      accountId: accounts.find((a) => a.profileDefault === s.profile)?.id ?? accounts[0]?.id,
    });
    await upsertBillPayment({
      id: paymentKey(s.id),
      subscriptionId: s.id,
      year: month.getFullYear(),
      month: month.getMonth(),
      paid: true,
      actualAmount: s.expectedAmount,
      transactionId: txId,
    });
    toast.success(`${s.name} recorded for ${month.toLocaleDateString(undefined, { month: "long" })}`);
  }

  const subsByDay = useMemo(() => {
    const m = new Map<number, typeof activeSubs>();
    for (const s of activeSubs) {
      const day = Math.min(s.dueDay, daysInMonth);
      m.set(day, [...(m.get(day) || []), s]);
    }
    return m;
  }, [activeSubs, daysInMonth]);

  const paidCount = activeSubs.filter((s) => isPaid(s.id)).length;
  const paidTotal = activeSubs.filter((s) => isPaid(s.id)).reduce((sum, s) => sum + s.expectedAmount, 0);
  const outstanding = total - paidTotal;

  /** The next few bills still to land, counted from today when we are in this month. */
  const upcoming = useMemo(() => {
    const from = isThisMonth ? today.getDate() : 1;
    return activeSubs
      .filter((s) => !isPaid(s.id) && Math.min(s.dueDay, daysInMonth) >= from)
      .sort((a, b) => a.dueDay - b.dueDay)
      .slice(0, 4);
    // billPayments is read through isPaid, so it belongs in the deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSubs, billPayments, daysInMonth, isThisMonth, month]);

  const addButton = (
    <Button size="sm" className="rounded-full" onClick={() => { setEditing(null); setOpen(true); }}>
      <Plus size={15} className="mr-1" /> Add
    </Button>
  );

  return (
    <div className="space-y-4">
      {/* Scope left, action right — the same toolbar shape as every other page.
          This row used to be `justify-between` across the whole window, which
          is how the two arrows ended up at opposite edges of the screen. */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <MonthStepper month={month} onChange={setMonth} />
        {addButton}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px] items-start">
        {/* ── Calendar ───────────────────────────────── */}
        <Card>
          <CardHead
            icon={CalendarDays}
            title={month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
            hint={`${activeSubs.length} recurring ${activeSubs.length === 1 ? "bill" : "bills"} this month`}
            action={
              <span className="hidden sm:flex items-center gap-3 text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-bills" /> Bill due
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-income" /> Payday
                </span>
              </span>
            }
          />

          <div className="grid grid-cols-7 gap-1.5 mb-1.5">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
              <div key={d} className="eyebrow text-center">{d}</div>
            ))}
          </div>

          {/* Fixed-height cells in a tight grid. They used to be bordered boxes
              that stretched with the window, so a month of bills read as a
              wall of empty rectangles. */}
          <div className="grid grid-cols-7 gap-1.5">
            {cells.map((d, i) => {
              const isToday = isThisMonth && d === today.getDate();
              const isPayday = d != null && settings.paydays.includes(d);
              const billsHere = d != null ? subsByDay.get(d) || [] : [];
              const shown = billsHere.slice(0, 2);

              if (d == null) return <div key={i} className="min-h-[4.25rem]" aria-hidden />;

              return (
                <div
                  key={i}
                  className={cn(
                    "min-h-[4.25rem] rounded-xl p-1.5 flex flex-col gap-1 transition-colors",
                    billsHere.length > 0 ? "bg-bills/[0.07]" : "bg-secondary/45",
                    isToday && "ring-2 ring-primary bg-primary/[0.07]"
                  )}
                >
                  <div className="flex justify-between items-center gap-1">
                    <span
                      className={cn(
                        "text-[11px] font-semibold tabular-nums leading-none",
                        isToday
                          ? "inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground"
                          : "text-muted-foreground pl-0.5"
                      )}
                    >
                      {d}
                    </span>
                    {isPayday && <span className="w-1.5 h-1.5 rounded-full bg-income flex-shrink-0" title="Payday" />}
                  </div>

                  <div className="flex flex-col gap-0.5 min-w-0">
                    {shown.map((s) => (
                      <span
                        key={s.id}
                        title={`${s.name} · ${formatMoney(s.expectedAmount, settings.currency)}`}
                        className={cn(
                          "text-[9.5px] leading-[1.35] truncate rounded px-1 py-px",
                          isPaid(s.id)
                            ? "bg-success/15 text-success line-through decoration-1"
                            : "bg-bills/20 text-bills"
                        )}
                      >
                        {s.name}
                      </span>
                    ))}
                    {billsHere.length > shown.length && (
                      <span className="text-[9.5px] text-muted-foreground px-1">
                        +{billsHere.length - shown.length} more
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* ── The month in figures ───────────────────── */}
        <div className="space-y-3">
          <Card>
            <CardHead icon={Wallet} title="This month" />
            <div className="space-y-3">
              <div>
                <FieldLabel>Total recurring</FieldLabel>
                <p className="text-[22px] font-semibold tabular-nums tracking-tight leading-none mt-1">
                  {formatMoney(total, settings.currency)}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3 pt-3 border-t border-hairline">
                <div className="min-w-0">
                  <FieldLabel>Paid</FieldLabel>
                  <p className="text-sm font-semibold tabular-nums text-success mt-0.5 truncate">
                    {formatMoney(paidTotal, settings.currency)}
                  </p>
                  <p className="text-[10.5px] text-muted-foreground">{paidCount} of {activeSubs.length}</p>
                </div>
                <div className="min-w-0">
                  <FieldLabel>Outstanding</FieldLabel>
                  <p className="text-sm font-semibold tabular-nums text-bills mt-0.5 truncate">
                    {formatMoney(outstanding, settings.currency)}
                  </p>
                  <p className="text-[10.5px] text-muted-foreground">{activeSubs.length - paidCount} left</p>
                </div>
              </div>
            </div>
          </Card>

          <Card>
            <CardHead icon={Repeat} tone="bills" title="Next up" />
            {upcoming.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nothing else is due this month.</p>
            ) : (
              <div className="space-y-2.5">
                {upcoming.map((s) => (
                  <div key={s.id} className="flex items-center gap-2.5 min-w-0">
                    <MerchantLogo payee={s.name} size={28} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-medium truncate leading-tight">{s.name}</p>
                      <p className="text-[10.5px] text-muted-foreground">Day {s.dueDay}</p>
                    </div>
                    <p className="text-[13px] font-semibold tabular-nums flex-shrink-0">
                      {formatMoney(s.expectedAmount, settings.currency)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* ── Subscriptions ─────────────────────────────── */}
      {/* Marking a bill paid creates a REAL transaction and links it, closing
          the loop the billPayments store was designed for but never used. The
          explicit link also stops reconcileMonth's amount heuristic from
          attributing the payment to a different subscription. */}
      <Card flush>
        <div className="p-5 pb-4">
          <CardHead
            icon={Repeat}
            title="Subscriptions & recurring bills"
            hint={`${activeSubs.length} active · ${formatMoney(total, settings.currency)} per month`}
            action={addButton}
            tight
          />
        </div>

        {allSubs.length === 0 ? (
          <div className="px-5 pb-5">
            <EmptyState icon={Repeat} title="No subscriptions yet" action={addButton}>
              Add the things that leave your account on the same day each month — rent, Netflix,
              insurance — and they show up on the calendar and in your budget.
            </EmptyState>
          </div>
        ) : (
          <>
            <div className="divide-y divide-hairline border-t border-hairline">
              {allSubs.map(s => {
                const c = catMap.get(s.categoryId);
                const paid = isPaid(s.id);
                return (
                  <div
                    key={s.id}
                    className={cn(
                      "group px-5 py-3 flex items-center gap-3 transition-colors hover:bg-secondary/40",
                      !s.active && "opacity-55"
                    )}
                  >
                    <MerchantLogo payee={s.name} size={36} />

                    <button
                      onClick={() => { setEditing(s); setOpen(true); }}
                      className="flex-1 min-w-0 text-left"
                    >
                      <p className="font-medium text-[14px] truncate leading-tight">{s.name}</p>
                      <p className="text-[11.5px] text-muted-foreground truncate mt-0.5">
                        Day {s.dueDay} · {c?.name || "—"} · {s.profile === "household" ? "Household" : "Personal"}
                      </p>
                    </button>

                    <p className="font-semibold tabular-nums text-[14px] text-right flex-shrink-0 w-[5.5rem]">
                      {formatMoney(s.expectedAmount, settings.currency)}
                    </p>

                    {/* One labelled status control rather than an unlabelled
                        tick: it says what it will do, and what it did. */}
                    <div className="w-[6.25rem] flex-shrink-0 flex justify-end">
                      {s.active && (
                        paid ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-success/15 text-success text-[11px] font-semibold px-2.5 py-1">
                            <Check size={12} /> Paid
                          </span>
                        ) : (
                          <button
                            onClick={() => markPaid(s)}
                            title="Record this month's payment"
                            className="inline-flex items-center gap-1 rounded-full bg-secondary text-muted-foreground hover:bg-primary hover:text-primary-foreground text-[11px] font-semibold px-2.5 py-1 transition-colors"
                          >
                            Mark paid
                          </button>
                        )
                      )}
                    </div>

                    {/* Reserved space, so nothing shifts when they appear. */}
                    <div className="flex items-center gap-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                      <IconButton
                        className="w-8 h-8"
                        onClick={() => { setEditing(s); setOpen(true); }}
                        aria-label={`Edit ${s.name}`}
                      >
                        <Pencil size={14} />
                      </IconButton>
                      <IconButton
                        className="w-8 h-8"
                        tone="danger"
                        onClick={() => { if (confirm(`Delete "${s.name}"?`)) deleteSubscription(s.id); }}
                        aria-label={`Delete ${s.name}`}
                      >
                        <Trash2 size={14} />
                      </IconButton>
                    </div>

                    <Switch
                      checked={s.active}
                      onCheckedChange={(v) => upsertSubscription({ ...s, active: v })}
                      aria-label={`${s.name} active`}
                      className="flex-shrink-0"
                    />
                  </div>
                );
              })}
            </div>

            <div className="p-4">
              <Note>
                Active subscriptions are deducted from your “Left to spend” each month. Switch one
                off if you cancel it — the history stays.
              </Note>
            </div>
          </>
        )}
      </Card>

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
            <CategorySelect
              categories={filteredCats}
              profile={profile}
              value={categoryId}
              onChange={setCategoryId}
              placeholder={`No categories for ${profile} — add one in Settings`}
            />
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
