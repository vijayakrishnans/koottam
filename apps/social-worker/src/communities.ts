import type { CommunityDetail, CommunitySummary, TopicSummary } from "@saas/contracts/social";
import type { Community, CommunityRepository, Membership, SocialProfile, SocialRepository, TopicRow } from "@saas/db/social";
import { fail, invalid, notFound, ok } from "./http.js";

const SLUG_RE = /^[a-z0-9][a-z0-9-]{2,49}$/;
const RESERVED_SLUGS = new Set(["new", "mine", "admin", "koottam", "support", "official"]);
const COMMUNITY_RE = /^\/v1\/social\/communities\/([^/]+)$/;
const COMMUNITY_SUB_RE = /^\/v1\/social\/communities\/([^/]+)\/(join|leave|members|topics)$/;
const MEMBER_ACTION_RE = /^\/v1\/social\/communities\/([^/]+)\/members\/([^/]+)\/(approve|ban|unban|make-moderator|make-member|make-owner)$/;
const TOPIC_RE = /^\/v1\/social\/topics\/([^/]+)$/;
const TOPIC_SUB_RE = /^\/v1\/social\/topics\/([^/]+)\/(posts|lock|unlock)$/;
const POST_RE = /^\/v1\/social\/posts\/([^/]+)$/;
const PERSON_RE = /^\/v1\/social\/people\/([^/]+)\/communities$/;
const MAX_OWNED = 20;
const MAX_POSTS_PER_HOUR = 60;
const MAX_POST = 5000;

const newId = (prefix: string): string => `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`;
const card = (c: { handle: string; displayName: string }) => ({ handle: c.handle, displayName: c.displayName });
const isActive = (m: Membership | null): boolean => m?.status === "active";
const moderates = (m: Membership | null): boolean => isActive(m) && (m?.role === "owner" || m?.role === "moderator");
/** Anyone may read an open community's forum; an approval community's is for its active members. */
const canRead = (c: Community, m: Membership | null): boolean => c.joinPolicy === "open" || isActive(m);

const summary = (c: Community): CommunitySummary => ({
  slug: c.slug,
  name: c.name,
  description: c.description,
  category: c.category,
  joinPolicy: c.joinPolicy,
  members: c.members,
});

const topicSummary = (t: TopicRow): TopicSummary => ({
  id: t.id,
  title: t.title,
  author: card(t.author),
  locked: t.locked,
  replies: t.replies,
  lastPostAt: t.lastPostAt,
});

async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await request.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function optionalText(value: unknown, max: number, key: string, fields: Record<string, string[]>): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") {
    fields[key] = ["Must be text"];
    return null;
  }
  const trimmed = value.trim();
  if (trimmed.length > max) fields[key] = [`Must be at most ${max} characters`];
  return trimmed === "" ? null : trimmed;
}

function requiredText(value: unknown, max: number, key: string, fields: Record<string, string[]>): string {
  const text = optionalText(value, max, key, fields);
  if (!text && !fields[key]) fields[key] = ["This is required"];
  return text ?? "";
}

async function createCommunity(
  request: Request,
  communities: CommunityRepository,
  me: SocialProfile,
  now: string,
  requestId: string,
): Promise<Response> {
  const body = await readBody(request);
  if (!body) return fail("bad_request", "Body must be JSON", 400, requestId);
  const fields: Record<string, string[]> = {};
  const slug = typeof body.slug === "string" ? body.slug.trim().toLowerCase() : "";
  if (!SLUG_RE.test(slug)) fields.slug = ["Use 3 to 50 lowercase letters, numbers or hyphens"];
  else if (RESERVED_SLUGS.has(slug)) fields.slug = ["That address is reserved"];
  const name = requiredText(body.name, 80, "name", fields);
  const description = optionalText(body.description, 2000, "description", fields);
  const category = optionalText(body.category, 40, "category", fields);
  const joinPolicy = body.joinPolicy ?? "open";
  if (joinPolicy !== "open" && joinPolicy !== "approval") fields.joinPolicy = ["Must be open or approval"];
  if (Object.keys(fields).length > 0) return invalid(requestId, fields);

  if ((await communities.countOwned(me.userId)) >= MAX_OWNED) {
    return fail("community_limit", `You can own ${MAX_OWNED} communities`, 409, requestId);
  }
  try {
    await communities.create({
      id: newId("com"), slug, name, description, category, joinPolicy: String(joinPolicy), ownerId: me.userId, now,
    });
  } catch (err) {
    if (/UNIQUE constraint failed/i.test(String(err))) return invalid(requestId, { slug: ["That address is taken"] });
    throw err;
  }
  const created = await communities.bySlug(slug);
  return ok({ community: await detail(created!, { role: "owner", status: "active" }, me, null) }, requestId, 201);
}

