import Link from "next/link";
import { AlertTriangle, Vote, UserPlus } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/empty-state";
import { requireSession } from "@/lib/session";
import { backendFetch, BackendError } from "@/lib/backend";
import { humanizeBackendError } from "@/lib/error-messages";
import { displayNameFor } from "@/lib/institutions";
import type { MembershipProposal } from "@/lib/types";
import { VoteButtons } from "./vote-buttons";
import { ProposedToast } from "./proposed-toast";

export default async function GovernancePage() {
  const session = await requireSession();

  let proposals: MembershipProposal[] = [];
  let error: string | undefined;

  try {
    proposals = await backendFetch<MembershipProposal[]>(session.institutionId, "/institutions/proposals");
  } catch (err) {
    error = err instanceof BackendError ? humanizeBackendError(err.message) : "Something went wrong loading open proposals.";
  }

  return (
    <div className="space-y-6">
      <ProposedToast />
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Vote className="size-6 text-primary" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Governance</h1>
            <p className="text-sm text-muted-foreground">Open membership proposals awaiting a vote</p>
          </div>
        </div>
        <Button render={<Link href="/governance/propose" />} nativeButton={false}>
          <UserPlus className="size-4" />
          Propose New Member
        </Button>
      </div>

      {error ? (
        <div className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          <AlertTriangle className="size-5 shrink-0" />
          {error}
        </div>
      ) : proposals.length === 0 ? (
        <EmptyState
          icon={Vote}
          title="No open proposals"
          description="There are no membership proposals currently awaiting a vote."
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Applicant</TableHead>
                <TableHead>Proposed By</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Votes</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {proposals.map((proposal) => {
                const isOwnApplication = proposal.applicantId === session.institutionId;
                return (
                  <TableRow key={proposal.proposalId}>
                    <TableCell className="font-medium">{proposal.applicantName}</TableCell>
                    <TableCell className="text-muted-foreground">{displayNameFor(proposal.proposedBy)}</TableCell>
                    <TableCell>
                      <StatusBadge status={proposal.status} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {proposal.votesFor} for / {proposal.votesAgainst} against (of {proposal.totalEligibleVoters})
                    </TableCell>
                    <TableCell className="text-right">
                      {isOwnApplication ? (
                        <span className="text-xs text-muted-foreground">Your own application</span>
                      ) : (
                        <VoteButtons proposalId={proposal.proposalId} />
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
