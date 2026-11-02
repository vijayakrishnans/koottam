"use client";

import Link from "next/link";
import type { Scrap } from "@saas/contracts/social";
import { ReportButton } from "@/components/social/report-button";
import { Button } from "@/components/ui/button";

export function ScrapList({
  scraps,
  showRecipient,
  onDelete,
}: {
  scraps: Scrap[];
  showRecipient?: boolean;
  onDelete?: (id: string) => void;
}) {
  return (
    <ul className="divide-y">
      {scraps.map((s) => (
        <li key={s.id} className="space-y-1 py-3 text-sm">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span>
              <Link className="font-medium text-primary hover:underline" href={`/u/${s.from.handle}`}>{s.from.displayName}</Link>
              {showRecipient && s.from.handle !== s.to.handle && (
                <>
                  {" → "}
                  <Link className="font-medium text-primary hover:underline" href={`/u/${s.to.handle}`}>{s.to.displayName}</Link>
                </>
              )}
            </span>
            <span className="text-xs text-muted-foreground">
              {new Date(s.createdAt).toLocaleString()}
              {s.visibility === "friends" ? " · friends only" : ""}
            </span>
          </div>
          <p className="whitespace-pre-wrap break-words">{s.body}</p>
          <div className="flex gap-1">
            {onDelete && s.canDelete && (
              <Button size="sm" variant="ghost" onClick={() => onDelete(s.id)}>Delete</Button>
            )}
            {!s.mine && <ReportButton subjectType="scrap" subjectId={s.id} />}
          </div>
        </li>
      ))}
    </ul>
  );
}
