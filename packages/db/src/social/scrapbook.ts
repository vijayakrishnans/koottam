import type { SqlExecutor, SqlRow } from "../d1/executor.js";
import { type Card, notBlockedWith } from "./repository.js";

export interface ScrapRow {
  id: string;
  from: Card;
  to: Card;
  body: string;
  visibility: "everyone" | "friends";
  createdAt: string;
}

export interface TestimonialRow {
  id: string;
  toUser: string;
  from: Card;
  body: string;
  status: "pending" | "approved" | "hidden";
  createdAt: string;
}

export interface Ratings {
  trusty: number;
  cool: number;
  funny: number;
}

const SCRAP_SELECT = `SELECT s.id, s.body, s.visibility, s.created_at,
    f.user_id AS from_id, f.handle AS from_handle, f.display_name AS from_name,
    t.user_id AS to_id, t.handle AS to_handle, t.display_name AS to_name
  FROM social_scraps s
  JOIN social_profiles f ON f.user_id = s.from_user AND f.deleted_at IS NULL
  JOIN social_profiles t ON t.user_id = s.to_user AND t.deleted_at IS NULL`;

const mapScrap = (row: SqlRow): ScrapRow => ({
  id: String(row.id),
  body: String(row.body),
  visibility: row.visibility === "friends" ? "friends" : "everyone",
  createdAt: String(row.created_at),
  from: { userId: String(row.from_id), handle: String(row.from_handle), displayName: String(row.from_name) },
  to: { userId: String(row.to_id), handle: String(row.to_handle), displayName: String(row.to_name) },
});

const mapTestimonial = (row: SqlRow): TestimonialRow => ({
  id: String(row.id),
  toUser: String(row.to_user),
  body: String(row.body),
  status: row.status === "approved" ? "approved" : row.status === "hidden" ? "hidden" : "pending",
  createdAt: String(row.created_at),
  from: { userId: String(row.from_user), handle: String(row.handle), displayName: String(row.display_name) },
});

/** Scraps a viewer's friends received or the viewer received. $1 is the viewer. */
const FRIENDS_OF_VIEWER = `SELECT CASE WHEN user_a = $1 THEN user_b ELSE user_a END
  FROM social_friendships WHERE user_a = $1 OR user_b = $1`;

const PAGE_SIZE = 50;

