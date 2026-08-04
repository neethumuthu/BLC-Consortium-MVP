"use server";

import { requireSession } from "@/lib/session";
import { backendFetch, BackendError } from "@/lib/backend";
import { humanizeBackendError } from "@/lib/error-messages";
import { setCredentialOverride } from "@/lib/credential-override-store";

export interface ChangeCredentialState {
  error?: string;
  success?: boolean;
}

export async function changeCredentialAction(
  _prevState: ChangeCredentialState,
  formData: FormData,
): Promise<ChangeCredentialState> {
  const session = await requireSession();

  const currentCredential = String(formData.get("currentCredential") ?? "");
  const newCredential = String(formData.get("newCredential") ?? "");
  const confirmCredential = String(formData.get("confirmCredential") ?? "");

  if (!currentCredential || !newCredential) {
    return { error: "Current and new credential are both required." };
  }
  if (newCredential !== confirmCredential) {
    return { error: "New credential and confirmation do not match." };
  }

  try {
    await backendFetch(session.institutionId, "/auth/credential", {
      method: "POST",
      body: JSON.stringify({ currentCredential, newCredential }),
    });
  } catch (error) {
    if (error instanceof BackendError) {
      return { error: humanizeBackendError(error.message) };
    }
    throw error;
  }

  // Only after the backend confirms the rotation succeeded - flipping
  // the frontend's override first would lock this institution out for
  // real if the backend then rejected the change.
  setCredentialOverride(session.institutionId, newCredential);

  return { success: true };
}
