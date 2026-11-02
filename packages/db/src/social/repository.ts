import type { SqlExecutor, SqlRow } from "../d1/executor.js";
import { executeBatch } from "../d1/executor.js";

export interface SocialProfile {
  userId: string;
  handle: string;
  displayName: string;
  about: string | null;
  city: string | null;
  country: string | null;
  interests: string | null;
  relationship: string | null;
  birthdayDay: number | null;
  birthdayMonth: number | null;
  birthdayVisible: boolean;
  visibility: "everyone" | "friends";
  createdAt: string;
}

export interface ProfileEdit {
  displayName: string;
  about: string | null;
  city: string | null;
  country: string | null;
  interests: string | null;
  relationship: string | null;
  birthdayDay: number | null;
  birthdayMonth: number | null;
  birthdayVisible: boolean;
  visibility: "everyone" | "friends";
}

export interface SocialInvite {
  id: string;
  redeemedAt: string | null;
  revokedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

const nullable = <T>(v: unknown): T | null => (v === null || v === undefined ? null : (v as T));

function mapProfile(row: SqlRow): SocialProfile {
  return {
    userId: String(row.user_id),
    handle: String(row.handle),
    displayName: String(row.display_name),
    about: nullable(row.about),
    city: nullable(row.city),
    country: nullable(row.country),
    interests: nullable(row.interests),
    relationship: nullable(row.relationship),
    birthdayDay: nullable(row.birthday_day),
    birthdayMonth: nullable(row.birthday_month),
    birthdayVisible: Number(row.birthday_visible) === 1,
    visibility: row.visibility === "friends" ? "friends" : "everyone",
    createdAt: String(row.created_at),
  };
}

function mapInvite(row: SqlRow): SocialInvite {
  return {
    id: String(row.id),
    redeemedAt: nullable(row.redeemed_at),
    revokedAt: nullable(row.revoked_at),
    expiresAt: nullable(row.expires_at),
    createdAt: String(row.created_at),
  };
}

export interface Card {
  userId: string;
  handle: string;
  displayName: string;
}

export interface FriendRequest {
  id: string;
  fromUser: string;
  toUser: string;
  createdAt: string;
  person: Card;
}

export const mapCard = (row: SqlRow): Card => ({
  userId: String(row.user_id),
  handle: String(row.handle),
  displayName: String(row.display_name),
});

const pair = (x: string, y: string): [string, string] => (x < y ? [x, y] : [y, x]);

/** Neither person has blocked the other. $1 is the viewer; the other id is the given column. */
export const notBlockedWith = (column: string): string => `NOT EXISTS (SELECT 1 FROM social_blocks b
  WHERE (b.blocker_id = $1 AND b.blocked_id = ${column}) OR (b.blocker_id = ${column} AND b.blocked_id = $1))`;

const USABLE_INVITE = `code_hash = $1 AND redeemed_by IS NULL AND revoked_at IS NULL
  AND (expires_at IS NULL OR expires_at > $2)`;

export function createSocialRepository(sql: SqlExecutor) {
  return {
    async profileByUser(userId: string): Promise<SocialProfile | null> {
      const { rows } = await sql.execute(
        "SELECT * FROM social_profiles WHERE user_id = $1 AND deleted_at IS NULL",
        [userId],
      );
      return rows[0] ? mapProfile(rows[0]) : null;
    },

    async profileByHandle(handle: string): Promise<SocialProfile | null> {
      const { rows } = await sql.execute(
        "SELECT * FROM social_profiles WHERE handle = $1 AND deleted_at IS NULL",
        [handle],
      );
      return rows[0] ? mapProfile(rows[0]) : null;
    },

    async inviteUsable(codeHash: string, now: string): Promise<boolean> {
      const { rows } = await sql.execute(`SELECT 1 AS ok FROM social_invites WHERE ${USABLE_INVITE}`, [codeHash, now]);
      return rows.length > 0;
    },

    /**
     * Creates the profile and spends the invite in one atomic batch: the insert
     * only selects a row while the invite is usable, so of two people racing for
     * one code the second inserts nothing. Returns whether a profile was created.
     * A taken handle throws a unique violation and rolls back the whole batch.
     */
    async createProfileWithInvite(input: {
      userId: string;
      handle: string;
      displayName: string;
      codeHash: string;
      now: string;
    }): Promise<boolean> {
      const { userId, handle, displayName, codeHash, now } = input;
      await executeBatch(sql, [
        {
          text: `INSERT INTO social_profiles
                   (user_id, handle, display_name, adult_declared_at, created_at, updated_at)
                 SELECT $3, $4, $5, $2, $2, $2
                 WHERE EXISTS (SELECT 1 FROM social_invites WHERE ${USABLE_INVITE})
                   AND NOT EXISTS (SELECT 1 FROM social_profiles WHERE user_id = $3)`,
          params: [codeHash, now, userId, handle, displayName],
        },
        {
          text: `UPDATE social_invites SET redeemed_by = $3, redeemed_at = $2
                 WHERE ${USABLE_INVITE}
                   AND EXISTS (SELECT 1 FROM social_profiles WHERE user_id = $3 AND created_at = $2)`,
          params: [codeHash, now, userId],
        },
      ]);
      const { rows } = await sql.execute(
        "SELECT 1 AS ok FROM social_invites WHERE code_hash = $1 AND redeemed_by = $2",
        [codeHash, userId],
      );
      return rows.length > 0;
    },

    async updateProfile(userId: string, edit: ProfileEdit, now: string): Promise<void> {
      await sql.execute(
        `UPDATE social_profiles SET display_name = $2, about = $3, city = $4, country = $5, interests = $6,
           relationship = $7, birthday_day = $8, birthday_month = $9, birthday_visible = $10, visibility = $11,
           updated_at = $12
         WHERE user_id = $1 AND deleted_at IS NULL`,
        [
          userId,
          edit.displayName,
          edit.about,
          edit.city,
          edit.country,
          edit.interests,
          edit.relationship,
          edit.birthdayDay,
          edit.birthdayMonth,
          edit.birthdayVisible ? 1 : 0,
          edit.visibility,
          now,
        ],
      );
    },

    async listInvites(userId: string): Promise<SocialInvite[]> {
      const { rows } = await sql.execute(
        "SELECT * FROM social_invites WHERE created_by = $1 ORDER BY created_at DESC LIMIT 100",
        [userId],
      );
      return rows.map(mapInvite);
    },

    async countOpenInvites(userId: string, now: string): Promise<number> {
      const { rows } = await sql.execute(
        `SELECT COUNT(*) AS n FROM social_invites WHERE created_by = $1 AND redeemed_by IS NULL
           AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > $2)`,
        [userId, now],
      );
      return Number(rows[0]?.n ?? 0);
    },

    async createInvite(input: {
      id: string;
      codeHash: string;
      createdBy: string;
      expiresAt: string;
      now: string;
    }): Promise<SocialInvite> {
      await sql.execute(
        "INSERT INTO social_invites (id, code_hash, created_by, expires_at, created_at) VALUES ($1, $2, $3, $4, $5)",
        [input.id, input.codeHash, input.createdBy, input.expiresAt, input.now],
      );
      return { id: input.id, redeemedAt: null, revokedAt: null, expiresAt: input.expiresAt, createdAt: input.now };
    },

    /** Only the invite's creator can revoke it, and only while it is unspent. */
    async revokeInvite(id: string, userId: string, now: string): Promise<boolean> {
      const { rows } = await sql.execute(
        `UPDATE social_invites SET revoked_at = $3
         WHERE id = $1 AND created_by = $2 AND redeemed_by IS NULL AND revoked_at IS NULL
         RETURNING id`,
        [id, userId, now],
      );
      return rows.length > 0;
    },

    async isBlockedEitherWay(x: string, y: string): Promise<boolean> {
      const { rows } = await sql.execute(
        `SELECT 1 AS ok FROM social_blocks
         WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1)`,
        [x, y],
      );
      return rows.length > 0;
    },

    async areFriends(x: string, y: string): Promise<boolean> {
      const [a, b] = pair(x, y);
      const { rows } = await sql.execute("SELECT 1 AS ok FROM social_friendships WHERE user_a = $1 AND user_b = $2", [a, b]);
      return rows.length > 0;
    },

    async pendingBetween(x: string, y: string): Promise<{ id: string; fromUser: string } | null> {
      const { rows } = await sql.execute(
        `SELECT id, from_user FROM social_friend_requests
         WHERE status = 'pending' AND ((from_user = $1 AND to_user = $2) OR (from_user = $2 AND to_user = $1))
         LIMIT 1`,
        [x, y],
      );
      return rows[0] ? { id: String(rows[0].id), fromUser: String(rows[0].from_user) } : null;
    },

    async countOutgoingPending(userId: string): Promise<number> {
      const { rows } = await sql.execute(
        "SELECT COUNT(*) AS n FROM social_friend_requests WHERE from_user = $1 AND status = 'pending'",
        [userId],
      );
      return Number(rows[0]?.n ?? 0);
    },

    async createFriendRequest(id: string, fromUser: string, toUser: string, now: string): Promise<void> {
      await sql.execute(
        `INSERT INTO social_friend_requests (id, from_user, to_user, status, created_at, updated_at)
         VALUES ($1, $2, $3, 'pending', $4, $4)`,
        [id, fromUser, toUser, now],
      );
    },

    /** Only the recipient can accept, and never across a block. Atomic: both rows or neither. */
    async acceptFriendRequest(id: string, toUser: string, now: string): Promise<boolean> {
      const { rows } = await sql.execute(
        `SELECT from_user FROM social_friend_requests r
         WHERE r.id = $2 AND r.to_user = $1 AND r.status = 'pending' AND ${notBlockedWith("r.from_user")}`,
        [toUser, id],
      );
      if (!rows[0]) return false;
      const [a, b] = pair(String(rows[0].from_user), toUser);
      await executeBatch(sql, [
        {
          text: "INSERT OR IGNORE INTO social_friendships (user_a, user_b, created_at) VALUES ($1, $2, $3)",
          params: [a, b, now],
        },
        {
          text: "UPDATE social_friend_requests SET status = 'accepted', updated_at = $2 WHERE id = $1",
          params: [id, now],
        },
      ]);
      return true;
    },

    async declineFriendRequest(id: string, toUser: string, now: string): Promise<boolean> {
      const { rows } = await sql.execute(
        `UPDATE social_friend_requests SET status = 'declined', updated_at = $3
         WHERE id = $1 AND to_user = $2 AND status = 'pending' RETURNING id`,
        [id, toUser, now],
      );
      return rows.length > 0;
    },

    async cancelFriendRequest(id: string, fromUser: string, now: string): Promise<boolean> {
      const { rows } = await sql.execute(
        `UPDATE social_friend_requests SET status = 'cancelled', updated_at = $3
         WHERE id = $1 AND from_user = $2 AND status = 'pending' RETURNING id`,
        [id, fromUser, now],
      );
      return rows.length > 0;
    },

    async listFriendRequests(userId: string): Promise<{ incoming: FriendRequest[]; outgoing: FriendRequest[] }> {
      const query = (mine: string, theirs: string) => `
        SELECT r.id, r.from_user, r.to_user, r.created_at, p.user_id, p.handle, p.display_name
        FROM social_friend_requests r
        JOIN social_profiles p ON p.user_id = r.${theirs} AND p.deleted_at IS NULL
        WHERE r.${mine} = $1 AND r.status = 'pending' AND ${notBlockedWith(`r.${theirs}`)}
        ORDER BY r.created_at DESC LIMIT 100`;
      const map = (row: SqlRow): FriendRequest => ({
        id: String(row.id),
        fromUser: String(row.from_user),
        toUser: String(row.to_user),
        createdAt: String(row.created_at),
        person: mapCard(row),
      });
      const incoming = await sql.execute(query("to_user", "from_user"), [userId]);
      const outgoing = await sql.execute(query("from_user", "to_user"), [userId]);
      return { incoming: incoming.rows.map(map), outgoing: outgoing.rows.map(map) };
    },

    /** A person's friends, as the viewer may see them: anyone blocked with the viewer is left out. */
    async listFriends(userId: string, viewerId: string): Promise<Card[]> {
      const { rows } = await sql.execute(
        `SELECT p.user_id, p.handle, p.display_name
         FROM social_friendships f
         JOIN social_profiles p
           ON p.user_id = CASE WHEN f.user_a = $2 THEN f.user_b ELSE f.user_a END AND p.deleted_at IS NULL
         WHERE (f.user_a = $2 OR f.user_b = $2) AND ${notBlockedWith("p.user_id")}
         ORDER BY p.display_name, p.handle LIMIT 500`,
        [viewerId, userId],
      );
      return rows.map(mapCard);
    },

    async countMutualFriends(x: string, y: string): Promise<number> {
      const friendsOf = (slot: string) =>
        `SELECT CASE WHEN user_a = ${slot} THEN user_b ELSE user_a END AS id FROM social_friendships
         WHERE user_a = ${slot} OR user_b = ${slot}`;
      const { rows } = await sql.execute(
        `SELECT COUNT(*) AS n FROM (${friendsOf("$1")}) m
         JOIN (${friendsOf("$2")}) t ON t.id = m.id
         JOIN social_profiles p ON p.user_id = m.id AND p.deleted_at IS NULL`,
        [x, y],
      );
      return Number(rows[0]?.n ?? 0);
    },

    async removeFriend(x: string, y: string): Promise<boolean> {
      const [a, b] = pair(x, y);
      const { rows } = await sql.execute(
        "DELETE FROM social_friendships WHERE user_a = $1 AND user_b = $2 RETURNING user_a",
        [a, b],
      );
      return rows.length > 0;
    },

    /** A block ends any friendship and clears pending requests both ways, atomically. */
    async block(blocker: string, blocked: string, now: string): Promise<void> {
      const [a, b] = pair(blocker, blocked);
      await executeBatch(sql, [
        {
          text: "INSERT OR IGNORE INTO social_blocks (blocker_id, blocked_id, created_at) VALUES ($1, $2, $3)",
          params: [blocker, blocked, now],
        },
        { text: "DELETE FROM social_friendships WHERE user_a = $1 AND user_b = $2", params: [a, b] },
        {
          text: `UPDATE social_friend_requests SET status = 'cancelled', updated_at = $3
                 WHERE status = 'pending' AND ((from_user = $1 AND to_user = $2) OR (from_user = $2 AND to_user = $1))`,
          params: [blocker, blocked, now],
        },
        {
          text: "DELETE FROM social_fans WHERE (fan_user = $1 AND of_user = $2) OR (fan_user = $2 AND of_user = $1)",
          params: [blocker, blocked],
        },
        {
          text: "DELETE FROM social_ratings WHERE (rater = $1 AND ratee = $2) OR (rater = $2 AND ratee = $1)",
          params: [blocker, blocked],
        },
      ]);
    },

    async unblock(blocker: string, blocked: string): Promise<void> {
      await sql.execute("DELETE FROM social_blocks WHERE blocker_id = $1 AND blocked_id = $2", [blocker, blocked]);
    },

    async listBlocked(blocker: string): Promise<Card[]> {
      const { rows } = await sql.execute(
        `SELECT p.user_id, p.handle, p.display_name FROM social_blocks b
         JOIN social_profiles p ON p.user_id = b.blocked_id AND p.deleted_at IS NULL
         WHERE b.blocker_id = $1 ORDER BY p.display_name LIMIT 500`,
        [blocker],
      );
      return rows.map(mapCard);
    },

    /** Prefix match on handle or name. Never returns the viewer or anyone blocked with them. */
    async search(viewerId: string, query: string): Promise<Card[]> {
      const like = `${query.toLowerCase().replace(/[\\%_]/g, "\\$&")}%`;
      const { rows } = await sql.execute(
        `SELECT p.user_id, p.handle, p.display_name FROM social_profiles p
         WHERE p.deleted_at IS NULL AND p.user_id <> $1 AND ${notBlockedWith("p.user_id")}
           AND (p.handle LIKE $2 ESCAPE '\\' OR LOWER(p.display_name) LIKE $2 ESCAPE '\\')
         ORDER BY p.display_name, p.handle LIMIT 20`,
        [viewerId, like],
      );
      return rows.map(mapCard);
    },
  };
}

export type SocialRepository = ReturnType<typeof createSocialRepository>;
