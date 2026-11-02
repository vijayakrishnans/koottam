"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PublicFooter } from "@/components/social/public-footer";
import { readStoredToken } from "@/lib/session";

const IDEAS = [
  {
    title: "A page that's yours",
    body: "Your profile is the centre of things. Friends leave scraps in your scrapbook, and testimonials about you appear only once you approve them.",
  },
  {
    title: "Nothing is ranked",
    body: "Your home page shows what you and your friends wrote, newest first. No algorithm picks for you, and there are no ads.",
  },
  {
    title: "Communities with a home",
    body: "Start one around anything, or join one. Each has a forum that keeps its conversations, and moderators chosen by its founder.",
  },
];

/** The public front door. Someone already signed in goes straight home. */
export default function LandingPage() {
  const router = useRouter();
  const [invite, setInvite] = React.useState("");

  React.useEffect(() => {
    if (readStoredToken()) router.replace("/home");
  }, [router]);

  const useInvite = (e: React.FormEvent) => {
    e.preventDefault();
    // People may paste the whole link or just its code.
    const code = invite.trim().split("#").pop() ?? "";
    if (code) router.push(`/join#${code}`);
  };

  return (
    <div className="flex min-h-screen flex-col">
      <header className="mx-auto flex w-full max-w-4xl items-center justify-between px-4 py-5">
        <span className="text-xl font-semibold tracking-tight text-primary">koottam</span>
        <Button asChild variant="ghost" size="sm">
          <Link href="/login">Sign in</Link>
        </Button>
      </header>
      <main className="mx-auto w-full max-w-4xl flex-1 space-y-12 px-4 pb-16 pt-8">
        <section className="max-w-2xl space-y-5">
          <h1 className="text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
            Keep in touch the way you used to.
          </h1>
          <p className="text-lg text-muted-foreground">
            Koottam means &ldquo;gathering&rdquo; in Malayalam and Tamil. It&rsquo;s a small social network of pages, scrapbooks and
            communities, where everything you see was put there by a person.
          </p>
          <form className="max-w-md space-y-2 rounded-lg border bg-card p-4" onSubmit={useInvite}>
            <Label htmlFor="invite">Koottam is invite-only. Got an invite?</Label>
            <div className="flex gap-2">
              <Input
                id="invite"
                autoComplete="off"
                placeholder="Paste your link or code"
                value={invite}
                onChange={(e) => setInvite(e.target.value)}
              />
              <Button type="submit" disabled={!invite.trim()}>Continue</Button>
            </div>
            <p className="text-xs text-muted-foreground">No invite? Ask a friend who&rsquo;s here. Koottam is for adults only.</p>
          </form>
        </section>
        <section className="grid gap-6 sm:grid-cols-3">
          {IDEAS.map((idea) => (
            <div key={idea.title} className="space-y-1.5">
              <h2 className="font-semibold">{idea.title}</h2>
              <p className="text-sm text-muted-foreground">{idea.body}</p>
            </div>
          ))}
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
