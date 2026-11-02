"use client";

import { useParams } from "next/navigation";
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

export default function ProfilePage() {
  const { handle } = useParams<{ handle: string }>();
  const { client } = useSession();
  const person = useApiQuery(qk.socialPerson(handle), () => wrap(() => client.social.person(handle)));

  if (person.error) {
    return <p className="text-sm text-muted-foreground">There's no one here with that handle.</p>;
  }
  if (!person.data) return <Skeleton className="h-40 w-full" />;

  const p = person.data.profile;
  const birthday = p.birthdayDay && p.birthdayMonth ? `${p.birthdayDay} ${MONTHS[p.birthdayMonth - 1]}` : null;
  const place = [p.city, p.country].filter(Boolean).join(", ") || null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{p.displayName}</CardTitle>
        <CardDescription>@{p.handle}</CardDescription>
      </CardHeader>
      <CardContent>
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
  );
}
