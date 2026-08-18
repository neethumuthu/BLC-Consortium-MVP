import Link from "next/link";
import { ArrowLeft, AlertTriangle, Building2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import { HashDisplay } from "@/components/hash-display";
import { Separator } from "@/components/ui/separator";
import { requireSession } from "@/lib/session";
import { backendFetch, BackendError } from "@/lib/backend";
import { humanizeBackendError } from "@/lib/error-messages";
import { formatDate } from "@/lib/format";
import { displayNameFor } from "@/lib/institutions";
import type { Institution } from "@/lib/types";

export default async function InstitutionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;

  let institution: Institution | undefined;
  let error: string | undefined;

  try {
    institution = await backendFetch<Institution>(session.institutionId, `/institutions/${encodeURIComponent(id)}`);
  } catch (err) {
    error = err instanceof BackendError ? humanizeBackendError(err.message) : "Something went wrong loading this institution.";
  }

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <Link href="/institutions" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" />
        Back to consortium members
      </Link>

      {error ? (
        <div className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          <AlertTriangle className="size-5 shrink-0" />
          {error}
        </div>
      ) : institution ? (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Building2 className="size-5 text-primary" />
                {institution.name}
              </CardTitle>
              <StatusBadge status={institution.status} />
            </div>
            <HashDisplay label="Institution ID" value={institution.institutionId} />
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-[140px_1fr] gap-y-2 text-sm">
              <span className="text-muted-foreground">Type</span>
              <span className="capitalize">{institution.type}</span>
              <span className="text-muted-foreground">Joined</span>
              <span>{formatDate(institution.joinedAt)}</span>
            </div>

            {institution.approvedBy && institution.approvedBy.length > 0 ? (
              <>
                <Separator />
                <div className="space-y-2">
                  <p className="text-sm font-medium">Approved by</p>
                  <ul className="space-y-1 text-sm text-muted-foreground">
                    {institution.approvedBy.map((msp) => (
                      <li key={msp}>{displayNameFor(msp)}</li>
                    ))}
                  </ul>
                </div>
              </>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
