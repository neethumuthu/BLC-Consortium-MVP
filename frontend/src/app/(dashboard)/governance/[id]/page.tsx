import Link from "next/link";
import { ArrowLeft, AlertTriangle, Vote, ThumbsUp, ThumbsDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import { HashDisplay } from "@/components/hash-display";
import { Separator } from "@/components/ui/separator";
import { requireSession } from "@/lib/session";
import { backendFetch, BackendError } from "@/lib/backend";
import { humanizeBackendError } from "@/lib/error-messages";
import { formatDate } from "@/lib/format";
import { displayNameFor } from "@/lib/institutions";
import type { MembershipProposal } from "@/lib/types";

export default async function ProposalDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;

  let proposal: MembershipProposal | undefined;
  let error: string | undefined;

  try {
    proposal = await backendFetch<MembershipProposal>(
      session.institutionId,
      `/institutions/proposals/${encodeURIComponent(id)}`,
    );
  } catch (err) {
    error = err instanceof BackendError ? humanizeBackendError(err.message) : "Something went wrong loading this proposal.";
  }

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <Link href="/governance" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" />
        Back to governance
      </Link>

      {error ? (
        <div className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          <AlertTriangle className="size-5 shrink-0" />
          {error}
        </div>
      ) : proposal ? (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Vote className="size-5 text-primary" />
                {proposal.applicantName}
              </CardTitle>
              <StatusBadge status={proposal.status} />
            </div>
            <HashDisplay label="Proposal ID" value={proposal.proposalId} />
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-[140px_1fr] gap-y-2 text-sm">
              <span className="text-muted-foreground">Proposed by</span>
              <span>{displayNameFor(proposal.proposedBy)}</span>
              <span className="text-muted-foreground">Votes</span>
              <span>
                {proposal.votesFor} for / {proposal.votesAgainst} against (of {proposal.totalEligibleVoters})
              </span>
              <span className="text-muted-foreground">Created</span>
              <span>{formatDate(proposal.createdAt)}</span>
              {proposal.resolvedAt ? (
                <>
                  <span className="text-muted-foreground">Resolved</span>
                  <span>{formatDate(proposal.resolvedAt)}</span>
                </>
              ) : null}
            </div>

            {proposal.applicantId !== session.institutionId ? (
              <>
                <Separator />
                <div className="text-sm">
                  {proposal.callerVoteDecision ? (
                    <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                      {proposal.callerVoteDecision === "yes" ? (
                        <ThumbsUp className="size-3.5" />
                      ) : (
                        <ThumbsDown className="size-3.5" />
                      )}
                      You voted {proposal.callerVoteDecision === "yes" ? "Yes" : "No"}
                    </span>
                  ) : proposal.status === "open" ? (
                    <span className="text-muted-foreground">
                      You haven&apos;t voted on this proposal yet — cast your vote from the{" "}
                      <Link href="/governance" className="underline hover:text-foreground">
                        governance list
                      </Link>
                      .
                    </span>
                  ) : (
                    <span className="text-muted-foreground">This proposal resolved before you voted on it.</span>
                  )}
                </div>
              </>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
