"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { wrap } from "@/lib/api";
import { clearPendingInvite, readPendingInvite } from "@/lib/pending-invite";
import { useSession } from "@/lib/session";
import { useRequireAuth } from "@/lib/use-async";

type Fields = Record<string, string[] | undefined>;

export default function WelcomePage() {
  const ready = useRequireAuth();
  const router = useRouter();
  const { client, setToken } = useSession();
  const [inviteCode, setInviteCode] = React.useState("");
  const [handle, setHandle] = React.useState("");
  const [displayName, setDisplayName] = React.useState("");
  const [isAdult, setIsAdult] = React.useState(false);
  const [fields, setFields] = React.useState<Fields>({});
  const [message, setMessage] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    setInviteCode(readPendingInvite());
  }, []);

  React.useEffect(() => {
    if (!ready) return;
    void wrap(() => client.social.me()).then((r) => {
      if (r.ok) router.replace("/home");
    });
  }, [ready, client, router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setFields({});
    setMessage(null);
    const r = await wrap(() => client.social.createProfile({ inviteCode, handle, displayName, isAdult }));
    setBusy(false);
    if (r.ok) {
      clearPendingInvite();
      router.replace("/home");
      return;
    }
    const sent = r.error.details?.["fields"] as Fields | undefined;
    if (sent) setFields(sent);
    else setMessage(r.error.message);
  };

  const error = (key: string) =>
    fields[key]?.[0] ? <p className="text-xs text-destructive">{fields[key]?.[0]}</p> : null;

  if (!ready) return null;

  return (
    <div className="grid min-h-screen place-items-center px-4 py-8">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Make your profile</CardTitle>
          <CardDescription>Koottam is invite-only. Your handle is your page's address and can't be changed later.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={submit}>
            <div className="space-y-1.5">
              <Label htmlFor="invite">Invite code</Label>
              <Input id="invite" value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} autoComplete="off" />
              {error("inviteCode")}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="handle">Handle</Label>
              <Input id="handle" value={handle} onChange={(e) => setHandle(e.target.value)} autoComplete="username" />
              {error("handle")}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="name">Your name</Label>
              <Input id="name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} autoComplete="name" />
              {error("displayName")}
            </div>
            <div className="space-y-1.5">
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={isAdult}
                  onChange={(e) => setIsAdult(e.target.checked)}
                />
                I am 18 or older.
              </label>
              {error("isAdult")}
            </div>
            {message && <p className="text-sm text-destructive">{message}</p>}
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Creating…" : "Join Koottam"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => {
                setToken(null);
                router.replace("/login");
              }}
            >
              Sign out
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
