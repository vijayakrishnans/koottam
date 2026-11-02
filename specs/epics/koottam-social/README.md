# Epic: koottam-social (KT)

**The social networks people use today are built around a feed that strangers and algorithms fill, and the small rituals that made Orkut feel personal (a scrap left on a friend's page, a testimonial they had to approve, a community you were proud to join) are gone. Koottam brings those rituals back as a new product: a profile-centred network where everything you see was put there by a person, ordered by time, with no ranking at all.**

Koottam ("gathering" in Malayalam and Tamil) is for people who miss that way of keeping in touch, and for groups who want a home that is not a chat thread. When it ships, someone can join by invite, build a profile, add friends, write in their scrapbook, write testimonials, join communities and talk in their forums.

Koottam is inspired by Orkut's features. It does not use the Orkut name, logo or artwork, and it does not imply any connection to Orkut or Google.

## Status

| Field | Value |
|-------|-------|
| Status | In progress |
| Cluster | **KT** (KT0–KT6) |
| Owner(s) | `apps/social-worker` (the resources) · `packages/db` + `packages/contracts` + `packages/sdk` (the wire) · `apps/web-console-next` (the surface) |
| Builds on | `cirrus-baseline baseline-v27` — identity (including Google and GitHub OAuth), audit, notifications, policy, edge API |
| Changes | Adds one bounded-context Worker and replaces the console's signed-in experience with the social surfaces |
| Decisions locked | (1) One global network: social data belongs to people, not to organizations. (2) Time order only, no ranking. (3) Join by invite, as the original did. (4) Adults only, self-declared at sign-up. (5) Cloudflare only: no Supabase. |
| Gate | KT1 is the first user-visible change. KT6 must land before anyone outside the invited test group is let in. |
| Shipped as | |

## Read order

1. `design.md` — the resources, routes, surfaces and what is out of scope
2. `implementation-plan.md` — the milestones and what "done" means for each
3. `risks-and-open-questions.md` — what could go wrong and what was decided
4. `IMPLEMENTATION-STATUS.md` — what actually shipped

## Milestones at a glance

| Milestone | What it lands | Done when |
|---|---|---|
| KT0 — the spec | this doc set | merged to `main`; the epic and its milestones read back from `task_get` |
| KT1 — people | Google sign-in, invites, profiles | an invited person signs in on prod and has a profile page |
| KT2 — friends | requests, friend lists, mutual friends, blocking | two people on prod become friends; a blocked person cannot reach the blocker |
| KT3 — scrapbook and testimonials | scraps, home page, approved testimonials, fans and ratings | a scrap reaches a friend's home page; a testimonial shows only once approved |
| KT4 — communities | communities, membership, forums, moderators | a member starts a topic; a moderator removes a post |
| KT5 — photos | avatars and albums on R2 | a profile photo and an album display on prod, within upload limits |
| KT6 — safety and the front door | reports, moderation queue, data export and deletion, landing page, terms | a report reaches the queue and a removal takes effect; a stranger can read what Koottam is and redeem an invite |
