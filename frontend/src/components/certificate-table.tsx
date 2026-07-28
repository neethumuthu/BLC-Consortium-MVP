import Link from "next/link";
import { FileText } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/empty-state";
import { formatDate } from "@/lib/format";
import type { Certificate } from "@/lib/types";

export function CertificateTable({ certificates }: { certificates: Certificate[] }) {
  if (certificates.length === 0) {
    return (
      <EmptyState
        icon={FileText}
        title="No certificates issued yet"
        description="Once you issue your first certificate, it will show up here."
        actionHref="/certificates/new"
        actionLabel="Issue your first certificate"
      />
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
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
