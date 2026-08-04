"use client";

import { useActionState } from "react";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { changeCredentialAction, type ChangeCredentialState } from "@/actions/credential";

const initialState: ChangeCredentialState = {};

export default function SettingsPage() {
  const [state, formAction, pending] = useActionState(changeCredentialAction, initialState);

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <div className="flex items-center gap-3">
        <KeyRound className="size-6 text-primary" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
          <p className="text-sm text-muted-foreground">Manage this institution&apos;s backend credential</p>
        </div>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Change Credential</CardTitle>
          <CardDescription>
            Rotates the shared credential this institution&apos;s backend uses to authenticate every request.
            Takes effect immediately.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {state.success ? (
            <p className="text-sm text-primary">Credential updated successfully.</p>
          ) : (
            <form action={formAction} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="currentCredential">Current credential</Label>
                <Input id="currentCredential" name="currentCredential" type="password" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="newCredential">New credential</Label>
                <Input id="newCredential" name="newCredential" type="password" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmCredential">Confirm new credential</Label>
                <Input id="confirmCredential" name="confirmCredential" type="password" required />
              </div>

              {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
              <Button type="submit" className="w-full" disabled={pending}>
                {pending ? "Updating..." : "Update Credential"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
