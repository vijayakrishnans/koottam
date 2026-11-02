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
  };
}

export type SocialRepository = ReturnType<typeof createSocialRepository>;
