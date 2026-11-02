"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { wrap } from "@/lib/api";
import { savePendingInvite } from "@/lib/pending-invite";
import { readStoredToken, useSession } from "@/lib/session";

type State = "checking" | "valid" | "invalid";

/** Where an invite link lands. The code is in the fragment, so it never reaches a server log. */
export default function JoinPage() {
  const router = useRouter();
  const { client } = useSession();
  const [state, setState] = React.useState<State>("checking");

  React.useEffect(() => {
    const code = window.location.hash.slice(1);
    if (!code) {
      setState("invalid");
      return;
    }
    void wrap(() => client.social.checkInvite(code)).then((r) => {
      if (r.ok && r.data.valid) {
        savePendingInvite(code);
        setState("valid");
      } else {
        setState("invalid");
      }
    });
  }, [client]);

  return (
    <div className="grid min-h-screen place-items-center px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>
            {state === "valid" ? "You're invited to Koottam" : state === "invalid" ? "This invite can't be used" : "Checking your invite…"}
          </CardTitle>
          <CardDescription>
            {state === "valid" && "A place for friends, scrapbooks and communities, in time order with nothing ranked."}
            {state === "invalid" && "It may have been used, cancelled or expired. Ask whoever sent it for a new one."}
          </CardDescription>
        </CardHeader>
        {state === "valid" && (
          <CardContent>
            <Button className="w-full" onClick={() => router.push(readStoredToken() ? "/welcome" : "/login")}>
              Continue
            </Button>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
