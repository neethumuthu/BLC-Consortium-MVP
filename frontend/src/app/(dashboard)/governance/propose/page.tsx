"use client";

import { useActionState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { proposeMemberAction, type ProposeMemberState } from "@/actions/institutions";

const initialState: ProposeMemberState = {};

export default function ProposeMemberPage() {
  const [state, formAction, pending] = useActionState(proposeMemberAction, initialState);

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <Link href="/governance" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" />
        Back to governance
      </Link>
      <Card>
        <CardHeader>
          <CardTitle>Propose a New Member Institution</CardTitle>
          <CardDescription>
            Submit a candidate institution for the consortium to vote on. Every other active institution will need
            to cast a vote before this is decided.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={formAction} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="applicantId">Applicant institution ID (MSP ID)</Label>
              <Input id="applicantId" name="applicantId" placeholder="InstitutionCMSP" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="applicantName">Applicant institution name</Label>
              <Input id="applicantName" name="applicantName" placeholder="Institution C" required />
            </div>

            {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? "Submitting..." : "Submit Proposal"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
