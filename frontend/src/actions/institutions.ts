"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/session";
import { backendFetch, BackendError } from "@/lib/backend";
import { humanizeBackendError } from "@/lib/error-messages";
import type { MembershipProposal } from "@/lib/types";

export interface ProposeMemberState {
  error?: string;
}

export async function proposeMemberAction(
  _prevState: ProposeMemberState,
  formData: FormData,
): Promise<ProposeMemberState> {
  const session = await requireSession();

  const applicantId = String(formData.get("applicantId") ?? "").trim();
  const applicantName = String(formData.get("applicantName") ?? "").trim();

  if (!applicantId || !applicantName) {
    return { error: "Applicant ID and applicant name are both required." };
  }

  let proposal: MembershipProposal;
  try {
    proposal = await backendFetch<MembershipProposal>(session.institutionId, "/institutions/proposals", {
      method: "POST",
      body: JSON.stringify({ applicantId, applicantName }),
    });
  } catch (error) {
    if (error instanceof BackendError) {
      return { error: humanizeBackendError(error.message) };
    }
    throw error;
  }

  revalidatePath("/governance");
  redirect(`/governance?proposed=${proposal.proposalId}`);
}

export interface CastVoteState {
  error?: string;
  success?: boolean;
}

export async function castVoteAction(
  _prevState: CastVoteState,
  formData: FormData,
): Promise<CastVoteState> {
  const session = await requireSession();
  const proposalId = String(formData.get("proposalId") ?? "");
  const decision = String(formData.get("decision") ?? "");

  if (!proposalId || (decision !== "yes" && decision !== "no")) {
    return { error: "Missing proposal ID or vote decision." };
  }

  try {
    await backendFetch<MembershipProposal>(
      session.institutionId,
      `/institutions/proposals/${encodeURIComponent(proposalId)}/vote`,
      { method: "POST", body: JSON.stringify({ decision }) },
    );
  } catch (error) {
    if (error instanceof BackendError) {
      // Revalidate even on rejection, not just success: a double-vote
      // rejection in particular should surface as "you already voted
      // yes/no" (read back from the now-refetched proposal's own
      // callerVoteDecision), not a generic error string - see
      // governance-vote-status's design.md.
      revalidatePath("/governance");
      return { error: humanizeBackendError(error.message) };
    }
    throw error;
  }

  revalidatePath("/governance");
  return { success: true };
}