export function createScrapbookRepository(sql: SqlExecutor) {
  return {
    async createScrap(input: {
      id: string;
      toUser: string;
      fromUser: string;
      body: string;
      visibility: string;
      now: string;
    }): Promise<void> {
      await sql.execute(
        `INSERT INTO social_scraps (id, to_user, from_user, body, visibility, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [input.id, input.toUser, input.fromUser, input.body, input.visibility, input.now],
      );
    },

    async countScrapsSince(fromUser: string, since: string): Promise<number> {
      const { rows } = await sql.execute(
        "SELECT COUNT(*) AS n FROM social_scraps WHERE from_user = $1 AND created_at > $2",
        [fromUser, since],
      );
      return Number(rows[0]?.n ?? 0);
    },

    /** A page's scraps as this viewer may see them, newest first. */
    async scrapsOnPage(viewerId: string, pageUser: string, seesFriendsOnly: boolean): Promise<ScrapRow[]> {
      const { rows } = await sql.execute(
        `${SCRAP_SELECT}
         WHERE s.to_user = $2 AND s.deleted_at IS NULL AND ${notBlockedWith("s.from_user")}
           AND (s.visibility = 'everyone' OR $3 = 1 OR s.from_user = $1)
         ORDER BY s.created_at DESC, s.id DESC LIMIT ${PAGE_SIZE}`,
        [viewerId, pageUser, seesFriendsOnly ? 1 : 0],
      );
      return rows.map(mapScrap);
    },

    /** The home page: your scraps and your friends', newest first, with no ranking of any kind. */
    async home(viewerId: string): Promise<ScrapRow[]> {
      const { rows } = await sql.execute(
        `${SCRAP_SELECT}
         WHERE s.deleted_at IS NULL
           AND (s.to_user = $1 OR s.to_user IN (${FRIENDS_OF_VIEWER}))
           AND ${notBlockedWith("s.from_user")} AND ${notBlockedWith("s.to_user")}
         ORDER BY s.created_at DESC, s.id DESC LIMIT ${PAGE_SIZE}`,
        [viewerId],
      );
      return rows.map(mapScrap);
    },

    async scrapById(id: string): Promise<{ toUser: string; fromUser: string } | null> {
      const { rows } = await sql.execute(
        "SELECT to_user, from_user FROM social_scraps WHERE id = $1 AND deleted_at IS NULL",
        [id],
      );
      return rows[0] ? { toUser: String(rows[0].to_user), fromUser: String(rows[0].from_user) } : null;
    },

    async deleteScrap(id: string, now: string): Promise<void> {
      await sql.execute("UPDATE social_scraps SET deleted_at = $2, body = '' WHERE id = $1", [id, now]);
    },

    async markScrapsSeen(userId: string, now: string): Promise<void> {
      await sql.execute(
        `INSERT INTO social_scraps_seen (user_id, seen_at) VALUES ($1, $2)
         ON CONFLICT (user_id) DO UPDATE SET seen_at = excluded.seen_at`,
        [userId, now],
      );
    },

    async counters(userId: string): Promise<{ friendRequests: number; testimonials: number; scraps: number }> {
      const { rows } = await sql.execute(
        `SELECT
           (SELECT COUNT(*) FROM social_friend_requests r WHERE r.to_user = $1 AND r.status = 'pending'
             AND ${notBlockedWith("r.from_user")}) AS friend_requests,
           (SELECT COUNT(*) FROM social_testimonials t WHERE t.to_user = $1 AND t.status = 'pending'
             AND ${notBlockedWith("t.from_user")}) AS testimonials,
           (SELECT COUNT(*) FROM social_scraps s WHERE s.to_user = $1 AND s.deleted_at IS NULL
             AND s.from_user <> $1 AND ${notBlockedWith("s.from_user")}
             AND s.created_at > COALESCE((SELECT seen_at FROM social_scraps_seen WHERE user_id = $1), '')) AS scraps`,
        [userId],
      );
      const r = rows[0] ?? {};
      return {
        friendRequests: Number(r.friend_requests ?? 0),
        testimonials: Number(r.testimonials ?? 0),
        scraps: Number(r.scraps ?? 0),
      };
    },

    /** Friends who show their birthday. The caller decides which are coming up. */
    async friendsBirthdays(viewerId: string): Promise<Array<Card & { day: number; month: number }>> {
      const { rows } = await sql.execute(
        `SELECT p.user_id, p.handle, p.display_name, p.birthday_day, p.birthday_month FROM social_profiles p
         WHERE p.deleted_at IS NULL AND p.birthday_visible = 1
           AND p.birthday_day IS NOT NULL AND p.birthday_month IS NOT NULL
           AND p.user_id IN (${FRIENDS_OF_VIEWER}) AND ${notBlockedWith("p.user_id")}`,
        [viewerId],
      );
      return rows.map((r) => ({
        userId: String(r.user_id),
        handle: String(r.handle),
        displayName: String(r.display_name),
        day: Number(r.birthday_day),
        month: Number(r.birthday_month),
      }));
    },

    async testimonialsOnPage(viewerId: string, pageUser: string, isOwner: boolean): Promise<TestimonialRow[]> {
      const { rows } = await sql.execute(
        `SELECT t.id, t.to_user, t.from_user, t.body, t.status, t.created_at, p.handle, p.display_name
         FROM social_testimonials t
         JOIN social_profiles p ON p.user_id = t.from_user AND p.deleted_at IS NULL
         WHERE t.to_user = $2 AND ${notBlockedWith("t.from_user")}
           AND (t.status = 'approved' OR $3 = 1 OR t.from_user = $1)
         ORDER BY t.created_at DESC LIMIT ${PAGE_SIZE}`,
        [viewerId, pageUser, isOwner ? 1 : 0],
      );
      return rows.map(mapTestimonial);
    },

    async testimonialById(id: string): Promise<{ toUser: string; fromUser: string } | null> {
      const { rows } = await sql.execute("SELECT to_user, from_user FROM social_testimonials WHERE id = $1", [id]);
      return rows[0] ? { toUser: String(rows[0].to_user), fromUser: String(rows[0].from_user) } : null;
    },

    async createTestimonial(input: { id: string; toUser: string; fromUser: string; body: string; now: string }): Promise<void> {
      await sql.execute(
        "INSERT INTO social_testimonials (id, to_user, from_user, body, status, created_at) VALUES ($1, $2, $3, $4, 'pending', $5)",
        [input.id, input.toUser, input.fromUser, input.body, input.now],
      );
    },

    async setTestimonialStatus(id: string, status: "approved" | "hidden"): Promise<void> {
      await sql.execute("UPDATE social_testimonials SET status = $2 WHERE id = $1", [id, status]);
    },

    async deleteTestimonial(id: string): Promise<void> {
      await sql.execute("DELETE FROM social_testimonials WHERE id = $1", [id]);
    },

    async fanCount(userId: string): Promise<number> {
      const { rows } = await sql.execute("SELECT COUNT(*) AS n FROM social_fans WHERE of_user = $1", [userId]);
      return Number(rows[0]?.n ?? 0);
    },

    async isFan(fan: string, of: string): Promise<boolean> {
      const { rows } = await sql.execute("SELECT 1 AS ok FROM social_fans WHERE fan_user = $1 AND of_user = $2", [fan, of]);
      return rows.length > 0;
    },

    async setFan(fan: string, of: string, on: boolean, now: string): Promise<void> {
      if (on) {
        await sql.execute("INSERT OR IGNORE INTO social_fans (fan_user, of_user, created_at) VALUES ($1, $2, $3)", [fan, of, now]);
      } else {
        await sql.execute("DELETE FROM social_fans WHERE fan_user = $1 AND of_user = $2", [fan, of]);
      }
    },

    async rate(rater: string, ratee: string, r: Ratings, now: string): Promise<void> {
      await sql.execute(
        `INSERT INTO social_ratings (rater, ratee, trusty, cool, funny, updated_at) VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (rater, ratee) DO UPDATE SET trusty = excluded.trusty, cool = excluded.cool,
           funny = excluded.funny, updated_at = excluded.updated_at`,
        [rater, ratee, r.trusty, r.cool, r.funny, now],
      );
    },

    async myRating(rater: string, ratee: string): Promise<Ratings | null> {
      const { rows } = await sql.execute(
        "SELECT trusty, cool, funny FROM social_ratings WHERE rater = $1 AND ratee = $2",
        [rater, ratee],
      );
      const r = rows[0];
      return r ? { trusty: Number(r.trusty), cool: Number(r.cool), funny: Number(r.funny) } : null;
    },

    async ratingAverages(ratee: string): Promise<{ raters: number; averages: Ratings }> {
      const { rows } = await sql.execute(
        `SELECT COUNT(*) AS n, AVG(trusty) AS trusty, AVG(cool) AS cool, AVG(funny) AS funny
         FROM social_ratings WHERE ratee = $1`,
        [ratee],
      );
      const r = rows[0] ?? {};
      return {
        raters: Number(r.n ?? 0),
        averages: { trusty: Number(r.trusty ?? 0), cool: Number(r.cool ?? 0), funny: Number(r.funny ?? 0) },
      };
    },
  };
}

export type ScrapbookRepository = ReturnType<typeof createScrapbookRepository>;
