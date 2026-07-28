import Link from "next/link";
import { Plus, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CertificateTable } from "@/components/certificate-table";
import { requireSession } from "@/lib/session";
import { backendFetch, BackendError } from "@/lib/backend";
import { humanizeBackendError } from "@/lib/error-messages";
import type { Certificate } from "@/lib/types";

export default async function DashboardPage() {
  const session = await requireSession();

  let certificates: Certificate[] = [];
  let loadError: string | undefined;

  try {
    certificates = await backendFetch<Certificate[]>(
      session.institutionId,
      `/institutions/${session.institutionId}/certificates`,
    );
  } catch (error) {
    loadError = error instanceof BackendError ? humanizeBackendError(error.message) : "Something went wrong loading your certificates.";
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{session.displayName}</h1>
          <p className="text-sm text-muted-foreground">Certificates issued by your institution</p>
        </div>
        <Button render={<Link href="/certificates/new" />} nativeButton={false}>
          <Plus className="size-4" />
          Issue Certificate
        </Button>
      </div>

      {loadError ? (
        <div className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          <AlertTriangle className="size-5 shrink-0" />
          {loadError}
        </div>
      ) : (
        <CertificateTable certificates={certificates} />
      )}
    </div>
  );
}
