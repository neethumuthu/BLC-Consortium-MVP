"use client";

import { useState, useTransition } from "react";
import { ThumbsUp, ThumbsDown } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { castVoteAction } from "@/actions/institutions";

export function VoteButtons({ proposalId }: { proposalId: string }) {
  const [error, setError] = useState<string | undefined>();
  const [isPending, startTransition] = useTransition();

  function vote(decision: "yes" | "no") {
    setError(undefined);
    const formData = new FormData();
    formData.set("proposalId", proposalId);
    formData.set("decision", decision);

    startTransition(async () => {
      const result = await castVoteAction({}, formData);
      if (result.success) {
        toast.success(`Vote recorded: ${decision === "yes" ? "Yes" : "No"}.`);
      } else if (result.error) {
        setError(result.error);
        toast.error(result.error);
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" disabled={isPending} onClick={() => vote("yes")}>
          <ThumbsUp className="size-4" />
          Yes
        </Button>
        <Button size="sm" variant="outline" disabled={isPending} onClick={() => vote("no")}>
          <ThumbsDown className="size-4" />
          No
        </Button>
      </div>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
