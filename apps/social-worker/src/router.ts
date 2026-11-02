import type { ConnectionState, InviteStatus, InviteSummary, MyProfile, PublicProfile } from "@saas/contracts/social";
import { createSqlExecutor } from "@saas/db/d1";
import {
  createScrapbookRepository,
  createSocialRepository,
  type SocialInvite,
  type SocialProfile,
  type SocialRepository,
} from "@saas/db/social";
import type { Env } from "./env.js";
import { fail, invalid, notFound, ok } from "./http.js";
import { handleFriendRoute } from "./friends.js";
import { handleScrapbookRoute } from "./scrapbook.js";
import { parseCreate, parseEdit } from "./validate.js";

const REQUEST_ID_RE = /^[\w-]{1,128}$/;
const INVITE_RE = /^\/v1\/social\/invites\/([^/]+)$/;
const PERSON_RE = /^\/v1\/social\/people\/([^/]+)$/;
const MAX_OPEN_INVITES = 10;
const INVITE_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function newInviteCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

async function readJson(request: Request): Promise<{ ok: true; body: unknown } | { ok: false }> {
  try {
    return { ok: true, body: await request.json() };
  } catch {
    return { ok: false };
  }
}

function toMine(p: SocialProfile): MyProfile {
  return {
    handle: p.handle,
    displayName: p.displayName,
    limited: false,
    about: p.about,
    city: p.city,
    country: p.country,
    interests: p.interests,
    relationship: p.relationship,
    birthdayDay: p.birthdayDay,
    birthdayMonth: p.birthdayMonth,
    birthdayVisible: p.birthdayVisible,
    visibility: p.visibility,
    isMe: true,
    joinedAt: p.createdAt,
    connection: "self",
    friendRequestId: null,
    mutualFriends: null,
  };
}

/** What another member sees. A friends-only page shows just its card to non-friends. Never a user id or email. */
function toPublic(
  p: SocialProfile,
  connection: ConnectionState,
  friendRequestId: string | null,
  mutualFriends: number,
): PublicProfile {
  const limited = p.visibility !== "everyone" && connection !== "friends";
  return {
    handle: p.handle,
    displayName: p.displayName,
    limited,
    about: limited ? null : p.about,
    city: limited ? null : p.city,
    country: limited ? null : p.country,
    interests: limited ? null : p.interests,
    relationship: limited ? null : p.relationship,
    birthdayDay: !limited && p.birthdayVisible ? p.birthdayDay : null,
    birthdayMonth: !limited && p.birthdayVisible ? p.birthdayMonth : null,
    isMe: false,
    joinedAt: limited ? null : p.createdAt,
    connection,
    friendRequestId,
    mutualFriends: limited ? null : mutualFriends,
  };
}

async function viewPerson(repo: SocialRepository, viewerId: string, person: SocialProfile): Promise<PublicProfile> {
  const friends = await repo.areFriends(viewerId, person.userId);
  const pending = friends ? null : await repo.pendingBetween(viewerId, person.userId);
  const connection: ConnectionState = friends
    ? "friends"
    : !pending
      ? "none"
      : pending.fromUser === viewerId
        ? "request_sent"
        : "request_received";
  return toPublic(person, connection, pending?.id ?? null, await repo.countMutualFriends(viewerId, person.userId));
}

function inviteStatus(i: SocialInvite, now: string): InviteStatus {
  if (i.redeemedAt) return "redeemed";
  if (i.revokedAt) return "revoked";
  if (i.expiresAt && i.expiresAt <= now) return "expired";
  return "open";
}

function toInviteSummary(i: SocialInvite, now: string): InviteSummary {
  return { id: i.id, status: inviteStatus(i, now), createdAt: i.createdAt, expiresAt: i.expiresAt };
}

async function createProfile(
  request: Request,
  repo: SocialRepository,
  userId: string,
  now: string,
  requestId: string,
): Promise<Response> {
  const parsed = await readJson(request);
  if (!parsed.ok) return fail("bad_request", "Body must be JSON", 400, requestId);
  const { fields, inviteCode, handle, displayName } = parseCreate(parsed.body);
  if (Object.keys(fields).length > 0) return invalid(requestId, fields);

  if (await repo.profileByUser(userId)) return fail("conflict", "You already have a profile", 409, requestId);
  if (await repo.profileByHandle(handle)) return invalid(requestId, { handle: ["That handle is taken"] });

  const codeHash = await sha256Hex(inviteCode);
  let created: boolean;
  try {
    created = await repo.createProfileWithInvite({ userId, handle, displayName, codeHash, now });
  } catch (err) {
    if (/UNIQUE constraint failed/i.test(String(err))) return invalid(requestId, { handle: ["That handle is taken"] });
    throw err;
  }
  if (!created) return invalid(requestId, { inviteCode: ["This invite is not valid"] });

  const profile = await repo.profileByUser(userId);
  if (!profile) return fail("internal_error", "Profile was not created", 500, requestId);
  return ok({ profile: toMine(profile) }, requestId, 201);
}

