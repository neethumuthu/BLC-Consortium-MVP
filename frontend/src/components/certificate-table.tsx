import Link from "next/link";
import { FileText } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/empty-state";
import { formatDate } from "@/lib/format";
import type { Certificate } from "@/lib/types";

export function CertificateTable({
  certificates,
  showIssueAction = true,
}: {
  certificates: Certificate[];
  /** False on read-only views of another institution's certificates (e.g.
   * institutions/[id]/page.tsx) - you can't issue on another institution's
   * behalf, so offering that action there would be misleading. */
  showIssueAction?: boolean;
}) {
  if (certificates.length === 0) {
    return (
      <EmptyState
        icon={FileText}
        title="No certificates issued yet"
        description={
          showIssueAction
            ? "Once you issue your first certificate, it will show up here."
            : "This institution hasn't issued any certificates yet."
        }
        actionHref={showIssueAction ? "/certificates/new" : undefined}
        actionLabel={showIssueAction ? "Issue your first certificate" : undefined}
      />
    );
  }

  return (
    // Table already wraps itself in its own overflow-x-auto scroll
    // container (ui/table.tsx) - this outer div only clips that
    // scrolling content to the rounded border, it doesn't scroll itself.
    <div className="overflow-hidden rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Holder</TableHead>
            <TableHead>Consortium #</TableHead>
            <TableHead>Issuer Seq #</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Issued</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {certificates.map((cert) => (
            <TableRow key={cert.certificateId} className="cursor-pointer">
              <TableCell className="font-medium">
                <Link href={`/certificates/${cert.certificateId}`} className="hover:underline">
                  {cert.holderName}
                </Link>
              </TableCell>
              <TableCell>{cert.consortiumNumber}</TableCell>
              <TableCell>{cert.issuerSequenceNumber}</TableCell>
              <TableCell>
                <StatusBadge status={cert.status} />
              </TableCell>
              <TableCell className="text-muted-foreground">{formatDate(cert.issuedAt)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
