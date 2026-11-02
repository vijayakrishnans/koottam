"use client";

import * as React from "react";
import type { ReportReason, ReportSubject } from "@saas/contracts/social";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { wrap } from "@/lib/api";
import { useSession } from "@/lib/session";

const REASONS: Array<{ value: ReportReason; label: string }> = [
  { value: "harassment", label: "Harassment or bullying" },
  { value: "hate", label: "Hate" },
  { value: "sexual", label: "Sexual content" },
  { value: "violence", label: "Violence or threats" },
  { value: "spam", label: "Spam" },
  { value: "child_safety", label: "A child's safety" },
  { value: "illegal", label: "Something illegal" },
  { value: "other", label: "Something else" },
];

export function ReportButton({ subjectType, subjectId }: { subjectType: ReportSubject; subjectId: string }) {
  const { client } = useSession();
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState<ReportReason>("harassment");
  const [details, setDetails] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const r = await wrap(() => client.social.report({ subjectType, subjectId, reason, details }));
    setBusy(false);
    if (r.ok) {
      setOpen(false);
      setDetails("");
      toast({ kind: "success", title: "Report sent", description: "A moderator will look at it. The person isn't told who reported them." });
    } else {
      toast({ kind: "error", title: "Couldn't send your report", description: r.error.message });
    }
  };

  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>Report</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Report this</DialogTitle>
            <DialogDescription>A moderator will see this. If someone is in immediate danger, contact your local emergency services.</DialogDescription>
          </DialogHeader>
          <form className="space-y-3" onSubmit={send}>
            <div className="space-y-1.5">
              <Label htmlFor="report-reason">What's wrong?</Label>
              <select
                id="report-reason"
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={reason}
                onChange={(e) => setReason(e.target.value as ReportReason)}
              >
                {REASONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="report-details">Anything else? (optional)</Label>
              <textarea
                id="report-details"
                rows={3}
                maxLength={1000}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={details}
                onChange={(e) => setDetails(e.target.value)}
              />
            </div>
            <Button type="submit" disabled={busy}>{busy ? "Sending…" : "Send report"}</Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
