"use client";

import * as React from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import type { ReportAction, ReportItem } from "@saas/contracts/social";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { wrap } from "@/lib/api";
import { qk, useApiQuery } from "@/lib/query";
import { useSession } from "@/lib/session";

const REASON_LABEL: Record<ReportItem["reason"], string> = {
  harassment: "Harassment",
  hate: "Hate",
  sexual: "Sexual content",
  violence: "Violence",
  spam: "Spam",
  child_safety: "Child safety",
  illegal: "Illegal",
  other: "Other",
};

export default function ModerationPage() {
  const { client } = useSession();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const reports = useApiQuery(qk.socialReports(), () => wrap(() => client.social.openReports()));
  const [busy, setBusy] = React.useState(false);
  const [confirmSuspend, setConfirmSuspend] = React.useState<ReportItem | null>(null);

  const resolve = async (id: string, action: ReportAction) => {
    setBusy(true);
    const r = await wrap(() => client.social.resolveReport(id, action));
    if (!r.ok) toast({ kind: "error", title: "That didn't work", description: r.error.message });
    await queryClient.invalidateQueries({ queryKey: qk.socialReports() });
    setBusy(false);
  };

  if (reports.error) return <p className="text-sm text-muted-foreground">There's nothing here.</p>;
  const items = reports.data?.reports ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Moderation</CardTitle>
        <CardDescription>Open reports, with child safety first and then oldest first. Resolving one erases its copy of the content.</CardDescription>
      </CardHeader>
      <CardContent>
        {reports.data && items.length === 0 && <p className="text-sm text-muted-foreground">No open reports.</p>}
        <ul className="divide-y">
          {items.map((r) => (
            <li key={r.id} className="space-y-2 py-4 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Badge>{REASON_LABEL[r.reason]}</Badge>
                <span className="capitalize text-muted-foreground">{r.subjectType}</span>
                <span className="text-xs text-muted-foreground">{new Date(r.createdAt).toLocaleString()}</span>
              </div>
              <p className="text-muted-foreground">
                By {r.owner ? <Link className="text-primary hover:underline" href={`/u/${r.owner.handle}`}>{r.owner.displayName}</Link> : "unknown"}
                {" · reported by "}
                {r.reporter ? <Link className="text-primary hover:underline" href={`/u/${r.reporter.handle}`}>{r.reporter.displayName}</Link> : "unknown"}
              </p>
              <blockquote className="whitespace-pre-wrap break-words border-l-2 pl-3">{r.snapshot}</blockquote>
              {r.details && <p className="break-words text-muted-foreground">Note: {r.details}</p>}
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" disabled={busy} onClick={() => resolve(r.id, "dismiss")}>Dismiss</Button>
                {r.subjectType !== "person" && (
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => resolve(r.id, "remove")}>Remove</Button>
                )}
                {r.owner && (
                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => setConfirmSuspend(r)}>Suspend {r.owner.displayName}</Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
      <ConfirmDialog
        open={confirmSuspend !== null}
        onOpenChange={(open) => !open && setConfirmSuspend(null)}
        title={`Suspend ${confirmSuspend?.owner?.displayName ?? "this person"}?`}
        description="They lose access at once, and their page and everything they've written stops showing. The reported item is removed for good."
        confirmLabel="Suspend"
        destructive
        onConfirm={async () => {
          if (confirmSuspend) await resolve(confirmSuspend.id, "suspend");
          setConfirmSuspend(null);
        }}
      />
    </Card>
  );
}
