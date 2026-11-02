"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import type { CommunityMember, MemberAction } from "@saas/contracts/social";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { wrap } from "@/lib/api";
import { qk, useApiQuery } from "@/lib/query";
import { useSession } from "@/lib/session";

function memberActions(m: CommunityMember, iAmOwner: boolean): Array<{ action: MemberAction; label: string }> {
  if (m.role === "owner") return [];
  if (m.status === "pending") return [{ action: "approve", label: "Approve" }, { action: "ban", label: "Refuse" }];
  if (m.status === "banned") return [{ action: "unban", label: "Lift ban" }];
  const actions: Array<{ action: MemberAction; label: string }> = [];
  if (m.role !== "moderator" || iAmOwner) actions.push({ action: "ban", label: "Ban" });
  if (iAmOwner) {
    actions.push(
      m.role === "moderator"
        ? { action: "make-member", label: "Remove moderator" }
        : { action: "make-moderator", label: "Make moderator" },
    );
    actions.push({ action: "make-owner", label: "Hand over" });
  }
  return actions;
}

export default function CommunityPage() {
  const { slug } = useParams<{ slug: string }>();
  const { client } = useSession();
  const { toast } = useToast();
  const router = useRouter();
  const queryClient = useQueryClient();
  const community = useApiQuery(qk.socialCommunity(slug), () => wrap(() => client.social.community(slug)));
  const c = community.data?.community;
  const topics = useApiQuery(qk.socialTopics(slug), () => wrap(() => client.social.topics(slug)), { enabled: !!c?.canRead });
  const members = useApiQuery(qk.socialCommunityMembers(slug), () => wrap(() => client.social.communityMembers(slug)), { enabled: !!c?.canRead });
  const [busy, setBusy] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [body, setBody] = React.useState("");
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [handOver, setHandOver] = React.useState<string | null>(null);

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: qk.socialCommunity(slug) }),
      queryClient.invalidateQueries({ queryKey: qk.socialTopics(slug) }),
      queryClient.invalidateQueries({ queryKey: qk.socialCommunityMembers(slug) }),
    ]);

  const act = async (run: () => Promise<unknown>): Promise<boolean> => {
    setBusy(true);
    const r = await wrap(run);
    if (!r.ok) toast({ kind: "error", title: "That didn't work", description: r.error.message });
    await refresh();
    setBusy(false);
    return r.ok;
  };

  if (community.error) return <p className="text-sm text-muted-foreground">This community doesn't exist.</p>;
  if (!c) return <Skeleton className="h-40 w-full" />;

  const iAmOwner = c.myRole === "owner";
  const banned = c.myStatus === "banned";
  const pending = c.myStatus === "pending";
  const active = c.myStatus === "active";
  const waiting = members.data?.members.filter((m) => m.status === "pending") ?? [];
  const current = members.data?.members.filter((m) => m.status === "active") ?? [];
  const bannedPeople = members.data?.members.filter((m) => m.status === "banned") ?? [];

  const row = (m: CommunityMember) => (
    <li key={m.handle} className="flex flex-wrap items-center justify-between gap-2 py-2">
      <span>
        <Link className="text-primary hover:underline" href={`/u/${m.handle}`}>{m.displayName}</Link>
        {m.role !== "member" && <span className="ml-2 text-xs capitalize text-muted-foreground">{m.role}</span>}
      </span>
      {c.canModerate && (
        <span className="flex flex-wrap gap-1">
          {memberActions(m, iAmOwner).map(({ action, label }) => (
            <Button
              key={action}
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() =>
                action === "make-owner" ? setHandOver(m.handle) : act(() => client.social.memberAction(slug, m.handle, action))
              }
            >
              {label}
            </Button>
          ))}
        </span>
      )}
    </li>
  );

  return (
    <div className="grid gap-4 md:grid-cols-[1fr_20rem]">
      <div className="min-w-0 space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>{c.name}</CardTitle>
            <CardDescription>
              {c.members} {c.members === 1 ? "member" : "members"}
              {c.owner && <> · started by <Link className="text-primary hover:underline" href={`/u/${c.owner.handle}`}>{c.owner.displayName}</Link></>}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {c.description && <p className="whitespace-pre-wrap break-words text-sm">{c.description}</p>}
            {banned && <p className="text-sm text-muted-foreground">You've been banned from this community.</p>}
            {pending && <p className="text-sm text-muted-foreground">Your request to join is waiting for approval.</p>}
            <div className="flex flex-wrap gap-2">
              {!c.myStatus && (
                <Button size="sm" disabled={busy} onClick={() => act(() => client.social.joinCommunity(slug))}>
                  {c.joinPolicy === "approval" ? "Ask to join" : "Join"}
                </Button>
              )}
              {(active || pending) && !iAmOwner && (
                <Button size="sm" variant="outline" disabled={busy} onClick={() => act(() => client.social.leaveCommunity(slug))}>
                  {pending ? "Cancel request" : "Leave"}
                </Button>
              )}
              {iAmOwner && (
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => setConfirmDelete(true)}>Delete community</Button>
              )}
            </div>
          </CardContent>
        </Card>

        {c.canRead ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Forum</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {c.canPost && (
                <form
                  className="space-y-2"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (await act(() => client.social.createTopic(slug, { title, body }))) {
                      setTitle("");
                      setBody("");
                    }
                  }}
                >
                  <Input aria-label="Topic title" placeholder="Start a topic" value={title} disabled={busy} maxLength={150} onChange={(e) => setTitle(e.target.value)} />
                  <textarea
                    aria-label="Your first post"
                    rows={3}
                    maxLength={5000}
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                    placeholder="What's on your mind?"
                    value={body}
                    disabled={busy}
                    onChange={(e) => setBody(e.target.value)}
                  />
                  <Button type="submit" size="sm" disabled={busy || !title.trim() || !body.trim()}>Post topic</Button>
                </form>
              )}
              {topics.data?.topics.length === 0 && <p className="text-sm text-muted-foreground">No topics yet.</p>}
              <ul className="divide-y text-sm">
                {topics.data?.topics.map((t) => (
                  <li key={t.id} className="flex flex-wrap items-baseline justify-between gap-2 py-3">
                    <Link className="min-w-0 break-words font-medium text-primary hover:underline" href={`/topics/${t.id}`}>
                      {t.title}{t.locked ? " (locked)" : ""}
                    </Link>
                    <span className="text-xs text-muted-foreground">
                      {t.author.displayName} · {t.replies} {t.replies === 1 ? "reply" : "replies"}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="pt-6 text-sm text-muted-foreground">This community's forum is for its members.</CardContent>
          </Card>
        )}
      </div>

      {c.canRead && (
        <div className="space-y-4">
          {c.canModerate && waiting.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">Waiting to join</CardTitle></CardHeader>
              <CardContent><ul className="divide-y text-sm">{waiting.map(row)}</ul></CardContent>
            </Card>
          )}
          <Card>
            <CardHeader><CardTitle className="text-base">Members</CardTitle></CardHeader>
            <CardContent><ul className="divide-y text-sm">{current.map(row)}</ul></CardContent>
          </Card>
          {c.canModerate && bannedPeople.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">Banned</CardTitle></CardHeader>
              <CardContent><ul className="divide-y text-sm">{bannedPeople.map(row)}</ul></CardContent>
            </Card>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete ${c.name}?`}
        description="The community and its forum disappear for everyone."
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          const r = await wrap(() => client.social.deleteCommunity(slug));
          setConfirmDelete(false);
          if (r.ok) router.push("/communities");
          else toast({ kind: "error", title: "That didn't work", description: r.error.message });
        }}
      />
      <ConfirmDialog
        open={handOver !== null}
        onOpenChange={(open) => !open && setHandOver(null)}
        title="Hand over this community?"
        description="They become the owner, and you become a moderator. Only they can undo this."
        confirmLabel="Hand over"
        destructive
        onConfirm={async () => {
          if (handOver) await act(() => client.social.memberAction(slug, handOver, "make-owner"));
          setHandOver(null);
        }}
      />
    </div>
  );
}
