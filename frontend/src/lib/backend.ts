import "server-only";
import { findByInstitutionId } from "./institutions";
import { getCredentialOverride } from "./credential-override-store";

export class BackendError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "BackendError";
  }
}

interface BackendErrorBody {
  message?: string | string[];
}

// All backend calls happen here, server-side only. The browser never
// talks to the backend directly - this is what keeps CORS out of the
// picture entirely, since these are server-to-server requests.
export async function backendFetch<T>(institutionId: string, path: string, init?: RequestInit): Promise<T> {
  const account = findByInstitutionId(institutionId);
  if (!account) {
    throw new Error(`Unknown institution: ${institutionId}`);
  }

  const apiKey = getCredentialOverride(institutionId) ?? account.apiKey;

  let res: Response;
  try {
    res = await fetch(`${account.baseUrl}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
        ...init?.headers,
      },
      cache: "no-store",
    });
  } catch {
    throw new BackendError(503, `Unable to reach ${account.displayName}'s system right now. Please try again shortly.`);
  }

  if (!res.ok) {
    const body: BackendErrorBody = await res.json().catch(() => ({}));
    const rawMessage = Array.isArray(body.message) ? body.message.join(" ") : (body.message ?? res.statusText);
    throw new BackendError(res.status, rawMessage);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return res.json() as Promise<T>;
}
