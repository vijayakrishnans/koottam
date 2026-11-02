# koottam-social — implementation plan

Milestones land in order. Each is one or more tasks, each task one pull request. A milestone is marked ✅ here when its "done when" list is true, and recorded in `IMPLEMENTATION-STATUS.md`.

## KT0 — the spec ✅

This doc set, merged to `main`.

**Done when**
- the five documents are on `main`
- `task_get koottam-social` shows the epic with milestones KT0 to KT6

## KT1 — people — stage ✅, prod needs Google sign-in

Adds `social-worker` and its route through `api-edge`, the profile and invite migrations, Google sign-in configuration, the 18+ declaration, and the profile and settings screens. Replaces the console's landing route.

**Done when**
- on stage, a person redeems an invite, declares they are an adult, signs in, edits a profile, and it shows at its handle
- sign-in without a valid invite creates no profile, by test
- on prod, the same works through Google sign-in (needs the owner's OAuth credentials)
- stage and prod `/health` answer through the edge for `social-worker`

## KT2 — friends ✅ on stage

Requests, accept and decline, friend lists, mutual friends, search by name and handle, and blocking.

**Done when**
- two test accounts on stage become friends, and each sees the other in their list
- after a block, neither person can see or write to the other, by test for every route that exists so far
- friendship rows are symmetric and unique, by test

## KT3 — scrapbook and testimonials ✅ on stage

Scraps with visibility, the home page in time order, testimonials with approval, fans, three ratings, in-app counters and birthday reminders.

**Done when**
- a scrap written on stage appears on the recipient's page and on their friends' home pages, newest first
- a friends-only scrap is refused to a non-friend, by test
- a testimonial is invisible until approved, and disappears when hidden
- rating totals appear, and no route exposes who rated what, by test

## KT4 — communities ✅ on stage

Create, browse and join communities, with open and approval policies, forum topics and posts, moderators, bans, and owner handover.

**Done when**
- on stage, one person creates a community, another joins and starts a topic, and a third replies
- non-members cannot post, by test
- a moderator removes a post and bans a member, and both take effect immediately
- a person's block still applies inside a community forum

## KT5 — photos — not started, needs an R2 token from the owner

An R2 bucket per environment through the baseline's infrastructure, avatars and albums, type and size checks, and serving through the Worker so that album visibility is enforced.

**Done when**
- a profile photo and an album display on stage and prod
- a non-image, or a file over the limit, is refused by checking its bytes and not just its header
- a friends-only album is refused to a non-friend, by test

## KT6 — safety and the front door — stage ✅, prod needs Google sign-in

Report buttons on all content, the moderation queue, removal, suspension, data export, account deletion, the public landing page, terms and privacy pages.

**Done when**
- a report made on prod reaches the queue, and removal takes effect at once
- a suspended person cannot sign in
- account deletion removes the person's profile and content, by test, and export returns their data as JSON
- a signed-out visitor sees the landing page and can redeem an invite on prod

## Sequencing note

KT1 comes first because every resource needs a person. Blocking lands in KT2, before any way to write to someone exists, so each later route is written with it in place. KT3 and KT4 are independent but kept in order to stay one in flight. KT5 is separate because it is the only milestone that needs a new Cloudflare resource, so a token problem there delays nothing else. KT6 is last to build but gates the audience: until it lands, invites go only to a test group.
