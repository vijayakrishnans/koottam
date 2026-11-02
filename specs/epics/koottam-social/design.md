# koottam-social — design

## 1. The resources

The baseline's identity context owns accounts and sessions and is reused. Everything new lives in one Worker, `apps/social-worker`, with migrations in `packages/db`.

The baseline is multi-tenant, but a social network is not. `SOLO_MODE` stays on, so each person's baseline organization stays hidden, and social tables key on `user_id`, never `org_id`. A community is a social resource and not an organization.

```
profiles            user_id (pk), handle (unique), display_name, about, city, country,
                    interests, relationship, birthday_day, birthday_month, birthday_visible,
                    photo_id, visibility (everyone|friends), created_at, deleted_at
invites             inv_…  code_hash, created_by, redeemed_by, expires_at, created_at
friend_requests     frq_…  from_user, to_user, status (pending|accepted|declined), created_at
friendships         user_a, user_b (a < b), created_at
blocks              blocker_id, blocked_id, created_at
scraps              scr_…  to_user, from_user, body, visibility (everyone|friends), created_at, deleted_at
testimonials        tst_…  to_user, from_user, body, status (pending|approved|hidden), created_at
fans                fan_user, of_user, created_at
ratings             rater, ratee, trusty (0-3), cool (0-3), funny (0-3), updated_at
communities         com_…  slug (unique), name, description, category, join_policy (open|approval),
                    owner_id, member_count, created_at, deleted_at
community_members   community_id, user_id, role (owner|moderator|member), status (active|pending|banned)
topics              top_…  community_id, author_id, title, post_count, last_post_at, locked, deleted_at
posts               pst_…  topic_id, author_id, body, created_at, deleted_at
photos              pho_…  owner_id, album_id, r2_key, content_type, bytes, width, height, created_at
albums              alb_…  owner_id, title, visibility, created_at
reports             rpt_…  reporter_id, subject_type, subject_id, reason, status, resolved_by, created_at
```

Bodies are plain text, escaped on render, with a size limit per resource. Nothing is rendered as HTML.

The home page reads recent scraps from friends at request time with indexed queries. Nothing is fanned out or ranked, which suits D1 at this size (KT-B).

## 2. The API

Everything goes through `api-edge`, under `/v1/social/`, with the baseline's `{ data, meta }` envelope. All routes need a session except where marked public.

```
POST   /v1/social/invites                 GET /v1/social/invites/{code} (public)
GET    /v1/social/me                      PATCH /v1/social/me
GET    /v1/social/people/{handle}         GET /v1/social/search?q=
POST   /v1/social/friend-requests         POST /v1/social/friend-requests/{id}/accept|decline
GET    /v1/social/people/{handle}/friends DELETE /v1/social/friends/{handle}
PUT    /v1/social/blocks/{handle}         DELETE /v1/social/blocks/{handle}
GET    /v1/social/home
GET    /v1/social/people/{handle}/scraps  POST same         DELETE /v1/social/scraps/{id}
GET    /v1/social/people/{handle}/testimonials              POST same
POST   /v1/social/testimonials/{id}/approve|hide
PUT    /v1/social/people/{handle}/fan     PUT /v1/social/people/{handle}/rating
GET|POST /v1/social/communities           GET /v1/social/communities/{slug}
POST   /v1/social/communities/{slug}/join|leave
GET|POST /v1/social/communities/{slug}/topics
GET|POST /v1/social/topics/{id}/posts     DELETE /v1/social/posts/{id}
POST   /v1/social/photos                  GET|POST /v1/social/albums
POST   /v1/social/reports                 GET /v1/social/admin/reports  POST .../resolve
GET    /v1/social/me/export               DELETE /v1/social/me
```

Rules enforced in the Worker, each with a test:

- A block hides both people from each other everywhere and refuses every write between them.
- Only the page owner or the author can delete a scrap. A testimonial is invisible until its subject approves it.
- A person's rating totals are shown, but who gave which rating never is.
- Only members can post in a community, and only its owner or moderators can remove posts or ban members.
- Writes are rate limited per person at the edge.

## 3. The surfaces

`apps/web-console-next` becomes the product: a three-column layout (profile card, content, friends and communities) that echoes the era in an original visual design. Screens: landing and invite redemption, sign-in, home, profile with scrapbook and testimonials, friends, search, communities, community page with forum, photos, settings, moderation queue. Baseline admin and billing screens are hidden from people's navigation.

## 4. Events, secrets and integrations

- **Secrets, seeded by the owner:** `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `OAUTH_STATE_SECRET`. No email provider is required, because invites are links and alerts are in-app.
- **R2:** one bucket per environment for photos, added in KT5. This depends on the Cloudflare connection's token scope (KT-E).
- **Audit:** invite redemption, moderation actions, account deletion. Scrap and post contents are never written to audit or logs.
- **Notifications:** an in-app counter for requests, scraps, testimonials awaiting approval and birthdays.

## 5. Out of scope

Direct messages and chat, native mobile apps, games and third-party apps, algorithmic feeds, ads, paid plans, video, importing data from any old Orkut account, and a custom domain (the `workers.dev` addresses are used until one is bought).