async function detail(
  c: Community,
  m: Membership | null,
  me: SocialProfile,
  repo: SocialRepository | null,
): Promise<CommunityDetail> {
  let owner = c.ownerId === me.userId ? card(me) : null;
  if (!owner && repo) {
    const profile = await repo.profileByUser(c.ownerId);
    // Someone blocked with the viewer stays invisible here too.
    if (profile && !(await repo.isBlockedEitherWay(me.userId, c.ownerId))) owner = card(profile);
  }
  return {
    ...summary(c),
    owner,
    myRole: m && m.status !== "banned" ? m.role : null,
    myStatus: m?.status ?? null,
    canRead: canRead(c, m),
    canPost: isActive(m),
    canModerate: moderates(m),
  };
}

async function memberAction(
  communities: CommunityRepository,
  repo: SocialRepository,
  c: Community,
  mine: Membership | null,
  me: SocialProfile,
  handle: string,
  action: string,
  requestId: string,
): Promise<Response> {
  if (!moderates(mine)) return fail("forbidden", "Only moderators can do this", 403, requestId);
  const person = await repo.profileByHandle(handle);
  if (!person) return notFound(requestId);
  const theirs = await communities.membership(c.id, person.userId);
  if (!theirs) return notFound(requestId);
  const iAmOwner = mine?.role === "owner";
  const done = ok({ ok: true }, requestId);

  if (person.userId === me.userId) return invalid(requestId, { handle: ["You can't do this to yourself"] });
  if (theirs.role === "owner") return fail("forbidden", "The owner can't be changed this way", 403, requestId);

  switch (action) {
    case "approve":
      if (theirs.status !== "pending") return fail("conflict", "They aren't waiting for approval", 409, requestId);
      await communities.setStatus(c.id, person.userId, "active");
      return done;
    case "ban":
      // A moderator can't remove another moderator; that's the owner's call.
      if (theirs.role === "moderator" && !iAmOwner) return fail("forbidden", "Only the owner can ban a moderator", 403, requestId);
      await communities.setStatus(c.id, person.userId, "banned");
      return done;
    case "unban":
      if (theirs.status !== "banned") return fail("conflict", "They aren't banned", 409, requestId);
      // Back to being a non-member, so they choose whether to rejoin.
      await communities.removeMember(c.id, person.userId);
      return done;
  }

  if (!iAmOwner) return fail("forbidden", "Only the owner can do this", 403, requestId);
  if (theirs.status !== "active") return fail("conflict", "They must be an active member first", 409, requestId);
  if (action === "make-moderator") await communities.setRole(c.id, person.userId, "moderator");
  else if (action === "make-member") await communities.setRole(c.id, person.userId, "member");
  else await communities.transferOwner(c.id, me.userId, person.userId);
  return done;
}

