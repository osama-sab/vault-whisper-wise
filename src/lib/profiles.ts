import type { LucideIcon } from "lucide-react";
import { Home, User } from "lucide-react";
import type { ProfileId } from "./types";

/**
 * Household and Personal, told apart by colour rather than by reading.
 *
 * The two profiles are the app's central distinction and the only way to see
 * which one anything belonged to was the word next to it. One colour each,
 * used for nothing else, makes a category identifiable at a glance in a
 * dropdown, a list row or a settings page.
 */
export const PROFILE_META: Record<ProfileId, {
  label: string;
  icon: LucideIcon;
  text: string;
  chip: string;
  dot: string;
  /** For the highlighted heading above a group of that profile's categories. */
  band: string;
}> = {
  household: {
    label: "Household",
    icon: Home,
    text: "text-household",
    chip: "bg-household/10 text-household",
    dot: "bg-household",
    band: "bg-household/10 text-household",
  },
  personal: {
    label: "Personal",
    icon: User,
    text: "text-personal",
    chip: "bg-personal/10 text-personal",
    dot: "bg-personal",
    band: "bg-personal/10 text-personal",
  },
};
