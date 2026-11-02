import * as React from "react";
import Link from "next/link";
import { PublicFooter } from "@/components/social/public-footer";

export function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="mx-auto w-full max-w-2xl px-4 py-5">
        <Link href="/" className="text-xl font-semibold tracking-tight text-primary">koottam</Link>
      </header>
      <main className="mx-auto w-full max-w-2xl flex-1 space-y-5 px-4 pb-16 text-sm leading-relaxed [&_h2]:pt-2 [&_h2]:text-base [&_h2]:font-semibold [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5">
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="rounded-md border bg-card p-3 text-muted-foreground">
          This is a draft written in plain language. A lawyer hasn&rsquo;t reviewed it yet, and it will change before Koottam opens
          to the public. Contact details will be added then too.
        </p>
        {children}
      </main>
      <PublicFooter />
    </div>
  );
}
