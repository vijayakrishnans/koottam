"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { wrap } from "@/lib/api";
import { qk, useApiQuery } from "@/lib/query";
import { useSession } from "@/lib/session";
import { useRequireAuth } from "@/lib/use-async";

/** The signed-in frame. Someone with a session but no profile is sent to make one. */
export default function SocialLayout({ children }: { children: React.ReactNode }) {
  const ready = useRequireAuth();
  const router = useRouter();
  const { client, setToken } = useSession();
  const me = useApiQuery(qk.socialMe(), () => wrap(() => client.social.me()), { enabled: ready });

  React.useEffect(() => {
    if (me.error?.code === "profile_required") router.replace("/welcome");
  }, [me.error, router]);

  const handle = me.data?.profile.handle;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
          <Link href="/home" className="text-lg font-semibold tracking-tight text-primary">
            koottam
          </Link>
          <nav className="flex flex-1 flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <Link href="/home" className="hover:underline">Home</Link>
            {handle && <Link href={`/u/${handle}`} className="hover:underline">Profile</Link>}
            <Link href="/invites" className="hover:underline">Invites</Link>
            <Link href="/settings" className="hover:underline">Settings</Link>
          </nav>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setToken(null);
              router.replace("/login");
            }}
          >
            Sign out
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">
        {me.data ? (
          children
        ) : me.error && me.error.code !== "profile_required" ? (
          <p className="text-sm text-destructive">Koottam couldn't load your profile. Please try again.</p>
        ) : (
          <Skeleton className="h-40 w-full" />
        )}
      </main>
    </div>
  );
}
