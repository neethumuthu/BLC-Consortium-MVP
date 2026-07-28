"use client";

import { useActionState, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { issueCertificateAction, type IssueCertificateState } from "@/actions/certificates";

const initialState: IssueCertificateState = {};

interface MetadataRow {
  id: number;
  key: string;
  value: string;
}

export default function IssueCertificatePage() {
  const [state, formAction, pending] = useActionState(issueCertificateAction, initialState);
  const [rows, setRows] = useState<MetadataRow[]>([]);
  const nextId = useRef(0);

  function addRow() {
    setRows((current) => [...current, { id: nextId.current++, key: "", value: "" }]);
  }

  function updateRow(id: number, field: "key" | "value", newValue: string) {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, [field]: newValue } : row)));
  }

  function removeRow(id: number) {
    setRows((current) => current.filter((row) => row.id !== id));
  }

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <Link href="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" />
        Back to dashboard
      </Link>
      <Card>
        <CardHeader>
          <CardTitle>Issue a Certificate</CardTitle>
          <CardDescription>Create a new certificate on behalf of your institution.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={formAction} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="holderName">Holder name</Label>
              <Input id="holderName" name="holderName" placeholder="Jane Doe" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="holderDetails">Holder details</Label>
              <Textarea
                id="holderDetails"
                name="holderDetails"
                placeholder="e.g. Completed the Advanced Data Science course, June 2026"
                required
              />
            </div>

            <div className="space-y-2">
              <Label>Additional details (optional)</Label>
              <p className="text-xs text-muted-foreground">
                Add any extra fields you&apos;d like to record on this certificate, e.g. a grade or course ID.
              </p>
              <div className="space-y-2">
                {rows.map((row) => (
                  <div key={row.id} className="flex items-center gap-2">
                    <Input
                      name="metadataKey"
                      value={row.key}
                      onChange={(event) => updateRow(row.id, "key", event.target.value)}
                      placeholder="Field name (e.g. Grade)"
                      className="flex-1"
                    />
                    <Input
                      name="metadataValue"
                      value={row.value}
                      onChange={(event) => updateRow(row.id, "value", event.target.value)}
                      placeholder="Value (e.g. A)"
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeRow(row.id)}
                      aria-label="Remove field"
                    >
                      <X className="size-4" />
                    </Button>
                  </div>
                ))}
              </div>
              <Button type="button" variant="outline" size="sm" onClick={addRow}>
                <Plus className="size-4" />
                Add field
              </Button>
            </div>

            {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? "Issuing..." : "Issue Certificate"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
