"use client";

import { useState, useTransition } from "react";
import { Ban } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { revokeCertificateAction } from "@/actions/certificates";

export function RevokeSection({ certificateId }: { certificateId: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [isPending, startTransition] = useTransition();

  function handleRevoke() {
    setError(undefined);
    const formData = new FormData();
    formData.set("certificateId", certificateId);
    formData.set("reason", reason);

    startTransition(async () => {
      const result = await revokeCertificateAction({}, formData);
      if (result.success) {
        toast.success("Certificate revoked.");
        setOpen(false);
        setReason("");
      } else if (result.error) {
        setError(result.error);
      }
    });
  }

  return (
    <>
      <Button variant="destructive" onClick={() => setOpen(true)}>
        <Ban className="size-4" />
        Revoke Certificate
      </Button>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke this certificate?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The certificate will permanently show as revoked, along with the reason
              you provide below.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="reason">Reason for revocation</Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="e.g. Issued in error"
              required
            />
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </div>
          <AlertDialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={handleRevoke} disabled={isPending || !reason.trim()}>
              {isPending ? "Revoking..." : "Revoke Certificate"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
