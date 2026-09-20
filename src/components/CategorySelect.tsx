import { useMemo } from "react";
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { PROFILE_META } from "@/lib/profiles";
import type { Category, ProfileId } from "@/lib/types";

/** The small pill that says which world a thing belongs to. */
export function ProfileTag({
  profile, size = "sm", className,
}: { profile: ProfileId; size?: "xs" | "sm"; className?: string }) {
  const meta = PROFILE_META[profile];
  const Icon = meta.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full font-semibold whitespace-nowrap",
        meta.chip,
        size === "xs" ? "text-[9.5px] px-1.5 py-0.5" : "text-[10.5px] px-2 py-0.5",
        className
      )}
    >
      <Icon size={size === "xs" ? 9 : 11} strokeWidth={2.5} />
      {meta.label}
    </span>
  );
}

const PROFILE_ORDER: ProfileId[] = ["household", "personal"];

/**
 * One category picker for the whole app.
 *
 * Three things every caller used to get wrong on its own:
 *
 *  - **Scope.** The CSV importer offered every category regardless of the
 *    profile chosen on the row, so picking "Personal" still listed the
 *    household categories. Passing `profile` restricts the list to that world.
 *  - **Order.** Categories came out in insert order, so the list changed shape
 *    as you added to it. They are sorted alphabetically inside each group.
 *  - **Legibility.** Each profile gets a highlighted heading in its own colour
 *    and its items are tinted to match, so it is never ambiguous which
 *    "Groceries" you are about to pick.
 */
export function CategorySelect({
  categories,
  value,
  onChange,
  profile,
  placeholder = "Select a category…",
  className,
  id,
}: {
  /** Already narrowed by direction (income vs outflow) by the caller. */
  categories: Category[];
  value: string;
  onChange: (id: string) => void;
  /** When given, only this profile's categories are offered. */
  profile?: ProfileId;
  placeholder?: string;
  className?: string;
  id?: string;
}) {
  const groups = useMemo(() => {
    const scoped = profile ? categories.filter((c) => c.profileDefault === profile) : categories;
    return PROFILE_ORDER
      .map((p) => ({
        profile: p,
        items: scoped
          .filter((c) => c.profileDefault === p)
          .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" })),
      }))
      .filter((g) => g.items.length > 0);
  }, [categories, profile]);

  const selected = categories.find((c) => c.id === value);

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id} className={className}>
        {/* The trigger shows the profile's colour too, so the chosen value is
            as identifiable as the list it came from. */}
        {selected ? (
          <span className="flex items-center gap-2 min-w-0">
            <span className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0", PROFILE_META[selected.profileDefault].dot)} />
            <span className="truncate">{selected.name}</span>
          </span>
        ) : (
          <SelectValue placeholder={placeholder} />
        )}
      </SelectTrigger>

      <SelectContent>
        {groups.length === 0 ? (
          <div className="px-2 py-3 text-xs text-muted-foreground text-center">
            No categories here yet — add one in Settings.
          </div>
        ) : (
          groups.map((g) => {
            const meta = PROFILE_META[g.profile];
            const Icon = meta.icon;
            return (
              <SelectGroup key={g.profile}>
                {/* A band, not a faint label: this is the divider between the
                    two worlds and it has to be impossible to miss. */}
                <div
                  className={cn(
                    "flex items-center gap-1.5 px-2 py-1.5 my-1 rounded-md text-[10px] font-bold uppercase tracking-[0.1em]",
                    meta.band
                  )}
                >
                  <Icon size={11} strokeWidth={2.5} />
                  {meta.label}
                  <span className="ml-auto font-semibold opacity-70 tabular-nums">{g.items.length}</span>
                </div>
                {g.items.map((c) => (
                  <SelectItem key={c.id} value={c.id} className="pl-7">
                    <span className="flex items-center gap-2 min-w-0">
                      <span className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0", meta.dot)} />
                      <span className="truncate">{c.name}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectGroup>
            );
          })
        )}
      </SelectContent>
    </Select>
  );
}
