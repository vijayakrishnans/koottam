"use client";

import Link from "next/link";
import { ScrapList } from "@/components/social/scrap-list";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { wrap } from "@/lib/api";
import { qk, useApiQuery } from "@/lib/query";
import { useSession } from "@/lib/session";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default function HomePage() {
  const { client } = useSession();
  const home = useApiQuery(qk.socialHome(), () => wrap(() => client.social.home()));
  const birthdays = home.data?.birthdays ?? [];

  return (
    <div className="grid gap-4 md:grid-cols-[1fr_16rem]">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Latest scraps</CardTitle>
          <CardDescription>From you and your friends, newest first. Nothing here is ranked.</CardDescription>
        </CardHeader>
        <CardContent>
          {!home.data && !home.error && <Skeleton className="h-32 w-full" />}
          {home.error && <p className="text-sm text-destructive">Couldn't load your home page. Please try again.</p>}
          {home.data?.scraps.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Nothing yet. <Link className="text-primary hover:underline" href="/friends">Find friends</Link> or{" "}
              <Link className="text-primary hover:underline" href="/invites">invite someone</Link>.
            </p>
          )}
          {home.data && <ScrapList scraps={home.data.scraps} showRecipient />}
        </CardContent>
      </Card>
      {birthdays.length > 0 && (
        <Card className="self-start">
          <CardHeader>
            <CardTitle className="text-base">Birthdays this week</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1 text-sm">
              {birthdays.map((b) => (
                <li key={b.handle} className="flex justify-between gap-2">
                  <Link className="text-primary hover:underline" href={`/u/${b.handle}`}>{b.displayName}</Link>
                  <span className="text-muted-foreground">{b.day} {MONTHS[b.month - 1]}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
