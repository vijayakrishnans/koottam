"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CopyButton } from "@/components/ui/copy-button";
import { useToast } from "@/components/ui/toast";
import { wrap } from "@/lib/api";
import { qk, useApiQuery } from "@/lib/query";
import { useSession } from "@/lib/session";

export default function InvitesPage() {
  const { client } = useSession();
  const { toast } = useToast();
  const invites = useApiQuery(qk.socialInvites(), () => wrap(() => client.social.listInvites()));
  const [link, setLink] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const create = async () => {
    setBusy(true);
    const r = await wrap(() => client.social.createInvite());
    setBusy(false);
    if (!r.ok) {
      toast({ kind: "error", title: "Couldn't create an invite", description: r.error.message });
      return;
    }
    setLink(`${window.location.origin}/join#${r.data.code}`);
    invites.reload();
  };

  const revoke = async (id: string) => {
    const r = await wrap(() => client.social.revokeInvite(id));
    if (!r.ok) toast({ kind: "error", title: "Couldn't cancel it", description: r.error.message });
    invites.reload();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Invites</CardTitle>
        <CardDescription>Each link lets one person join, for 30 days. You'll only see a link once, right after you create it.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button onClick={create} disabled={busy}>{busy ? "Creating…" : "Create an invite link"}</Button>
        {link && (
          <div className="flex items-center gap-2 rounded-md border p-2">
            <code className="min-w-0 flex-1 break-all text-xs">{link}</code>
            <CopyButton value={link} />
          </div>
        )}
        <ul className="divide-y text-sm">
          {invites.data?.invites.map((i) => (
            <li key={i.id} className="flex items-center justify-between gap-2 py-2">
              <span>
                Created {new Date(i.createdAt).toLocaleDateString()} · <span className="capitalize">{i.status}</span>
              </span>
              {i.status === "open" && (
                <Button variant="ghost" size="sm" onClick={() => revoke(i.id)}>Cancel</Button>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
