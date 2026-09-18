import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { useApp } from "@/lib/store";
import { exportReport } from "@/lib/pdf";
import { isInMonth, isInYear, monthKey, profileLabel } from "@/lib/format";
import type { ProfileFilter, ProfileId } from "@/lib/types";
import { toast } from "sonner";

type Period = "monthly" | "yearly";
type Format = "pdf" | "csv" | "xlsx";

const FORMAT_LABELS: Record<Format, string> = {
  pdf: "PDF report",
  csv: "CSV data",
  xlsx: "Excel workbook",
};

export default function ExportDialog({ open, onOpenChange, currentMonth }: {
  open: boolean; onOpenChange: (b: boolean) => void; currentMonth: Date;
}) {
  const { transactions, categories, subscriptions, settings } = useApp();
  const [profile, setProfile] = useState<ProfileFilter>(settings.activeProfile);
  const [period, setPeriod] = useState<Period>("monthly");
  const [formats, setFormats] = useState<Format[]>(["pdf"]);
  const [opening, setOpening] = useState<Record<ProfileId, string>>({ household: "0", personal: "0" });
  const [loading, setLoading] = useState(false);

  // Re-seed from the live settings each time the dialog opens. The initial
  // useState value was captured when the parent mounted, so changing the
  // profile in the header left the dialog offering the old one.
  useEffect(() => {
    if (!open) return;
    setProfile(settings.activeProfile);
    setPeriod("monthly");
  }, [open, settings.activeProfile]);

  /** How many transactions the current selection would actually cover. */
  const inScope = useMemo(() => {
    return transactions.filter((t) => {
      if (profile !== "combined" && t.profile !== profile) return false;
      return period === "yearly" ? isInYear(t.date, currentMonth.getFullYear()) : isInMonth(t.date, currentMonth);
    }).length;
  }, [transactions, profile, period, currentMonth]);

  function toggleFormat(f: Format, on: boolean) {
    setFormats((s) => (on ? [...new Set([...s, f])] : s.filter((x) => x !== f)));
  }

  async function run() {
    if (formats.length === 0) { toast.error("Choose at least one file format"); return; }
    setLoading(true);
    try {
      const year = currentMonth.getFullYear();
      const months: Date[] = period === "yearly"
        ? Array.from({ length: 12 }, (_, m) => new Date(year, m, 1))
        : [new Date(year, currentMonth.getMonth(), 1)];

      const filteredTx = transactions.filter((t) => {
        if (profile !== "combined" && t.profile !== profile) return false;
        // Compared as a string prefix, matching how the report itself selects
        // months — the two used to disagree and could select different sets.
        return period === "yearly" ? isInYear(t.date, year) : isInMonth(t.date, currentMonth);
      });

      const periodLabel = period === "yearly"
        ? `${year} annual report`
        : currentMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" });
      const fileStem = `pocket-money-${profile}-${period === "yearly" ? year : monthKey(currentMonth)}`;

      await exportReport({
        months,
        transactions: filteredTx,
        categories,
        subscriptions: subscriptions.filter((s) => profile === "combined" || s.profile === profile),
        discreet: settings.discreetMode,
        profile,
        currency: settings.currency,
        openingBalances: {
          household: parseFloat(opening.household) || 0,
          personal: parseFloat(opening.personal) || 0,
        },
        formats,
        fileStem,
        periodLabel,
      });

      toast.success(`Exported ${formats.map((f) => f.toUpperCase()).join(" + ")}`);
      onOpenChange(false);
    } catch (e) {
      toast.error("Export failed: " + (e as Error).message);
    }
    setLoading(false);
  }

  const balanceFields: ProfileId[] = profile === "combined" ? ["household", "personal"] : [profile];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Export report</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Profile</Label>
            <Select value={profile} onValueChange={(v) => setProfile(v as ProfileFilter)}>
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
            <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly">
                  Monthly — {currentMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
                </SelectItem>
                <SelectItem value="yearly">Yearly — {currentMonth.getFullYear()}</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground mt-1">
              {inScope === 0
                ? "No transactions in this period yet."
                : `${inScope} transaction${inScope === 1 ? "" : "s"} in this period.${period === "yearly" ? " Months with no activity are left out." : ""}`}
            </p>
          </div>

          <div className="space-y-2">
            <Label>Opening balance</Label>
            <div className={balanceFields.length > 1 ? "grid grid-cols-2 gap-2" : ""}>
              {balanceFields.map((p) => (
                <div key={p}>
                  {balanceFields.length > 1 && (
                    <p className="text-[11px] text-muted-foreground mb-0.5">{profileLabel(p)}</p>
                  )}
                  <Input
                    type="number" step="0.01" inputMode="decimal"
                    value={opening[p]}
                    onChange={(e) => setOpening((s) => ({ ...s, [p]: e.target.value }))}
                    placeholder="0.00"
                  />
                </div>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">
              What each profile held at the start of the period. Every month's closing balance becomes the
              next month's opening balance.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Formats</Label>
            <div className="space-y-1.5">
              {(Object.keys(FORMAT_LABELS) as Format[]).map((f) => (
                <label key={f} className="flex items-center gap-2 cursor-pointer">
                  <Checkbox checked={formats.includes(f)} onCheckedChange={(v) => toggleFormat(f, !!v)} />
                  <span className="text-sm">{FORMAT_LABELS[f]}</span>
                </label>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">
              CSV saves three files — transactions, categories and balances. The Excel workbook holds the
              same three as separate sheets.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={run} disabled={loading || formats.length === 0}>
            {loading ? "Exporting…" : "Export"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
