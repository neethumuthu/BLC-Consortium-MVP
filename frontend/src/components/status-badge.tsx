import { CheckCircle2, XCircle, Ban, Clock3, CircleDot } from "lucide-react";
import { cn } from "@/lib/utils";

type Tone = "green" | "red" | "amber" | "yellow" | "gray";

const TONE_CLASSES: Record<Tone, string> = {
  green: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-400 dark:border-emerald-900",
  red: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-400 dark:border-red-900",
  amber: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-400 dark:border-amber-900",
  yellow: "bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-950 dark:text-yellow-400 dark:border-yellow-900",
  gray: "bg-muted text-muted-foreground border-border",
};

interface StatusConfig {
  label: string;
  tone: Tone;
  icon: React.ComponentType<{ className?: string }>;
}

// Covers every status string this app ever renders: certificate.status
// ("active"/"revoked"), verification.status ("VALID"/"TAMPERED"/
// "REVOKED"), and institution.status ("active", observed value only).
const STATUS_MAP: Record<string, StatusConfig> = {
  valid: { label: "Valid", tone: "green", icon: CheckCircle2 },
  active: { label: "Active", tone: "green", icon: CheckCircle2 },
  tampered: { label: "Tampered", tone: "red", icon: XCircle },
  revoked: { label: "Revoked", tone: "amber", icon: Ban },
  pending: { label: "Pending", tone: "yellow", icon: Clock3 },
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const key = status.toLowerCase();
  const config = STATUS_MAP[key] ?? { label: status, tone: "gray" as Tone, icon: CircleDot };
  const Icon = config.icon;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
        TONE_CLASSES[config.tone],
        className,
      )}
    >
      <Icon className="size-3.5" />
      {config.label}
    </span>
  );
}
