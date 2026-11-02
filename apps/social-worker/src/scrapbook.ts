import type { RatingValues, Scrap, Testimonial } from "@saas/contracts/social";
import type { ScrapRow, ScrapbookRepository, SocialProfile, SocialRepository, TestimonialRow } from "@saas/db/social";
import { fail, invalid, notFound, ok } from "./http.js";

const PAGE_RE = /^\/v1\/social\/people\/([^/]+)\/(scraps|testimonials|standing|fan|rating)$/;
const SCRAP_RE = /^\/v1\/social\/scraps\/([^/]+)$/;
const TESTIMONIAL_RE = /^\/v1\/social\/testimonials\/([^/]+)$/;
const TESTIMONIAL_ANSWER_RE = /^\/v1\/social\/testimonials\/([^/]+)\/(approve|hide)$/;
const MAX_SCRAP = 1024;
const MAX_TESTIMONIAL = 2000;
const MAX_SCRAPS_PER_HOUR = 60;
/** Below this, an average could give away one person's rating. */
const MIN_RATERS = 3;
const BIRTHDAY_WINDOW_DAYS = 7;

const card = (c: { handle: string; displayName: string }) => ({ handle: c.handle, displayName: c.displayName });
const newId = (prefix: string): string => `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`;

function toScrap(s: ScrapRow, viewerId: string): Scrap {
  return {
    id: s.id,
    from: card(s.from),
    to: card(s.to),
    body: s.body,
    visibility: s.visibility,
    createdAt: s.createdAt,
    canDelete: s.from.userId === viewerId || s.to.userId === viewerId,
    mine: s.from.userId === viewerId,
  };
}

function toTestimonial(t: TestimonialRow, viewerId: string): Testimonial {
  return {
    id: t.id,
    from: card(t.from),
    body: t.body,
    status: t.status,
    createdAt: t.createdAt,
    mine: t.from.userId === viewerId,
  };
}

async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await request.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function parseText(body: Record<string, unknown>, max: number): { text: string } | { error: string } {
  const text = typeof body.body === "string" ? body.body.trim() : "";
  if (!text) return { error: "Write something first" };
  if (text.length > max) return { error: `Must be at most ${max} characters` };
  return { text };
}

function parseRating(body: Record<string, unknown>): RatingValues | null {
  const values = [body.trusty, body.cool, body.funny];
  if (!values.every((v) => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 3)) return null;
  return { trusty: body.trusty as number, cool: body.cool as number, funny: body.funny as number };
}

/** Days from today to the next occurrence of this date, ignoring the year. */
function daysUntil(day: number, month: number, today: Date): number {
  const year = today.getUTCFullYear();
  const start = Date.UTC(year, today.getUTCMonth(), today.getUTCDate());
  let next = Date.UTC(year, month - 1, day);
  if (next < start) next = Date.UTC(year + 1, month - 1, day);
  return Math.round((next - start) / 86_400_000);
}

