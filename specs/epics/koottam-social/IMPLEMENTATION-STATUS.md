# koottam-social (KT) — Implementation status

As-built ≠ intent. This file records what actually shipped, and every place the code departed from `design.md`.

| Milestone | State | PR |
|---|---|---|
| KT0 — the spec | ✅ | #3 |
| KT1 — people | Stage in progress. Prod sign-in needs Google credentials | this PR |
| KT2 — friends | | |
| KT3 — scrapbook and testimonials | | |
| KT4 — communities | | |
| KT5 — photos | | |
| KT6 — safety and the front door | | |

## Departures from the design

### Invites as built (KT-2)

The design listed only creating and checking invites. People can also list and cancel their own, with at most 10 open at a time, and each lasts 30 days. The code is stored only as a SHA-256 hash, so it is shown once.

The first person on each environment joins with a founder invite whose hash ships in migration 200. Its code was given privately to the owner.

### Sign-in screens (KT-2)

The baseline's paste-a-bearer-token path is removed from sign-in. Email codes are hidden on prod, where they cannot be delivered without a verified domain. Baseline console screens remain reachable by address until KT6.

### Signed-in access to profiles (KT-2)

Only members with a profile can read pages. A friends-only page shows only its card to everyone else until KT2 adds friendships.
