"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

function truncateMiddle(value: string, keep = 8): string {
  if (value.length <= keep * 2 + 3) return value;
  return `${value.slice(0, keep)}...${value.slice(-keep)}`;
}

export function HashDisplay({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="flex items-center gap-2">
      {label ? <span className="text-sm text-muted-foreground">{label}</span> : null}
      <code className="rounded bg-muted px-2 py-1 font-mono text-xs">{truncateMiddle(value)}</code>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-6"
        onClick={handleCopy}
        aria-label="Copy full value"
      >
        {copied ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5" />}
      </Button>
    </div>
  );
}
