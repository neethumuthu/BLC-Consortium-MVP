import { Search, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/status-badge";
import { HashDisplay } from "@/components/hash-display";
import { MetadataList } from "@/components/metadata-list";
import { Separator } from "@/components/ui/separator";
import { requireSession } from "@/lib/session";
import { backendFetch, BackendError } from "@/lib/backend";
import { humanizeBackendError } from "@/lib/error-messages";
import { displayNameFor } from "@/lib/institutions";
import { formatDate } from "@/lib/format";
import type { VerificationResult } from "@/lib/types";

const OUTCOME_COPY: Record<VerificationResult["status"], string> = {
  VALID: "This certificate is authentic and has not been tampered with.",
  TAMPERED: "This certificate's data does not match its original hash - it may have been altered.",
  REVOKED: "This certificate is authentic, but has been revoked by its issuer.",
};

export default async function VerifyCertificatePage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const session = await requireSession();
  const { id } = await searchParams;

  let result: VerificationResult | undefined;
  let error: string | undefined;

  if (id) {
    try {
      result = await backendFetch<VerificationResult>(
        session.institutionId,
        `/certificates/${id}/verification`,
      );
    } catch (err) {
      error = err instanceof BackendError ? humanizeBackendError(err.message) : "Something went wrong while verifying this certificate.";
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Verify a Certificate</CardTitle>
          <CardDescription>Enter a certificate ID to check whether it&apos;s valid, tampered, or revoked.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex gap-2">
            <Input name="id" defaultValue={id} placeholder="Certificate ID" required />
            <Button type="submit">
              <Search className="size-4" />
              Verify
            </Button>
          </form>
        </CardContent>
      </Card>

      {error ? (
        <div className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          <AlertTriangle className="size-5 shrink-0" />
          {error}
        </div>
      ) : null}

      {result ? (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Verification Result</CardTitle>
              <StatusBadge status={result.status} />
            </div>
            <CardDescription>{OUTCOME_COPY[result.status]}</CardDescription>
            <HashDisplay label="Certificate ID" value={result.certificate.certificateId} />
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Separator />
            <div className="grid grid-cols-[140px_1fr] gap-y-2">
              <span className="text-muted-foreground">Holder</span>
              <span>{result.certificate.holderName}</span>
              <span className="text-muted-foreground">Details</span>
              <span>{result.certificate.holderDetails}</span>
              <span className="text-muted-foreground">Issued by</span>
              <span>{displayNameFor(result.certificate.issuerId)}</span>
              <span className="text-muted-foreground">Issued on</span>
              <span>{formatDate(result.certificate.issuedAt)}</span>
              {result.certificate.status === "revoked" ? (
                <>
                  <span className="text-muted-foreground">Revoked on</span>
                  <span>{result.certificate.revokedAt ? formatDate(result.certificate.revokedAt) : "-"}</span>
                  <span className="text-muted-foreground">Revocation reason</span>
                  <span>{result.certificate.revokedReason}</span>
                </>
              ) : null}
            </div>

            {result.certificate.metadata && Object.keys(result.certificate.metadata).length > 0 ? (
              <>
                <Separator />
                <div className="space-y-2">
                  <p className="font-medium">Additional metadata</p>
                  <MetadataList metadata={result.certificate.metadata} />
                </div>
              </>
            ) : null}

            <Separator />
            <HashDisplay label="Certificate hash" value={result.certificate.certificateHash} />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