/** Answers routes about a person's page, or scraps and testimonials by id. Null means not one of these. */
export async function handleScrapbookRoute(
  request: Request,
  repo: SocialRepository,
  book: ScrapbookRepository,
  me: SocialProfile,
  now: string,
  requestId: string,
): Promise<Response | null> {
  const method = request.method;
  const path = new URL(request.url).pathname;
  const userId = me.userId;

  if (path === "/v1/social/home" && method === "GET") {
    const scraps = await book.home(userId);
    const today = new Date(now);
    const birthdays = (await book.friendsBirthdays(userId))
      .map((b) => ({ ...b, inDays: daysUntil(b.day, b.month, today) }))
      .filter((b) => b.inDays <= BIRTHDAY_WINDOW_DAYS)
      .sort((a, b) => a.inDays - b.inDays)
      .map((b) => ({ ...card(b), day: b.day, month: b.month }));
    return ok({ scraps: scraps.map((s) => toScrap(s, userId)), birthdays }, requestId);
  }

  if (path === "/v1/social/counters" && method === "GET") return ok(await book.counters(userId), requestId);

  const scrapId = SCRAP_RE.exec(path);
  if (scrapId && method === "DELETE") {
    const id = decodeURIComponent(scrapId[1]!);
    const scrap = await book.scrapById(id);
    if (!scrap || (scrap.fromUser !== userId && scrap.toUser !== userId)) return notFound(requestId);
    await book.deleteScrap(id, now);
    return ok({ ok: true }, requestId);
  }

  const answer = TESTIMONIAL_ANSWER_RE.exec(path);
  if (answer && method === "POST") {
    const id = decodeURIComponent(answer[1]!);
    const testimonial = await book.testimonialById(id);
    if (!testimonial || testimonial.toUser !== userId) return notFound(requestId);
    await book.setTestimonialStatus(id, answer[2] === "approve" ? "approved" : "hidden");
    return ok({ ok: true }, requestId);
  }

  const testimonialId = TESTIMONIAL_RE.exec(path);
  if (testimonialId && method === "DELETE") {
    const id = decodeURIComponent(testimonialId[1]!);
    const testimonial = await book.testimonialById(id);
    if (!testimonial || testimonial.fromUser !== userId) return notFound(requestId);
    await book.deleteTestimonial(id);
    return ok({ ok: true }, requestId);
  }

  const page = PAGE_RE.exec(path);
  if (!page) return null;

  const person = await repo.profileByHandle(decodeURIComponent(page[1]!).toLowerCase());
  if (!person || (await repo.isBlockedEitherWay(userId, person.userId))) return notFound(requestId);

  const isOwner = person.userId === userId;
  const friends = !isOwner && (await repo.areFriends(userId, person.userId));
  const seesPage = isOwner || friends || person.visibility === "everyone";
  const kind = page[2]!;

  if (kind === "scraps") {
    if (method === "GET") {
      if (!seesPage) return ok({ scraps: [], hidden: true }, requestId);
      if (isOwner) await book.markScrapsSeen(userId, now);
      const scraps = await book.scrapsOnPage(userId, person.userId, isOwner || friends);
      return ok({ scraps: scraps.map((s) => toScrap(s, userId)), hidden: false }, requestId);
    }
    if (method === "POST") {
      if (!isOwner && !friends) return fail("friends_only", "Only friends can write here", 403, requestId);
      const body = await readBody(request);
      if (!body) return fail("bad_request", "Body must be JSON", 400, requestId);
      const parsed = parseText(body, MAX_SCRAP);
      if ("error" in parsed) return invalid(requestId, { body: [parsed.error] });
      const visibility = body.visibility ?? "everyone";
      if (visibility !== "everyone" && visibility !== "friends") {
        return invalid(requestId, { visibility: ["Must be everyone or friends"] });
      }
      const hourAgo = new Date(new Date(now).getTime() - 3_600_000).toISOString();
      if ((await book.countScrapsSince(userId, hourAgo)) >= MAX_SCRAPS_PER_HOUR) {
        return fail("scrap_limit", "You're writing very quickly. Please try again later", 429, requestId);
      }
      const id = newId("scr");
      await book.createScrap({ id, toUser: person.userId, fromUser: userId, body: parsed.text, visibility, now });
      const row: ScrapRow = {
        id,
        body: parsed.text,
        visibility,
        createdAt: now,
        from: { userId, handle: me.handle, displayName: me.displayName },
        to: { userId: person.userId, handle: person.handle, displayName: person.displayName },
      };
      return ok({ scrap: toScrap(row, userId) }, requestId, 201);
    }
  }

  if (kind === "testimonials") {
    if (method === "GET") {
      if (!seesPage) return ok({ testimonials: [], hidden: true }, requestId);
      const rows = await book.testimonialsOnPage(userId, person.userId, isOwner);
      return ok({ testimonials: rows.map((t) => toTestimonial(t, userId)), hidden: false }, requestId);
    }
    if (method === "POST") {
      if (isOwner) return invalid(requestId, { body: ["You can't write about yourself"] });
      if (!friends) return fail("friends_only", "Only friends can write testimonials", 403, requestId);
      const body = await readBody(request);
      if (!body) return fail("bad_request", "Body must be JSON", 400, requestId);
      const parsed = parseText(body, MAX_TESTIMONIAL);
      if ("error" in parsed) return invalid(requestId, { body: [parsed.error] });
      const id = newId("tst");
      try {
        await book.createTestimonial({ id, toUser: person.userId, fromUser: userId, body: parsed.text, now });
      } catch (err) {
        if (/UNIQUE constraint failed/i.test(String(err))) {
          return fail("conflict", "You've already written one for this person", 409, requestId);
        }
        throw err;
      }
      const row: TestimonialRow = {
        id,
        toUser: person.userId,
        from: { userId, handle: me.handle, displayName: me.displayName },
        body: parsed.text,
        status: "pending",
        createdAt: now,
      };
      return ok({ testimonial: toTestimonial(row, userId) }, requestId, 201);
    }
  }

  if (kind === "standing" && method === "GET") {
    const canRate = friends;
    if (!seesPage) return ok({ fans: null, isFan: false, ratings: null, myRating: null, canRate }, requestId);
    const { raters, averages } = await book.ratingAverages(person.userId);
    return ok(
      {
        fans: await book.fanCount(person.userId),
        isFan: isOwner ? false : await book.isFan(userId, person.userId),
        ratings: raters >= MIN_RATERS ? averages : null,
        myRating: isOwner ? null : await book.myRating(userId, person.userId),
        canRate,
      },
      requestId,
    );
  }

  if (kind === "fan" && (method === "PUT" || method === "DELETE")) {
    if (isOwner) return invalid(requestId, { handle: ["You can't be your own fan"] });
    await book.setFan(userId, person.userId, method === "PUT", now);
    return ok({ ok: true }, requestId);
  }

  if (kind === "rating" && method === "PUT") {
    if (!friends) return fail("friends_only", "Only friends can rate", 403, requestId);
    const body = await readBody(request);
    const rating = body && parseRating(body);
    if (!rating) return invalid(requestId, { rating: ["Each rating must be a whole number from 0 to 3"] });
    await book.rate(userId, person.userId, rating, now);
    return ok({ ok: true }, requestId);
  }

  return fail("method_not_allowed", "Method not allowed", 405, requestId);
}
