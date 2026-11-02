"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { readStoredToken } from "@/lib/session";

/** App entry: home for someone signed in, otherwise sign-in. localStorage is client-only. */
export default function HomePage() {
  const router = useRouter();
  React.useEffect(() => {
    const dest = readStoredToken() ? "/home" : "/login";
    router.replace(dest);
  }, [router]);

  return (
    <div className="grid min-h-screen place-items-center text-sm text-muted-foreground">
      Loading…
    </div>
  );
}
