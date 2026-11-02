# koottam-social — risks and open questions

**RISK** (open, with a mitigation), **RESOLVED** (decided), **ACCEPTED** (a cost we carry knowingly), **SETTLED** (decided for now; revisit on a stated cadence).

## KT-A — Abuse and harmful content (RISK, the largest)

An open social network attracts harassment, spam and illegal content, and one operator cannot watch all of it. Invites limit who gets in, blocks land in KT2, and reports and removal land in KT6, before the audience widens. Handling of illegal content and any legal duties under India's IT Rules and the rules of other countries need a lawyer's review before a public launch. Photos raise the stakes, so KT5 ships with reporting following in KT6 and access limited to the test group until then.

## KT-B — D1 limits for a social graph (ACCEPTED)

D1 has database size limits and one writer per database, so a very large network would outgrow it. For an invite-only first release, indexed queries are enough. If Koottam grows, moving to a partitioned design or Postgres is a later epic.

## KT-C — Baseline chosen: cirrus, no Supabase (RESOLVED)

`lumen` adds Postgres but creates two more Supabase projects, which is what forced pausing on the Kuyil build. Nothing in this design needs Postgres, so `cirrus-baseline` avoids that entirely.

## KT-D — Sign-in depends on owner credentials (RISK)

The baseline's prod sends sign-in codes by email, which needs a verified domain, and Earlywarn's prod sign-in is blocked for that reason. Koottam uses the baseline's Google OAuth instead, which needs a client ID and secret from the owner. Until they are seeded, prod has no sign-in and all proof is on stage, where sign-in codes are returned in API responses, so stage must never hold real data.

## KT-E — R2 may not be covered by the Cloudflare token (RISK)

The cirrus baseline does not use R2 (checked in Earlywarn), so the Cloudflare connection's R2 scope is unproven. If the token lacks it, the owner widens it, and KT1–KT4 are unaffected.

## KT-F — The Orkut name and look (RESOLVED)

The product takes the feature ideas only. It has its own name and original artwork, and it uses "Orkut" only in plain descriptive text, if at all. A trademark search on "Koottam" has not been done and should be before spending on a domain.

## KT-G — Personal data, and minors (RISK, mitigated)

The product holds personal data, including birthdays and relationship status. Fields are optional, birthdays omit the year, and export and deletion land in KT6. Sign-up is adults only because children's data carries extra legal duties under India's DPDP Act and elsewhere. Self-declaration is weak, which KT-A's lawyer's review should cover.

## KT-H — The rating categories (RESOLVED)

The original's "sexy" rating is replaced by "funny", because rating people's attractiveness invites harassment and is unacceptable where a minor might slip through.

## KT-I — Will anyone come? (RISK)

A social network is worth little without friends on it, and nostalgia may not outlast a first visit. Invites and communities are the test. Success in the first release is one real group using it for a month, not a sign-up count.