async function topicRoute(
  request: Request,
  repo: SocialRepository,
  communities: CommunityRepository,
  me: SocialProfile,
  id: string,
  sub: string | null,
  now: string,
  requestId: string,
): Promise<Response> {
  const method = request.method;
  const topic = await communities.topic(me.userId, id);
  if (!topic) return notFound(requestId);
  const c = await communities.communityById(topic.communityId);
  if (!c) return notFound(requestId);
  const m = await communities.membership(c.id, me.userId);
  if (!canRead(c, m)) return notFound(requestId);

  if (sub === null && method === "GET") {
    const posts = await communities.posts(me.userId, id);
    const mod = moderates(m);
    return ok(
      {
        topic: {
          ...topicSummary(topic),
          communitySlug: c.slug,
          communityName: c.name,
          canPost: isActive(m) && !topic.locked,
          canModerate: mod,
        },
        posts: posts.map((p) => ({
          id: p.id,
          author: card(p.author),
          body: p.body,
          createdAt: p.createdAt,
          canDelete: mod || p.author.userId === me.userId,
        })),
      },
      requestId,
    );
  }

  if (sub === null && method === "DELETE") {
    if (!moderates(m) && topic.author.userId !== me.userId) return fail("forbidden", "You can't delete this", 403, requestId);
    await communities.deleteTopic(id, now);
    return ok({ ok: true }, requestId);
  }

  if ((sub === "lock" || sub === "unlock") && method === "POST") {
    if (!moderates(m)) return fail("forbidden", "Only moderators can do this", 403, requestId);
    await communities.setLocked(id, sub === "lock");
    return ok({ ok: true }, requestId);
  }

  if (sub === "posts" && method === "POST") {
    if (!isActive(m)) return fail("members_only", "Only members can post", 403, requestId);
    if (topic.locked) return fail("locked", "This topic is locked", 409, requestId);
    const body = await readBody(request);
    if (!body) return fail("bad_request", "Body must be JSON", 400, requestId);
    const fields: Record<string, string[]> = {};
    const text = requiredText(body.body, MAX_POST, "body", fields);
    if (Object.keys(fields).length > 0) return invalid(requestId, fields);
    if (await overLimit(communities, me.userId, now)) return tooFast(requestId);
    const postId = newId("pst");
    await communities.addPost(postId, id, me.userId, text, now);
    return ok({ id: postId }, requestId, 201);
  }

  return fail("method_not_allowed", "Method not allowed", 405, requestId);
}

async function overLimit(communities: CommunityRepository, userId: string, now: string): Promise<boolean> {
  const hourAgo = new Date(new Date(now).getTime() - 3_600_000).toISOString();
  return (await communities.countPostsSince(userId, hourAgo)) >= MAX_POSTS_PER_HOUR;
}

const tooFast = (requestId: string): Response =>
  fail("post_limit", "You're posting very quickly. Please try again later", 429, requestId);

