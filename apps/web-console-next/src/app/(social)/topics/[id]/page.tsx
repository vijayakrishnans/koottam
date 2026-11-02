"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { ReportButton } from "@/components/social/report-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { wrap } from "@/lib/api";
import { qk, useApiQuery } from "@/lib/query";
import { useSession } from "@/lib/session";

export default function TopicPage() {
  const { id } = useParams<{ id: string }>();
  const { client } = useSession();
  const { toast } = useToast();
  const router = useRouter();
  const queryClient = useQueryClient();
  const topic = useApiQuery(qk.socialTopic(id), () => wrap(() => client.social.topic(id)));
  const [body, setBody] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const act = async (run: () => Promise<unknown>): Promise<boolean> => {
    setBusy(true);
    const r = await wrap(run);
    if (!r.ok) toast({ kind: "error", title: "That didn't work", description: r.error.message });
    await queryClient.invalidateQueries({ queryKey: qk.socialTopic(id) });
    setBusy(false);
    return r.ok;
  };

  if (topic.error) return <p className="text-sm text-muted-foreground">This topic isn't available.</p>;
  if (!topic.data) return <Skeleton className="h-40 w-full" />;
  const { topic: t, posts } = topic.data;

  return (
    <Card>
      <CardHeader>
        <CardDescription>
          <Link className="text-primary hover:underline" href={`/communities/${t.communitySlug}`}>{t.communityName}</Link>
        </CardDescription>
        <CardTitle className="break-words">{t.title}{t.locked ? " (locked)" : ""}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <ReportButton subjectType="topic" subjectId={id} />
        {t.canModerate && (
          <>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => act(() => client.social.setTopicLocked(id, !t.locked))}>
              {t.locked ? "Unlock topic" : "Lock topic"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={async () => {
                if (await act(() => client.social.deleteTopic(id))) {
                  await queryClient.invalidateQueries({ queryKey: qk.socialTopics(t.communitySlug) });
                  router.push(`/communities/${t.communitySlug}`);
                }
              }}
            >
              Delete topic
            </Button>
          </>
        )}
        </div>
        <ul className="divide-y">
          {posts.map((p) => (
            <li key={p.id} className="space-y-1 py-3 text-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <Link className="font-medium text-primary hover:underline" href={`/u/${p.author.handle}`}>{p.author.displayName}</Link>
                <span className="text-xs text-muted-foreground">{new Date(p.createdAt).toLocaleString()}</span>
              </div>
              <p className="whitespace-pre-wrap break-words">{p.body}</p>
              <div className="flex gap-1">
                {p.canDelete && (
                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => act(() => client.social.deletePost(p.id))}>Delete</Button>
                )}
                <ReportButton subjectType="post" subjectId={p.id} />
              </div>
            </li>
          ))}
        </ul>
        {t.canPost ? (
          <form
            className="space-y-2"
            onSubmit={async (e) => {
              e.preventDefault();
              if (await act(() => client.social.reply(id, body))) setBody("");
            }}
          >
            <textarea
              aria-label="Write a reply"
              rows={3}
              maxLength={5000}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={body}
              disabled={busy}
              onChange={(e) => setBody(e.target.value)}
            />
            <Button type="submit" size="sm" disabled={busy || !body.trim()}>Reply</Button>
          </form>
        ) : (
          <p className="text-sm text-muted-foreground">
            {t.locked ? "This topic is locked." : "Join this community to reply."}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
