import Link from "next/link";
import { ArrowLeft, AlertTriangle, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { HashDisplay } from "@/components/hash-display";
import { MetadataList } from "@/components/metadata-list";
import { Separator } from "@/components/ui/separator";
import { requireSession } from "@/lib/session";
import { backendFetch, BackendError } from "@/lib/backend";
import { humanizeBackendError } from "@/lib/error-messages";
import { displayNameFor } from "@/lib/institutions";
import { formatDate } from "@/lib/format";
import type { Certificate } from "@/lib/types";
import { IssuedToast } from "./issued-toast";
import { RevokeSection } from "./revoke-section";

export default async function CertificateDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;

  let certificate: Certificate | undefined;
  let error: string | undefined;

  try {
    certificate = await backendFetch<Certificate>(session.institutionId, `/certificates/${encodeURIComponent(id)}`);
  } catch (err) {
    error = err instanceof BackendError ? humanizeBackendError(err.message) : "Something went wrong loading this certificate.";
  }

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <IssuedToast />
      <Link href="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" />
        Back to dashboard
      </Link>

      {error ? (
        <div className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          <AlertTriangle className="size-5 shrink-0" />
          {error}
        </div>
      ) : certificate ? (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>{certificate.holderName}</CardTitle>
              <StatusBadge status={certificate.status} />
            </div>
            <HashDisplay label="Certificate ID" value={certificate.certificateId} />
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-[140px_1fr] gap-y-2 text-sm">
              <span className="text-muted-foreground">Details</span>
              <span>{certificate.holderDetails}</span>
              <span className="text-muted-foreground">Issued by</span>
              <span>{displayNameFor(certificate.issuerId)}</span>
              <span className="text-muted-foreground">Issued on</span>
              <span>{formatDate(certificate.issuedAt)}</span>
              <span className="text-muted-foreground">Consortium #</span>
              <span>{certificate.consortiumNumber}</span>
              <span className="text-muted-foreground">Issuer Seq #</span>
              <span>{certificate.issuerSequenceNumber}</span>
              {certificate.status === "revoked" ? (
                <>
                  <span className="text-muted-foreground">Revoked on</span>
                  <span>{certificate.revokedAt ? formatDate(certificate.revokedAt) : "-"}</span>
                  <span className="text-muted-foreground">Reason</span>
                  <span>{certificate.revokedReason}</span>
                </>
              ) : null}
            </div>

            {certificate.metadata && Object.keys(certificate.metadata).length > 0 ? (
              <>
                <Separator />
                <div className="space-y-2">
                  <p className="text-sm font-medium">Additional metadata</p>
                  <MetadataList metadata={certificate.metadata} />
                </div>
              </>
            ) : null}

            <Separator />
            <HashDisplay label="Certificate hash" value={certificate.certificateHash} />
            <Separator />

            <div className="flex flex-wrap items-center gap-3">
              <Button
                render={<Link href={`/certificates/verify?id=${certificate.certificateId}`} />}
                nativeButton={false}
                variant="outline"
              >
                <ShieldCheck className="size-4" />
                Run full verification
              </Button>
              {session.institutionId === certificate.issuerId && certificate.status === "active" ? (
                <RevokeSection certificateId={certificate.certificateId} />
              ) : null}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