/** Answers community and forum routes. Null means not one of these. */
export async function handleCommunityRoute(
  request: Request,
  repo: SocialRepository,
  communities: CommunityRepository,
  me: SocialProfile,
  now: string,
  requestId: string,
): Promise<Response | null> {
  const method = request.method;
  const url = new URL(request.url);
  const path = url.pathname;

  if (path === "/v1/social/communities") {
    if (method === "GET") {
      const q = (url.searchParams.get("q") ?? "").trim().slice(0, 80);
      return ok({ communities: (await communities.list(q)).map(summary) }, requestId);
    }
    if (method === "POST") return createCommunity(request, communities, me, now, requestId);
    return fail("method_not_allowed", "Method not allowed", 405, requestId);
  }

  const person = PERSON_RE.exec(path);
  if (person && method === "GET") {
    const profile = await repo.profileByHandle(decodeURIComponent(person[1]!).toLowerCase());
    if (!profile || (await repo.isBlockedEitherWay(me.userId, profile.userId))) return notFound(requestId);
    const sees =
      profile.userId === me.userId || profile.visibility === "everyone" || (await repo.areFriends(me.userId, profile.userId));
    return ok({ communities: sees ? (await communities.ofUser(profile.userId)).map(summary) : [] }, requestId);
  }

  const action = MEMBER_ACTION_RE.exec(path);
  if (action && method === "POST") {
    const c = await communities.bySlug(decodeURIComponent(action[1]!));
    if (!c) return notFound(requestId);
    const mine = await communities.membership(c.id, me.userId);
    return memberAction(communities, repo, c, mine, me, decodeURIComponent(action[2]!).toLowerCase(), action[3]!, requestId);
  }

  const sub = COMMUNITY_SUB_RE.exec(path);
  if (sub) {
    const c = await communities.bySlug(decodeURIComponent(sub[1]!));
    if (!c) return notFound(requestId);
    const mine = await communities.membership(c.id, me.userId);
    switch (sub[2]) {
      case "join": {
        if (method !== "POST") break;
        if (mine?.status === "banned") return fail("banned", "You can't join this community", 403, requestId);
        if (mine) return ok({ status: mine.status }, requestId);
        const status = c.joinPolicy === "open" ? "active" : "pending";
        await communities.addMember(c.id, me.userId, status, now);
        return ok({ status }, requestId, 201);
      }
      case "leave": {
        if (method !== "POST") break;
        if (!mine) return notFound(requestId);
        // Staying banned must survive leaving, or a ban could be undone by rejoining.
        if (mine.status === "banned") return fail("banned", "You aren't a member", 403, requestId);
        if (mine.role === "owner") return fail("owner_must_hand_over", "Hand over the community before leaving", 409, requestId);
        await communities.removeMember(c.id, me.userId);
        return ok({ ok: true }, requestId);
      }
      case "members": {
        if (method !== "GET") break;
        if (!canRead(c, mine)) return ok({ members: [] }, requestId);
        const rows = await communities.members(me.userId, c.id, moderates(mine));
        return ok({ members: rows.map((m) => ({ ...card(m), role: m.role, status: m.status })) }, requestId);
      }
      case "topics": {
        if (method === "GET") {
          if (!canRead(c, mine)) return ok({ topics: [] }, requestId);
          return ok({ topics: (await communities.topics(me.userId, c.id)).map(topicSummary) }, requestId);
        }
        if (method !== "POST") break;
        if (!isActive(mine)) return fail("members_only", "Only members can start topics", 403, requestId);
        const body = await readBody(request);
        if (!body) return fail("bad_request", "Body must be JSON", 400, requestId);
        const fields: Record<string, string[]> = {};
        const title = requiredText(body.title, 150, "title", fields);
        const text = requiredText(body.body, MAX_POST, "body", fields);
        if (Object.keys(fields).length > 0) return invalid(requestId, fields);
        if (await overLimit(communities, me.userId, now)) return tooFast(requestId);
        const topicId = newId("top");
        await communities.createTopic({ topicId, postId: newId("pst"), communityId: c.id, authorId: me.userId, title, body: text, now });
        return ok({ id: topicId }, requestId, 201);
      }
    }
    return fail("method_not_allowed", "Method not allowed", 405, requestId);
  }

  const single = COMMUNITY_RE.exec(path);
  if (single) {
    const c = await communities.bySlug(decodeURIComponent(single[1]!));
    if (!c) return notFound(requestId);
    const mine = await communities.membership(c.id, me.userId);
    if (method === "GET") return ok({ community: await detail(c, mine, me, repo) }, requestId);
    if (method === "DELETE") {
      if (!isActive(mine) || mine?.role !== "owner") return fail("forbidden", "Only the owner can delete this", 403, requestId);
      await communities.softDelete(c.id, now);
      return ok({ ok: true }, requestId);
    }
    return fail("method_not_allowed", "Method not allowed", 405, requestId);
  }

  const topicSub = TOPIC_SUB_RE.exec(path);
  if (topicSub) return topicRoute(request, repo, communities, me, decodeURIComponent(topicSub[1]!), topicSub[2]!, now, requestId);
  const topic = TOPIC_RE.exec(path);
  if (topic) return topicRoute(request, repo, communities, me, decodeURIComponent(topic[1]!), null, now, requestId);

  const post = POST_RE.exec(path);
  if (post && method === "DELETE") {
    const id = decodeURIComponent(post[1]!);
    const row = await communities.postById(id);
    if (!row) return notFound(requestId);
    const communityId = await communities.topicCommunity(row.topicId);
    if (!communityId) return notFound(requestId);
    const mine = await communities.membership(communityId, me.userId);
    if (row.authorId !== me.userId && !moderates(mine)) return fail("forbidden", "You can't delete this", 403, requestId);
    await communities.deletePost(id, now);
    return ok({ ok: true }, requestId);
  }

  return null;
}
