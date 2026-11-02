# koottam-social (KT) — Implementation status

As-built ≠ intent. This file records what actually shipped, and every place the code departed from `design.md`.

| Milestone | State | PR |
|---|---|---|
| KT0 — the spec | ✅ | #3 |
| KT1 — people | ✅ on stage, shown in a browser. Prod sign-in needs Google credentials from the owner | #4 |
| KT2 — friends | ✅ on stage, shown in a browser, with blocking also proven by test | #5, #6 |
| KT3 — scrapbook and testimonials | ✅ on stage, shown in a browser | #7, #8 |
| KT4 — communities | ✅ on stage, shown in a browser | #9 |
| KT5 — photos | Not started. Needs a brokered R2 token created by the owner, so KT6 went first | |
| KT6 — safety and the front door | ✅ on stage, except a stranger redeeming an invite on prod, which needs Google sign-in. Terms and privacy are unreviewed drafts | #10, #11, #12, #13, #14 |

## What blocks release

1. **Google sign-in on prod.** Nobody can sign in on prod until the owner creates a Google OAuth client and seeds its secrets. The client IDs in the identity worker's template came with the baseline and must be replaced. The founder invite is unspent on prod.
2. **The R2 token for KT5.** Creating it needs the owner: `orun integrations cloudflare secret create CLOUDFLARE_R2_TOKEN --connection <int_…> --template r2-data --mode brokered --project`.
3. **The license.** The repository has none. `cirrus-baseline` has no license file, so whether its code can go out as Apache 2.0 is the copyright holders' decision.
4. **A lawyer's review** of the terms and privacy drafts and of illegal-content duties, plus contact details, before opening beyond a test group (KT-A, KT-G).

Stage returns sign-in codes in API responses and must not hold real data. It holds test accounts only.

## Departures from the design

### Invites as built (KT-2)

The design listed only creating and checking invites. People can also list and cancel their own, with at most 10 open at a time, and each lasts 30 days. The code is stored only as a SHA-256 hash, so it is shown once.

The first person on each environment joins with a founder invite whose hash ships in migration 200. Its code was given privately to the owner.

### Sign-in screens (KT-2)

The baseline's paste-a-bearer-token path is removed from sign-in. Email codes are hidden on prod, where they cannot be delivered without a verified domain. Baseline console screens redirect to the home page since KT6.

### Signed-in access to profiles (KT-2)

Only members with a profile can read pages. A friends-only page shows only its card to everyone else until KT2 adds friendships.

### Friends as built (KT-3)

Beyond the design: a sender can cancel a request, and asking someone who has already asked you counts as accepting. Blocking cancels pending requests in both directions.

Migration 210 also holds the hash of a test invite that expires on 4 November 2026. It exists because the first stage test spent stage's founder invite. It reaches prod too, unused, and has now expired or will on that date. Stage's founder invite was spent by a test account whose login was lost, so that account remains on stage.

### Scrapbook as built (KT-5)

The design let anyone write a scrap. Only friends can write scraps and testimonials or give ratings, because that removes most harassment from strangers. Anyone can become a fan.

Rating averages stay hidden until three people have rated, so nobody's rating can be worked out from them. One person can write one testimonial about another, and must delete it to write another. Scraps are limited to 60 an hour per person. Deleting a scrap also erases its text. A block removes fans and ratings between the two people.

### Communities as built (KT-7)

`member_count` is counted when read instead of stored, so it can't drift. Topics can also be locked, and owners can delete a community, which the design didn't list. A community's forum is readable by any signed-in member when it's open and only by its members when it needs approval. Blocked people don't see each other's topics, posts or membership, including inside a community they share. People can own 20 communities and write 60 forum posts an hour. Leaving doesn't lift a ban.

### Reports and moderation as built (KT-8)

Moderators are whoever spent the founder invite, plus anyone in `social_staff`. Stage's test invite also counts, but on stage only. A report keeps a copy of the content so that deleting it doesn't escape review, and the copy is erased on resolve. Resolving closes every open report on the same thing.

The plan said a suspended person cannot sign in. The baseline's identity worker doesn't check account status at login, and this change leaves it alone. Suspension ends their sessions and marks the account, and every social route then refuses them, so they can reach nothing even though a new sign-in succeeds. Moderation decisions are recorded on the report and suspension rows, not in the baseline audit log.

### Export and deletion as built (KT-9)

Deletion removes the person's profile, friendships, scraps and testimonials in both directions, fans, ratings, posts, and the topics they started, with any replies in those topics. The identity row keeps only a tombstone, so the email is gone and signing in with it again starts from nothing. Their security log is deleted, their address is erased from the notification log, and their hidden personal organization, which is named after them, is renamed. Baseline audit tables are not touched; they key on an opaque actor id and hold no social content. Deletion is refused while others remain in a community they own, and for moderators, so Koottam can't be left with nobody to act on reports. A suspended person can't reach this, so their deletion requests go to a moderator. The edge caches sessions briefly, so the worker also refuses any session belonging to a deleted account (KT-10).

### The front door as built (KT-11)

The product now uses a warm light theme instead of the baseline's dark console, set by the theme tokens and the default theme. The landing page takes a pasted invite link or code. The terms and privacy pages are plain-language drafts and say so, with no contact details yet. The baseline's `/orgs`, `/account`, `/onboarding` and `/demo` redirect to the home page. Their code stays in the repository.

### The smoke test (KT-12)

#13 removed the page title "koottam Console", which the web app's smoke test looked for. Stage deployed and failed its smoke test, and prod correctly stayed on its previous build until this landed.

### Known issues

- CI lanes often fail on a first attempt with GitHub OIDC token errors or undelivered remote logs, and pass when re-run. No test has been the cause so far.

- `/login` logs React hydration error #418. It comes from the baseline, because Earlywarn's sign-in page logs it too, and React recovers by rendering on the client. Not yet traced.
- An action followed by its list refresh takes about 4 seconds on stage. Buttons now wait for it, but the cause is unmeasured and worth checking once there is real traffic.
