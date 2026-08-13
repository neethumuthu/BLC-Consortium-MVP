import Link from "next/link";
import { AlertTriangle, Building2 } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/status-badge";
import { requireSession } from "@/lib/session";
import { backendFetch, BackendError } from "@/lib/backend";
import { humanizeBackendError } from "@/lib/error-messages";
import { formatDate } from "@/lib/format";
import type { Institution } from "@/lib/types";

export default async function InstitutionsPage() {
  const session = await requireSession();

  let institutions: Institution[] = [];
  let error: string | undefined;

  try {
    institutions = await backendFetch<Institution[]>(session.institutionId, "/institutions");
  } catch (err) {
    error = err instanceof BackendError ? humanizeBackendError(err.message) : "Something went wrong loading the consortium members.";
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Building2 className="size-6 text-primary" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Consortium Members</h1>
          <p className="text-sm text-muted-foreground">Institutions that are part of the BLC consortium</p>
        </div>
      </div>

      {error ? (
        <div className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          <AlertTriangle className="size-5 shrink-0" />
          {error}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Institution</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Joined</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {institutions.map((institution) => (
                <TableRow key={institution.institutionId} className="cursor-pointer">
                  <TableCell className="font-medium">
                    <Link href={`/institutions/${institution.institutionId}`} className="hover:underline">
                      {institution.name}
                    </Link>
                  </TableCell>
                  <TableCell className="capitalize">{institution.type}</TableCell>
                  <TableCell>
                    <StatusBadge status={institution.status} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(institution.joinedAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
