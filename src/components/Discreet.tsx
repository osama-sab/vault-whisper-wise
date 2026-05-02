import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

/** Renders text that's blurred when discreet mode is on. Long press / hover reveals. */
export function DiscreetText({
  children,
  fallback,
  className,
}: {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  className?: string;
}) {
  const discreet = useApp((s) => s.settings.discreetMode);
  if (discreet && fallback !== undefined) {
    return <span className={className}>{fallback}</span>;
  }
  return (
    <span className={cn(discreet && "discreet-blur", className)}>
      {children}
    </span>
  );
}