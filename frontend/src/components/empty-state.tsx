import type { ComponentType } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

interface EmptyStateProps {
  icon: ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  actionHref?: string;
  actionLabel?: string;
}

export function EmptyState({ icon: Icon, title, description, actionHref, actionLabel }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-16 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-muted">
        <Icon className="size-6 text-muted-foreground" />
      </div>
      <div className="space-y-1">
        <p className="font-medium">{title}</p>
        {description ? <p className="max-w-sm text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actionHref && actionLabel ? (
        <Button render={<Link href={actionHref} />} nativeButton={false} className="mt-2">
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}
