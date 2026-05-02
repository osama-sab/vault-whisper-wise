import { useState } from "react";
import { useApp } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { uid } from "@/lib/db";
import type { ProfileId, Subscription } from "@/lib/types";
import { formatMoney } from "@/lib/format";

export default function SubscriptionsPage() {
  const { subscriptions, categories, settings, upsertSubscription, deleteSubscription } = useApp();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Subscription | null>(null);

  const list = subscriptions.filter(
    (s) => settings.activeProfile === "combined" || s.profile === settings.activeProfile
  );
  const total = list.filter((s) => s.active).reduce((sum, s) => sum + s.expectedAmount, 0);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="font-semibold">Subscriptions</h2>
          <p className="text-xs text-muted-foreground">Total active: {formatMoney(total, settings.currency)}/mo</p>
        </div>
        <Button size="sm" onClick={() => { setEditing(null); setOpen(true); }}>
          <Plus size={16} className="mr-1" /> Add
        </Button>
      </div>

      {list.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">No subscriptions yet.</p>
      ) : (
        <div className="bg-card rounded-2xl border border-border divide-y divide-border">
          {list.map((s) => {
            const c = categories.find((cc) => cc.id === s.categoryId);
            return (
              <div key={s.id} className="p-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className={"font-medium " + (s.active ? "" : "text-muted-foreground line-through")}>{s.name}</p>
                  <p className="text-xs text-muted-foreground">
                    Day {s.dueDay} · {c?.name || "—"} · {s.profile}
                  </p>
                </div>
                <p className="font-semibold">{formatMoney(s.expectedAmount, settings.currency)}</p>
                <button onClick={() => { setEditing(s); setOpen(true); }} className="text-muted-foreground p-1">
                  <Pencil size={14} />
                </button>
                <button
                  onClick={() => { if (confirm("Delete subscription?")) deleteSubscription(s.id); }}
                  className="text-muted-foreground p-1"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <SubDialog open={open} onOpenChange={setOpen} editing={editing} />
    </div>
  );
}

function SubDialog({
  open,
  onOpenChange,
  editing,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  editing: Subscription | null;
}) {
  const { categories, upsertSubscription } = useApp();
  const [name, setName] = useState("");
  const [dueDay, setDueDay] = useState(1);
  const [expectedAmount, setExpectedAmount] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [profile, setProfile] = useState<ProfileId>("household");
  const [active, setActive] = useState(true);

  // sync when opened
  useState(() => {});
  if (open && editing && name === "") {
    // populate once
  }

  // simpler: useEffect would be cleaner but keep here
  useEffectOnce(open, () => {
    if (editing) {
      setName(editing.name);
      setDueDay(editing.dueDay);
      setExpectedAmount(String(editing.expectedAmount));
      setCategoryId(editing.categoryId);
      setProfile(editing.profile);
      setActive(editing.active);
    } else {
      setName(""); setDueDay(1); setExpectedAmount("");
      setCategoryId(categories.find((c) => c.type === "bills")?.id || categories[0]?.id || "");
      setProfile("household"); setActive(true);
    }
  });

  async function save() {
    if (!name || !categoryId) return;
    await upsertSubscription({
      id: editing?.id || uid(),
      name,
      dueDay: Math.max(1, Math.min(31, dueDay)),
      expectedAmount: parseFloat(expectedAmount) || 0,
      categoryId,
      profile,
      active,
    });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{editing ? "Edit" : "Add"} subscription</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Netflix" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Due day</Label>
              <Input type="number" min={1} max={31} value={dueDay} onChange={(e) => setDueDay(parseInt(e.target.value) || 1)} />
            </div>
            <div>
              <Label>Expected</Label>
              <Input type="number" step="0.01" value={expectedAmount} onChange={(e) => setExpectedAmount(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Category</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Profile</Label>
              <Select value={profile} onValueChange={(v) => setProfile(v as ProfileId)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="household">Household</SelectItem>
                  <SelectItem value="personal">Personal</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={active} onCheckedChange={setActive} id="active" />
            <Label htmlFor="active" className="text-sm font-normal">Active</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import { useEffect, useRef } from "react";
function useEffectOnce(open: boolean, fn: () => void) {
  const last = useRef(false);
  useEffect(() => {
    if (open && !last.current) {
      fn();
    }
    last.current = open;
  }, [open]); // eslint-disable-line
}