"use client";

import * as React from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { wrap } from "@/lib/api";
import { qk, useApiQuery } from "@/lib/query";
import { useSession } from "@/lib/session";

function PersonLink({ handle, name }: { handle: string; name: string }) {
  return (
    <Link className="text-primary hover:underline" href={`/u/${handle}`}>
      {name} <span className="text-muted-foreground">@{handle}</span>
    </Link>
  );
}

export default function FriendsPage() {
  const { client } = useSession();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const me = useApiQuery(qk.socialMe(), () => wrap(() => client.social.me()));
  const handle = me.data?.profile.handle ?? "";
  const friends = useApiQuery(qk.socialFriends(handle), () => wrap(() => client.social.friends(handle)), { enabled: !!handle });
  const requests = useApiQuery(qk.socialFriendRequests(), () => wrap(() => client.social.friendRequests()));
  const blocks = useApiQuery(qk.socialBlocks(), () => wrap(() => client.social.blocks()));
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<{ handle: string; displayName: string }[] | null>(null);

  const [busy, setBusy] = React.useState(false);

  // Stays busy until the lists are fresh, so the buttons can't be pressed twice.
  const act = async (run: () => Promise<unknown>) => {
    setBusy(true);
    const r = await wrap(run);
    if (!r.ok) toast({ kind: "error", title: "That didn't work", description: r.error.message });
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: qk.socialFriendRequests() }),
      queryClient.invalidateQueries({ queryKey: qk.socialFriends(handle) }),
      queryClient.invalidateQueries({ queryKey: qk.socialBlocks() }),
      queryClient.invalidateQueries({ queryKey: qk.socialCounters() }),
    ]);
    setBusy(false);
  };

  const search = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = await wrap(() => client.social.search(query));
    if (r.ok) setResults(r.data.people);
    else toast({ kind: "error", title: "Search failed", description: r.error.message });
  };

  const incoming = requests.data?.incoming ?? [];
  const outgoing = requests.data?.outgoing ?? [];
  const blocked = blocks.data?.people ?? [];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Find people</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <form className="flex gap-2" onSubmit={search}>
            <Input
              aria-label="Search by name or handle"
              placeholder="Name or handle"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <Button type="submit" disabled={query.trim().length < 2}>Search</Button>
          </form>
          {results && results.length === 0 && <p className="text-sm text-muted-foreground">No one found.</p>}
          {results && results.length > 0 && (
            <ul className="space-y-1 text-sm">
              {results.map((p) => (
                <li key={p.handle}><PersonLink handle={p.handle} name={p.displayName} /></li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {incoming.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Friend requests</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y text-sm">
              {incoming.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <PersonLink handle={r.person.handle} name={r.person.displayName} />
                  <span className="flex gap-2">
                    <Button size="sm" disabled={busy} onClick={() => act(() => client.social.answerFriendRequest(r.id, "accept"))}>Accept</Button>
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => act(() => client.social.answerFriendRequest(r.id, "decline"))}>Decline</Button>
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your friends{friends.data ? ` (${friends.data.people.length})` : ""}</CardTitle>
        </CardHeader>
        <CardContent>
          {!friends.data ? null : friends.data.people.length ? (
            <ul className="space-y-1 text-sm">
              {friends.data.people.map((p) => (
                <li key={p.handle}><PersonLink handle={p.handle} name={p.displayName} /></li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Search above, or <Link className="text-primary hover:underline" href="/invites">invite someone</Link>.</p>
          )}
        </CardContent>
      </Card>

      {outgoing.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Waiting for an answer</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y text-sm">
              {outgoing.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <PersonLink handle={r.person.handle} name={r.person.displayName} />
                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => act(() => client.social.cancelFriendRequest(r.id))}>Cancel</Button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {blocked.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Blocked</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y text-sm">
              {blocked.map((p) => (
                <li key={p.handle} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>{p.displayName} <span className="text-muted-foreground">@{p.handle}</span></span>
                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => act(() => client.social.unblock(p.handle))}>Unblock</Button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