async function member(request: Request, env: Env, requestId: string): Promise<Response> {
  const method = request.method;
  const path = new URL(request.url).pathname;
  const userId = request.headers.get("x-actor-subject-id");
  if (!userId || request.headers.get("x-actor-subject-type") !== "user") {
    return fail("unauthorized", "Sign in as a person", 401, requestId);
  }

  const repo = createSocialRepository(createSqlExecutor(env.PLATFORM_DB!));
  const now = new Date().toISOString();

  if (path === "/v1/social/me" && method === "POST") return createProfile(request, repo, userId, now, requestId);

  // Everything below needs a profile: that is what an invite buys.
  const mine = await repo.profileByUser(userId);
  if (!mine) return fail("profile_required", "Join with an invite first", 403, requestId);

  if (path === "/v1/social/me") {
    if (method === "GET") return ok({ profile: toMine(mine) }, requestId);
    if (method === "PATCH") {
      const parsed = await readJson(request);
      if (!parsed.ok) return fail("bad_request", "Body must be JSON", 400, requestId);
      const { fields, edit } = parseEdit(parsed.body, mine);
      if (Object.keys(fields).length > 0) return invalid(requestId, fields);
      await repo.updateProfile(userId, edit, now);
      return ok({ profile: toMine((await repo.profileByUser(userId))!) }, requestId);
    }
    return fail("method_not_allowed", "Method not allowed", 405, requestId);
  }

  if (path === "/v1/social/invites") {
    if (method === "GET") {
      const invites = await repo.listInvites(userId);
      return ok({ invites: invites.map((i) => toInviteSummary(i, now)) }, requestId);
    }
    if (method === "POST") {
      if ((await repo.countOpenInvites(userId, now)) >= MAX_OPEN_INVITES) {
        return fail("invite_limit", `You can have ${MAX_OPEN_INVITES} open invites at a time`, 409, requestId);
      }
      const code = newInviteCode();
      const invite = await repo.createInvite({
        id: `inv_${crypto.randomUUID().replaceAll("-", "")}`,
        codeHash: await sha256Hex(code),
        createdBy: userId,
        expiresAt: new Date(Date.now() + INVITE_LIFETIME_MS).toISOString(),
        now,
      });
      return ok({ invite: toInviteSummary(invite, now), code }, requestId, 201);
    }
    return fail("method_not_allowed", "Method not allowed", 405, requestId);
  }

  const inviteMatch = INVITE_RE.exec(path);
  if (inviteMatch && method === "DELETE") {
    const revoked = await repo.revokeInvite(decodeURIComponent(inviteMatch[1]!), userId, now);
    return revoked ? ok({ revoked: true }, requestId) : notFound(requestId);
  }

  const personMatch = PERSON_RE.exec(path);
  if (personMatch && method === "GET") {
    const handle = decodeURIComponent(personMatch[1]!).toLowerCase();
    if (handle === mine.handle) return ok({ profile: toMine(mine) }, requestId);
    const person = await repo.profileByHandle(handle);
    // A block reads exactly like the person not existing, in both directions.
    if (!person || (await repo.isBlockedEitherWay(userId, person.userId))) return notFound(requestId);
    return ok({ profile: await viewPerson(repo, userId, person) }, requestId);
  }

  const executor = createSqlExecutor(env.PLATFORM_DB!);
  const scrapbook = await handleScrapbookRoute(request, repo, createScrapbookRepository(executor), mine, now, requestId);
  return scrapbook ?? handleFriendRoute(request, repo, mine, now, requestId);
}

export async function route(request: Request, env: Env): Promise<Response> {
  const headerId = request.headers.get("x-request-id") ?? "";
  const requestId = REQUEST_ID_RE.test(headerId) ? headerId : crypto.randomUUID();
  const url = new URL(request.url);

  if (url.pathname === "/health") return ok({ status: "ok", environment: env.ENVIRONMENT }, requestId);
  if (!env.PLATFORM_DB) return fail("internal_error", "Database unavailable", 503, requestId);

  try {
    const inviteMatch = INVITE_RE.exec(url.pathname);
    if (inviteMatch && request.method === "GET") {
      const repo = createSocialRepository(createSqlExecutor(env.PLATFORM_DB));
      const valid = await repo.inviteUsable(
        await sha256Hex(decodeURIComponent(inviteMatch[1]!)),
        new Date().toISOString(),
      );
      return ok({ valid }, requestId);
    }
    return await member(request, env, requestId);
  } catch {
    // No detail in the response or logs: bodies here hold people's words.
    return fail("internal_error", "Something went wrong", 500, requestId);
  }
}
