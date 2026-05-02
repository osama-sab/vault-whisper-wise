import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useApp } from "@/lib/store";
import { uid } from "@/lib/db";
import type { ProfileId, Transaction } from "@/lib/types";
import { todayISO } from "@/lib/format";
import { Plus, Trash2 } from "lucide-react";

interface SplitRow {
  amount: number;
  categoryId: string;
  profile: ProfileId;
}

export default function TransactionDialog({
  open,
  onOpenChange,
  editing,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  editing: Transaction | null;
}) {
  const { categories, upsertTransaction, bulkAddTransactions } = useApp();
  const [date, setDate] = useState(todayISO());
  const [amount, setAmount] = useState<string>("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [profile, setProfile] = useState<ProfileId>("household");
  const [payee, setPayee] = useState("");
  const [description, setDescription] = useState("");
  const [isVague, setIsVague] = useState(false);
  const [splitMode, setSplitMode] = useState(false);
  const [splits, setSplits] = useState<SplitRow[]>([]);

  useEffect(() => {
    if (open) {
      if (editing) {
        setDate(editing.date);
        setAmount(String(Math.abs(editing.amount)));
        setCategoryId(editing.categoryId);
        setProfile(editing.profile);
        setPayee(editing.payee);
        setDescription(editing.description);
        setIsVague(editing.isVague);
        setSplitMode(false);
        setSplits([]);
      } else {
        setDate(todayISO());
        setAmount("");
        setCategoryId(categories[0]?.id || "");
        setProfile("household");
        setPayee("");
        setDescription("");
        setIsVague(false);
        setSplitMode(false);
        setSplits([]);
      }
    }
  }, [open, editing, categories]);

  function addSplit() {
    setSplits((s) => [...s, { amount: 0, categoryId: categories[0]?.id || "", profile: "household" }]);
  }

  async function save() {
    const amt = parseFloat(amount);
    if (!amt || isNaN(amt)) return;
    const cat = categories.find((c) => c.id === categoryId);
    const display = isVague ? cat?.genericLabel || "" : "";

    if (splitMode && splits.length > 0) {
      const sum = splits.reduce((s, r) => s + (r.amount || 0), 0);
      if (Math.abs(sum - amt) > 0.01) {
        alert(`Splits sum to ${sum.toFixed(2)} but total is ${amt.toFixed(2)}`);
        return;
      }
      const groupId = uid();
      const items: Transaction[] = splits.map((s) => ({
        id: uid(),
        date,
        amount: s.amount,
        categoryId: s.categoryId,
        profile: s.profile,
        payee,
        description,
        displayDescription: isVague ? categories.find((c) => c.id === s.categoryId)?.genericLabel : undefined,
        isVague,
        splitGroupId: groupId,
      }));
      await bulkAddTransactions(items);
    } else {
      const tx: Transaction = {
        id: editing?.id || uid(),
        date,
        amount: amt,
        categoryId,
        profile,
        payee,
        description,
        displayDescription: display || undefined,
        isVague,
        splitGroupId: editing?.splitGroupId,
      };
      await upsertTransaction(tx);
    }
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit transaction" : "Add transaction"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <Label>Amount</Label>
              <Input
                type="number"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>
          </div>

          {!splitMode && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Category</Label>
                <Select value={categoryId} onValueChange={setCategoryId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name} <span className="text-xs text-muted-foreground">({c.type})</span>
                      </SelectItem>
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
          )}

          <div>
            <Label>Payee</Label>
            <Input value={payee} onChange={(e) => setPayee(e.target.value)} placeholder="e.g. REWE" />
          </div>
          <div>
            <Label>Description</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="optional" />
          </div>

          <div className="flex items-center gap-2">
            <Checkbox id="vague" checked={isVague} onCheckedChange={(v) => setIsVague(!!v)} />
            <Label htmlFor="vague" className="text-sm font-normal">
              Make vague — store only generic category label
            </Label>
          </div>

          {!editing && (
            <div className="flex items-center gap-2">
              <Checkbox
                id="split"
                checked={splitMode}
                onCheckedChange={(v) => {
                  setSplitMode(!!v);
                  if (v && splits.length === 0) addSplit();
                }}
              />
              <Label htmlFor="split" className="text-sm font-normal">
                Split across categories / profiles
              </Label>
            </div>
          )}

          {splitMode && (
            <div className="space-y-2 border border-border rounded-xl p-3">
              {splits.map((row, i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr_80px_28px] gap-2 items-center">
                  <Select
                    value={row.categoryId}
                    onValueChange={(v) =>
                      setSplits((s) => s.map((r, j) => (j === i ? { ...r, categoryId: v } : r)))
                    }
                  >
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {categories.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={row.profile}
                    onValueChange={(v) =>
                      setSplits((s) => s.map((r, j) => (j === i ? { ...r, profile: v as ProfileId } : r)))
                    }
                  >
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="household">Household</SelectItem>
                      <SelectItem value="personal">Personal</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    step="0.01"
                    value={row.amount || ""}
                    onChange={(e) =>
                      setSplits((s) =>
                        s.map((r, j) => (j === i ? { ...r, amount: parseFloat(e.target.value) || 0 } : r))
                      )
                    }
                    className="h-9"
                  />
                  <button
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => setSplits((s) => s.filter((_, j) => j !== i))}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              <div className="flex justify-between items-center pt-1">
                <Button size="sm" variant="outline" onClick={addSplit}>
                  <Plus size={14} className="mr-1" /> Add split
                </Button>
                <p className="text-xs text-muted-foreground">
                  Σ {splits.reduce((s, r) => s + (r.amount || 0), 0).toFixed(2)} / {(parseFloat(amount) || 0).toFixed(2)}
                </p>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}