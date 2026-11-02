"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { wrap } from "@/lib/api";
import { qk, useApiQuery } from "@/lib/query";
import { useSession } from "@/lib/session";

type Fields = Record<string, string[] | undefined>;

export default function CommunitiesPage() {
  const { client } = useSession();
  const router = useRouter();
  const [input, setInput] = React.useState("");
  const [q, setQ] = React.useState("");
  const list = useApiQuery(qk.socialCommunities(q), () => wrap(() => client.social.communities(q)));
  const [name, setName] = React.useState("");
  const [slug, setSlug] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [approval, setApproval] = React.useState(false);
  const [fields, setFields] = React.useState<Fields>({});
  const [message, setMessage] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setFields({});
    setMessage(null);
    const r = await wrap(() =>
      client.social.createCommunity({ name, slug, description, joinPolicy: approval ? "approval" : "open" }),
    );
    setBusy(false);
    if (r.ok) {
      router.push(`/communities/${r.data.community.slug}`);
      return;
    }
    const sent = r.error.details?.["fields"] as Fields | undefined;
    if (sent) setFields(sent);
    else setMessage(r.error.message);
  };

  const error = (key: string) =>
    fields[key]?.[0] ? <p className="text-xs text-destructive">{fields[key]?.[0]}</p> : null;

  return (
    <div className="grid gap-4 md:grid-cols-[1fr_20rem]">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Communities</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              setQ(input.trim());
            }}
          >
            <Input aria-label="Search communities" placeholder="Search by name" value={input} onChange={(e) => setInput(e.target.value)} />
            <Button type="submit" variant="outline">Search</Button>
          </form>
          {list.data?.communities.length === 0 && (
            <p className="text-sm text-muted-foreground">{q ? "No communities match that." : "No communities yet. Start the first one."}</p>
          )}
          <ul className="divide-y text-sm">
            {list.data?.communities.map((c) => (
              <li key={c.slug} className="space-y-1 py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <Link className="font-medium text-primary hover:underline" href={`/communities/${c.slug}`}>{c.name}</Link>
                  <span className="text-xs text-muted-foreground">
                    {c.members} {c.members === 1 ? "member" : "members"}
                    {c.joinPolicy === "approval" ? " · approval needed" : ""}
                  </span>
                </div>
                {c.description && <p className="line-clamp-2 break-words text-muted-foreground">{c.description}</p>}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
      <Card className="self-start">
        <CardHeader>
          <CardTitle className="text-base">Start a community</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-3" onSubmit={create}>
            <div className="space-y-1.5">
              <Label htmlFor="community-name">Name</Label>
              <Input id="community-name" value={name} onChange={(e) => setName(e.target.value)} />
              {error("name")}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="community-slug">Address</Label>
              <Input id="community-slug" placeholder="old-friends" value={slug} onChange={(e) => setSlug(e.target.value)} />
              {error("slug")}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="community-about">About</Label>
              <textarea
                id="community-about"
                rows={3}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
              {error("description")}
            </div>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-0.5" checked={approval} onChange={(e) => setApproval(e.target.checked)} />
              Approve members before they join. Only members can read its forum.
            </label>
            {message && <p className="text-sm text-destructive">{message}</p>}
            <Button type="submit" disabled={busy}>{busy ? "Creating…" : "Create community"}</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
