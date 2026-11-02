"use client";

import * as React from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import type { PublicProfile, RatingValues } from "@saas/contracts/social";
import { ScrapList } from "@/components/social/scrap-list";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { wrap } from "@/lib/api";
import { qk, useApiQuery } from "@/lib/query";
import { useSession } from "@/lib/session";

const FIELD = "w-full rounded-md border bg-background px-3 py-2 text-sm";
const RATINGS: Array<{ key: keyof RatingValues; label: string }> = [
  { key: "trusty", label: "Trusty" },
  { key: "cool", label: "Cool" },
  { key: "funny", label: "Funny" },
];

function useAct() {
  const { toast } = useToast();
  const [busy, setBusy] = React.useState(false);
  const act = async (run: () => Promise<unknown>, after: () => Promise<unknown>): Promise<boolean> => {
    setBusy(true);
    const r = await wrap(run);
    if (!r.ok) toast({ kind: "error", title: "That didn't work", description: r.error.message });
    await after();
    setBusy(false);
    return r.ok;
  };
  return { busy, act };
}

export function Scrapbook({ profile }: { profile: PublicProfile }) {
  const { client } = useSession();
  const queryClient = useQueryClient();
  const { handle } = profile;
  const scraps = useApiQuery(qk.socialScraps(handle), () => wrap(() => client.social.scraps(handle)));
  const { busy, act } = useAct();
  const [body, setBody] = React.useState("");
  const [friendsOnly, setFriendsOnly] = React.useState(false);
  const canWrite = profile.isMe || profile.connection === "friends";

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: qk.socialScraps(handle) }),
      queryClient.invalidateQueries({ queryKey: qk.socialHome() }),
      queryClient.invalidateQueries({ queryKey: qk.socialCounters() }),
    ]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const sent = await act(
      () => client.social.writeScrap(handle, { body, visibility: friendsOnly ? "friends" : "everyone" }),
      refresh,
    );
    if (sent) setBody("");
  };

  if (scraps.data?.hidden) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Scrapbook</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {canWrite && (
          <form className="space-y-2" onSubmit={submit}>
            <textarea
              aria-label="Write a scrap"
              className={FIELD}
              rows={3}
              maxLength={1024}
              placeholder={profile.isMe ? "Leave a note on your page" : `Write to ${profile.displayName}`}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              disabled={busy}
            />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={friendsOnly} onChange={(e) => setFriendsOnly(e.target.checked)} />
                Friends only
              </label>
              <Button type="submit" size="sm" disabled={busy || !body.trim()}>Post scrap</Button>
            </div>
          </form>
        )}
        {scraps.data && scraps.data.scraps.length === 0 && (
          <p className="text-sm text-muted-foreground">No scraps yet.</p>
        )}
        {scraps.data && (
          <ScrapList scraps={scraps.data.scraps} onDelete={(id) => act(() => client.social.deleteScrap(id), refresh)} />
        )}
      </CardContent>
    </Card>
  );
}

export function Testimonials({ profile }: { profile: PublicProfile }) {
  const { client } = useSession();
  const queryClient = useQueryClient();
  const { handle } = profile;
  const list = useApiQuery(qk.socialTestimonials(handle), () => wrap(() => client.social.testimonials(handle)));
  const { busy, act } = useAct();
  const [body, setBody] = React.useState("");

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: qk.socialTestimonials(handle) }),
      queryClient.invalidateQueries({ queryKey: qk.socialCounters() }),
    ]);

  if (list.data?.hidden) return null;
  const items = list.data?.testimonials ?? [];
  const alreadyWrote = items.some((t) => t.mine);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Testimonials</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {profile.connection === "friends" && list.data && !alreadyWrote && (
          <form
            className="space-y-2"
            onSubmit={async (e) => {
              e.preventDefault();
              if (await act(() => client.social.writeTestimonial(handle, body), refresh)) setBody("");
            }}
          >
            <textarea
              aria-label="Write a testimonial"
              className={FIELD}
              rows={3}
              maxLength={2000}
              placeholder={`What's ${profile.displayName} like? It appears once they approve it.`}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              disabled={busy}
            />
            <Button type="submit" size="sm" disabled={busy || !body.trim()}>Send testimonial</Button>
          </form>
        )}
        {list.data && items.length === 0 && <p className="text-sm text-muted-foreground">No testimonials yet.</p>}
        <ul className="divide-y">
          {items.map((t) => (
            <li key={t.id} className="space-y-1 py-3 text-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <Link className="font-medium text-primary hover:underline" href={`/u/${t.from.handle}`}>{t.from.displayName}</Link>
                {t.status !== "approved" && (
                  <span className="text-xs text-muted-foreground">
                    {t.status === "pending" ? "Waiting for approval" : "Hidden"}
                  </span>
                )}
              </div>
              <p className="whitespace-pre-wrap break-words">{t.body}</p>
              <div className="flex gap-2">
                {profile.isMe && t.status !== "approved" && (
                  <Button size="sm" disabled={busy} onClick={() => act(() => client.social.answerTestimonial(t.id, "approve"), refresh)}>Approve</Button>
                )}
                {profile.isMe && t.status !== "hidden" && (
                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => act(() => client.social.answerTestimonial(t.id, "hide"), refresh)}>Hide</Button>
                )}
                {t.mine && (
                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => act(() => client.social.deleteTestimonial(t.id), refresh)}>Delete</Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

export function Standing({ profile }: { profile: PublicProfile }) {
  const { client } = useSession();
  const queryClient = useQueryClient();
  const { handle } = profile;
  const standing = useApiQuery(qk.socialStanding(handle), () => wrap(() => client.social.standing(handle)));
  const { busy, act } = useAct();
  const refresh = () => queryClient.invalidateQueries({ queryKey: qk.socialStanding(handle) });

  const s = standing.data;
  if (!s || s.fans === null) return null;

  const rate = (key: keyof RatingValues, value: number) => {
    const next: RatingValues = { trusty: 0, cool: 0, funny: 0, ...s.myRating, [key]: value };
    return act(() => client.social.rate(handle, next), refresh);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {s.fans} {s.fans === 1 ? "fan" : "fans"}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {!profile.isMe && (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => act(() => client.social.setFan(handle, !s.isFan), refresh)}>
            {s.isFan ? "Stop being a fan" : "Become a fan"}
          </Button>
        )}
        {s.ratings ? (
          <dl className="space-y-1">
            {RATINGS.map(({ key, label }) => (
              <div key={key} className="flex justify-between">
                <dt className="text-muted-foreground">{label}</dt>
                <dd>{s.ratings![key].toFixed(1)} of 3</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="text-xs text-muted-foreground">Ratings appear once three friends have rated.</p>
        )}
        {s.canRate && (
          <fieldset className="space-y-2" disabled={busy}>
            <legend className="text-xs text-muted-foreground">Your private rating</legend>
            {RATINGS.map(({ key, label }) => (
              <label key={key} className="flex items-center justify-between gap-2">
                {label}
                <select
                  className="rounded-md border bg-background px-2 py-1"
                  value={s.myRating?.[key] ?? 0}
                  onChange={(e) => rate(key, Number(e.target.value))}
                >
                  {[0, 1, 2, 3].map((v) => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
              </label>
            ))}
          </fieldset>
        )}
      </CardContent>
    </Card>
  );
}
