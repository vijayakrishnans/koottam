import type { PublicProfileCard } from "@saas/contracts/social";
import type { Card, FriendRequest, SocialProfile, SocialRepository } from "@saas/db/social";
import { fail, invalid, notFound, ok } from "./http.js";

const REQUEST_RE = /^\/v1\/social\/friend-requests\/([^/]+)$/;
const ANSWER_RE = /^\/v1\/social\/friend-requests\/([^/]+)\/(accept|decline)$/;
const FRIENDS_OF_RE = /^\/v1\/social\/people\/([^/]+)\/friends$/;
const FRIEND_RE = /^\/v1\/social\/friends\/([^/]+)$/;
const BLOCK_RE = /^\/v1\/social\/blocks\/([^/]+)$/;
const MAX_OUTGOING = 100;

const toCard = (c: Card): PublicProfileCard => ({ handle: c.handle, displayName: c.displayName });
const toRequest = (r: FriendRequest) => ({ id: r.id, person: toCard(r.person), createdAt: r.createdAt });
const param = (match: RegExpExecArray): string => decodeURIComponent(match[1]!).toLowerCase();

async function sendRequest(
  request: Request,
  repo: SocialRepository,
  me: SocialProfile,
  now: string,
  requestId: string,
): Promise<Response> {
  let body: { handle?: unknown };
  try {
    body = (await request.json()) as { handle?: unknown };
  } catch {
    return fail("bad_request", "Body must be JSON", 400, requestId);
  }
  if (typeof body.handle !== "string") return invalid(requestId, { handle: ["A handle is required"] });
  const handle = body.handle.trim().toLowerCase();
  if (handle === me.handle) return invalid(requestId, { handle: ["That's you"] });

  const other = await repo.profileByHandle(handle);
  if (!other || (await repo.isBlockedEitherWay(me.userId, other.userId))) return notFound(requestId);
  if (await repo.areFriends(me.userId, other.userId)) return fail("conflict", "You're already friends", 409, requestId);

  const pending = await repo.pendingBetween(me.userId, other.userId);
  if (pending?.fromUser === me.userId) return fail("conflict", "You've already asked", 409, requestId);
  if (pending) {
    // They asked first, so asking back is a yes.
    await repo.acceptFriendRequest(pending.id, me.userId, now);
    return ok({ connection: "friends" }, requestId);
  }
  if ((await repo.countOutgoingPending(me.userId)) >= MAX_OUTGOING) {
    return fail("request_limit", "You have too many unanswered requests", 409, requestId);
  }
  try {
    await repo.createFriendRequest(`frq_${crypto.randomUUID().replaceAll("-", "")}`, me.userId, other.userId, now);
  } catch (err) {
    if (/UNIQUE constraint failed/i.test(String(err))) return fail("conflict", "You've already asked", 409, requestId);
    throw err;
  }
  return ok({ connection: "request_sent" }, requestId, 201);
}

/** Friends and blocks. Everything here is written so a block looks like the person not existing. */
export async function handleFriendRoute(
  request: Request,
  repo: SocialRepository,
  me: SocialProfile,
  now: string,
  requestId: string,
): Promise<Response> {
  const method = request.method;
  const url = new URL(request.url);
  const path = url.pathname;
  const userId = me.userId;

  if (path === "/v1/social/search" && method === "GET") {
    const q = (url.searchParams.get("q") ?? "").trim();
    if (q.length < 2) return ok({ people: [] }, requestId);
    return ok({ people: (await repo.search(userId, q.slice(0, 60))).map(toCard) }, requestId);
  }

  if (path === "/v1/social/friend-requests") {
    if (method === "GET") {
      const { incoming, outgoing } = await repo.listFriendRequests(userId);
      return ok({ incoming: incoming.map(toRequest), outgoing: outgoing.map(toRequest) }, requestId);
    }
    if (method === "POST") return sendRequest(request, repo, me, now, requestId);
    return fail("method_not_allowed", "Method not allowed", 405, requestId);
  }

  const answer = ANSWER_RE.exec(path);
  if (answer && method === "POST") {
    const id = decodeURIComponent(answer[1]!);
    const done =
      answer[2] === "accept"
        ? await repo.acceptFriendRequest(id, userId, now)
        : await repo.declineFriendRequest(id, userId, now);
    return done ? ok({ ok: true }, requestId) : notFound(requestId);
  }

  const single = REQUEST_RE.exec(path);
  if (single && method === "DELETE") {
    const done = await repo.cancelFriendRequest(decodeURIComponent(single[1]!), userId, now);
    return done ? ok({ ok: true }, requestId) : notFound(requestId);
  }

  const friendsOf = FRIENDS_OF_RE.exec(path);
  if (friendsOf && method === "GET") {
    const person = await repo.profileByHandle(param(friendsOf));
    if (!person || (await repo.isBlockedEitherWay(userId, person.userId))) return notFound(requestId);
    const allowed =
      person.userId === userId || person.visibility === "everyone" || (await repo.areFriends(userId, person.userId));
    if (!allowed) return ok({ people: [], hidden: true }, requestId);
    return ok({ people: (await repo.listFriends(person.userId, userId)).map(toCard), hidden: false }, requestId);
  }

  const friend = FRIEND_RE.exec(path);
  if (friend && method === "DELETE") {
    const person = await repo.profileByHandle(param(friend));
    if (!person) return notFound(requestId);
    return (await repo.removeFriend(userId, person.userId)) ? ok({ ok: true }, requestId) : notFound(requestId);
  }

  if (path === "/v1/social/blocks" && method === "GET") {
    return ok({ people: (await repo.listBlocked(userId)).map(toCard) }, requestId);
  }

  const block = BLOCK_RE.exec(path);
  if (block && (method === "PUT" || method === "DELETE")) {
    const person = await repo.profileByHandle(param(block));
    if (!person) return notFound(requestId);
    if (person.userId === userId) return invalid(requestId, { handle: ["You can't block yourself"] });
    if (method === "PUT") await repo.block(userId, person.userId, now);
    else await repo.unblock(userId, person.userId);
    return ok({ ok: true }, requestId);
  }

  return notFound(requestId);
}
