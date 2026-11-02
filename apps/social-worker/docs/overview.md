# social-worker

Cloudflare Worker for Koottam's social network: invites and profiles, then friends, scrapbook, communities and photos.

Part of the koottam runtime: a Cloudflare Worker deployed per environment (`stage`, `prod`; `dev` is verify-only). Not publicly routable — reached only through `api-edge` service bindings.

## Depends on

- **cloudflare-d1** — Provisions the Cloudflare D1 platform database for stage and prod
- **db-migrate** — Applies the migrations this worker's queries need

## Depended on by

- **api-edge** — Cloudflare Worker for the API edge runtime
