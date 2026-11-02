"use client";

import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { wrap } from "@/lib/api";
import { qk, useApiQuery } from "@/lib/query";
import { useSession } from "@/lib/session";

export default function HomePage() {
  const { client } = useSession();
  const me = useApiQuery(qk.socialMe(), () => wrap(() => client.social.me()));
  const name = me.data?.profile.displayName;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{name ? `Welcome, ${name}` : "Welcome"}</CardTitle>
        <CardDescription>Friends and scrapbooks are on their way. For now, you can set up your page and invite people.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-4 text-sm">
        <Link className="text-primary hover:underline" href="/settings">Edit your profile</Link>
        <Link className="text-primary hover:underline" href="/invites">Invite someone</Link>
      </CardContent>
    </Card>
  );
}
