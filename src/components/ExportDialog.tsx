import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { useApp } from "@/lib/store";
import { exportReport } from "@/lib/pdf";
import type { ProfileFilter } from "@/lib/types";
import { toast } from "sonner";

export default function ExportDialog({ open, onOpenChange, currentMonth }: {
  open: boolean; onOpenChange: (b: boolean) => void; currentMonth: Date;
}) {
  const { transactions, categories, subscriptions, settings } = useApp();
  const [profile, setProfile] = useState<ProfileFilter>(settings.activeProfile);
  const [period, setPeriod] = useState<"monthly" | "yearly">("monthly");
  const [doPDF, setDoPDF] = useState(true);
  const [doCSV, setDoCSV] = useState(false);
  const [openingBalance, setOpeningBalance] = useState("0");
  const [loading, setLoading] = useState(false);

  async function run() {
    setLoading(true);
    try {
      const months: Date[] = [];
      if (period === "yearly") {
        for (let m = 0; m < 12; m++) months.push(new Date(currentMonth.getFullYear(), m, 1));
      } else {
        months.push(new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1));
      }

      const filteredTx = transactions.filter(t => {
        if (profile !== "combined" && t.profile !== profile) return false;
        const d = new Date(t.date);
        if (period === "yearly") return d.getFullYear() === currentMonth.getFullYear();
        return d.getFullYear() === currentMonth.getFullYear() && d.getMonth() === currentMonth.getMonth();
      });

      const filteredSubs = subscriptions.filter(s =>
        profile === "combined" || s.profile === profile
      );

      const formats: ("pdf" | "csv")[] = [];
      if (doPDF) formats.push("pdf");
      if (doCSV) formats.push("csv");

      if (formats.length === 0) { toast.error("Select at least one format"); setLoading(false); return; }

      await exportReport({
        months,
        transactions: filteredTx,
        categories,
        subscriptions: filteredSubs,
        discreet: settings.discreetMode,
        profile,
        currency: settings.currency,
        openingBalance: parseFloat(openingBalance) || 0,
        formats,
      });

      toast.success("Export complete");
      onOpenChange(false);
    } catch (e: any) {
      toast.error("Export failed: " + e.message);
    }
    setLoading(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Export report</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Profile</Label>
            <Select value={profile} onValueChange={v => setProfile(v as ProfileFilter)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="combined">Combined</SelectItem>
                <SelectItem value="household">Household</SelectItem>
                <SelectItem value="personal">Personal</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Period</Label>
            <Select value={period} onValueChange={v => setPeriod(v as "monthly" | "yearly")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly">
                  Monthly — {currentMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
                </SelectItem>
                <SelectItem value="yearly">
                  Yearly — {currentMonth.getFullYear()}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Opening balance</Label>
            <Input type="number" step="0.01" value={openingBalance}
              onChange={e => setOpeningBalance(e.target.value)} placeholder="0.00" />
            <p className="text-[11px] text-muted-foreground mt-1">
              Balance at the start of the period. Each month's closing balance becomes the next month's opening balance.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Formats</Label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox checked={doPDF} onCheckedChange={v => setDoPDF(!!v)} />
                <span className="text-sm">PDF report</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox checked={doCSV} onCheckedChange={v => setDoCSV(!!v)} />
                <span className="text-sm">CSV data</span>
              </label>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={run} disabled={loading}>
            {loading ? "Exporting…" : "Export"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
