"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import type { PublicProfile } from "@saas/contracts/social";
import { Scrapbook, Standing, Testimonials } from "@/components/social/page-panels";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { wrap } from "@/lib/api";
import { qk, useApiQuery } from "@/lib/query";
import { useSession } from "@/lib/session";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function Row({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="grid grid-cols-[8rem_1fr] gap-2 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="whitespace-pre-wrap break-words">{value}</dd>
    </div>
  );
}

function Actions({ profile, reload }: { profile: PublicProfile; reload: () => void }) {
  const { client } = useSession();
  const { toast } = useToast();
  const [busy, setBusy] = React.useState(false);
  const [confirmBlock, setConfirmBlock] = React.useState(false);
  const { handle, connection, friendRequestId } = profile;

  const act = async (run: () => Promise<unknown>) => {
    setBusy(true);
    const r = await wrap(run);
    setBusy(false);
    if (!r.ok) toast({ kind: "error", title: "That didn't work", description: r.error.message });
    reload();
  };

  return (
    <div className="flex flex-wrap gap-2">
      {connection === "none" && (
        <Button size="sm" disabled={busy} onClick={() => act(() => client.social.sendFriendRequest(handle))}>Add friend</Button>
      )}
      {connection === "request_sent" && friendRequestId && (
        <Button size="sm" variant="outline" disabled={busy} onClick={() => act(() => client.social.cancelFriendRequest(friendRequestId))}>Cancel request</Button>
      )}
      {connection === "request_received" && friendRequestId && (
        <>
          <Button size="sm" disabled={busy} onClick={() => act(() => client.social.answerFriendRequest(friendRequestId, "accept"))}>Accept</Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => act(() => client.social.answerFriendRequest(friendRequestId, "decline"))}>Decline</Button>
        </>
      )}
      {connection === "friends" && (
        <Button size="sm" variant="outline" disabled={busy} onClick={() => act(() => client.social.unfriend(handle))}>Remove friend</Button>
      )}
      <Button size="sm" variant="ghost" disabled={busy} onClick={() => setConfirmBlock(true)}>Block</Button>
      <ConfirmDialog
        open={confirmBlock}
        onOpenChange={setConfirmBlock}
        title={`Block ${profile.displayName}?`}
        description="You won't see each other anywhere on Koottam, and any friendship between you ends. They aren't told."
        confirmLabel="Block"
        destructive
        onConfirm={async () => {
          await act(() => client.social.block(handle));
          setConfirmBlock(false);
        }}
      />
    </div>
  );
}

function FriendsPanel({ handle }: { handle: string }) {
  const { client } = useSession();
  const friends = useApiQuery(qk.socialFriends(handle), () => wrap(() => client.social.friends(handle)));
  if (!friends.data || friends.data.hidden) return null;
  const { people } = friends.data;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Friends ({people.length})</CardTitle>
      </CardHeader>
      <CardContent>
        {people.length === 0 ? (
          <p className="text-sm text-muted-foreground">No friends yet.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {people.map((p) => (
              <li key={p.handle}>
                <Link className="text-primary hover:underline" href={`/u/${p.handle}`}>{p.displayName}</Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export default function ProfilePage() {
  const { handle } = useParams<{ handle: string }>();
  const { client } = useSession();
  const queryClient = useQueryClient();
  const person = useApiQuery(qk.socialPerson(handle), () => wrap(() => client.social.person(handle)));
  const reload = () => {
    void queryClient.invalidateQueries({ queryKey: qk.socialPerson(handle) });
    void queryClient.invalidateQueries({ queryKey: qk.socialFriends(handle) });
    void queryClient.invalidateQueries({ queryKey: qk.socialFriendRequests() });
    void queryClient.invalidateQueries({ queryKey: qk.socialScraps(handle) });
    void queryClient.invalidateQueries({ queryKey: qk.socialTestimonials(handle) });
    void queryClient.invalidateQueries({ queryKey: qk.socialStanding(handle) });
    void queryClient.invalidateQueries({ queryKey: qk.socialCounters() });
    void queryClient.invalidateQueries({ queryKey: qk.socialHome() });
  };

  if (person.error) {
    return <p className="text-sm text-muted-foreground">There's no one here with that handle.</p>;
  }
  if (!person.data) return <Skeleton className="h-40 w-full" />;

  const p = person.data.profile;
  const birthday = p.birthdayDay && p.birthdayMonth ? `${p.birthdayDay} ${MONTHS[p.birthdayMonth - 1]}` : null;
  const place = [p.city, p.country].filter(Boolean).join(", ") || null;

  return (
    <div className="grid gap-4 md:grid-cols-[1fr_16rem]">
    <div className="min-w-0 space-y-4">
    <Card>
      <CardHeader>
        <CardTitle>{p.displayName}</CardTitle>
        <CardDescription>
          @{p.handle}
          {!p.isMe && p.mutualFriends ? ` · ${p.mutualFriends} mutual ${p.mutualFriends === 1 ? "friend" : "friends"}` : ""}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!p.isMe && <Actions profile={p} reload={reload} />}
        {p.limited ? (
          <p className="text-sm text-muted-foreground">{p.displayName} shares this page with friends only.</p>
        ) : (
          <dl className="space-y-2">
            <Row label="About" value={p.about} />
            <Row label="From" value={place} />
            <Row label="Interests" value={p.interests} />
            <Row label="Relationship" value={p.relationship} />
            <Row label="Birthday" value={birthday} />
            <Row label="Joined" value={p.joinedAt ? new Date(p.joinedAt).toLocaleDateString() : null} />
          </dl>
        )}
      </CardContent>
    </Card>
    {!p.limited && <Scrapbook profile={p} />}
    {!p.limited && <Testimonials profile={p} />}
    </div>
    <div className="space-y-4">
    {!p.limited && <Standing profile={p} />}
    {!p.limited && <FriendsPanel handle={p.handle} />}
    </div>
    </div>
  );
}
