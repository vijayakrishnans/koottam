import Link from "next/link";

export function PublicFooter() {
  return (
    <footer className="border-t">
      <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-4 text-xs text-muted-foreground">
        <span>Koottam</span>
        <Link className="hover:underline" href="/terms">Terms</Link>
        <Link className="hover:underline" href="/privacy">Privacy</Link>
        <span>Inspired by the social networks of the 2000s. Not connected to Orkut or Google.</span>
      </div>
    </footer>
  );
}
