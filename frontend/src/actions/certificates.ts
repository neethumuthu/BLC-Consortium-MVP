"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/session";
import { backendFetch, BackendError } from "@/lib/backend";
import { humanizeBackendError } from "@/lib/error-messages";
import type { Certificate } from "@/lib/types";

export interface IssueCertificateState {
  error?: string;
}

export async function issueCertificateAction(
  _prevState: IssueCertificateState,
  formData: FormData,
): Promise<IssueCertificateState> {
  const session = await requireSession();

  const holderName = String(formData.get("holderName") ?? "").trim();
  const holderDetails = String(formData.get("holderDetails") ?? "").trim();

  if (!holderName || !holderDetails) {
    return { error: "Holder name and holder details are both required." };
  }

  // Metadata comes in as parallel arrays from the field-builder UI (one
  // "Field name" + "Field value" input pair per row), not raw JSON text -
  // rows with no field name are silently skipped.
  const metadataKeys = formData.getAll("metadataKey").map(String);
  const metadataValues = formData.getAll("metadataValue").map(String);
  const metadata: Record<string, unknown> = {};
  metadataKeys.forEach((key, index) => {
    const trimmedKey = key.trim();
    if (trimmedKey) {
      metadata[trimmedKey] = metadataValues[index] ?? "";
    }
  });

  let certificate: Certificate;
  try {
    certificate = await backendFetch<Certificate>(session.institutionId, "/certificates", {
      method: "POST",
      body: JSON.stringify({
        holderName,
        holderDetails,
        metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
      }),
    });
  } catch (error) {
    if (error instanceof BackendError) {
      return { error: humanizeBackendError(error.message) };
    }
    throw error;
  }

  revalidatePath("/");
  redirect(`/certificates/${certificate.certificateId}?issued=true`);
}

export interface RevokeCertificateState {
  error?: string;
  success?: boolean;
}

export async function revokeCertificateAction(
  _prevState: RevokeCertificateState,
  formData: FormData,
): Promise<RevokeCertificateState> {
  const session = await requireSession();
  const certificateId = String(formData.get("certificateId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();

  if (!certificateId) {
    return { error: "Missing certificate ID." };
  }
  if (!reason) {
    return { error: "Please provide a reason for the revocation." };
  }

  try {
    await backendFetch<Certificate>(session.institutionId, `/certificates/${encodeURIComponent(certificateId)}/revoke`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    });
  } catch (error) {
    if (error instanceof BackendError) {
      return { error: humanizeBackendError(error.message) };
    }
    throw error;
  }

  revalidatePath(`/certificates/${certificateId}`);
  revalidatePath("/");
  return { success: true };
}
