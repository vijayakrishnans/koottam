import type { SqlExecutor, SqlRow, SqlStatement } from "../d1/executor.js";
import { executeBatch } from "../d1/executor.js";
import { hexToUuid } from "../ids/index.js";

export interface ReportRow {
  id: string;
  subjectType: string;
  subjectId: string;
  subjectOwner: string | null;
  snapshot: string;
  reason: string;
  details: string | null;
  createdAt: string;
  ownerHandle: string | null;
  ownerName: string | null;
  reporterHandle: string | null;
  reporterName: string | null;
}

export type Subject = { ownerId: string | null; snapshot: string };

const nullable = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));

/** The identity tables key on a uuid; the edge gives us the public `usr_<hex>` form. */
export function identityUserId(subjectId: string): string {
  return subjectId.startsWith("usr_") ? (hexToUuid(subjectId.slice(4)) ?? subjectId) : subjectId;
}

export function createSafetyRepository(sql: SqlExecutor) {
  const one = async (text: string, params: unknown[]): Promise<SqlRow | undefined> =>
    (await sql.execute(text, params)).rows[0];

  return {
    async isSuspended(userId: string): Promise<boolean> {
      return !!(await one("SELECT 1 AS ok FROM social_suspensions WHERE user_id = $1", [userId]));
    },

    async isListedStaff(userId: string): Promise<boolean> {
      return !!(await one("SELECT 1 AS ok FROM social_staff WHERE user_id = $1", [userId]));
    },

    /** Whoever spent one of these invites moderates: that is how the first moderator exists. */
    async redeemedInvite(userId: string, inviteIds: string[]): Promise<boolean> {
      const slots = inviteIds.map((_, i) => `$${i + 2}`).join(", ");
      return !!(await one(`SELECT 1 AS ok FROM social_invites WHERE redeemed_by = $1 AND id IN (${slots})`, [userId, ...inviteIds]));
    },

    async subject(type: string, id: string): Promise<Subject | null> {
      const queries: Record<string, [string, (r: SqlRow) => string]> = {
        person: ["SELECT user_id AS owner, display_name, about FROM social_profiles WHERE handle = $1 AND deleted_at IS NULL", (r) => `${r.display_name}\n${r.about ?? ""}`],
        scrap: ["SELECT from_user AS owner, body FROM social_scraps WHERE id = $1 AND deleted_at IS NULL", (r) => String(r.body)],
        testimonial: ["SELECT from_user AS owner, body FROM social_testimonials WHERE id = $1", (r) => String(r.body)],
        post: ["SELECT author_id AS owner, body FROM social_posts WHERE id = $1 AND deleted_at IS NULL", (r) => String(r.body)],
        topic: ["SELECT author_id AS owner, title FROM social_topics WHERE id = $1 AND deleted_at IS NULL", (r) => String(r.title)],
        community: ["SELECT owner_id AS owner, name, description FROM social_communities WHERE slug = $1 AND deleted_at IS NULL", (r) => `${r.name}\n${r.description ?? ""}`],
      };
      const query = queries[type];
      if (!query) return null;
      const row = await one(query[0], [id]);
      return row ? { ownerId: nullable(row.owner), snapshot: query[1](row).trim().slice(0, 6000) } : null;
    },

    async countReportsSince(reporter: string, since: string): Promise<number> {
      const row = await one("SELECT COUNT(*) AS n FROM social_reports WHERE reporter_id = $1 AND created_at > $2", [reporter, since]);
      return Number(row?.n ?? 0);
    },

    /** Reporting the same thing twice while it's open changes nothing. Throws nothing the caller must handle. */
    async createReport(input: {
      id: string;
      reporterId: string;
      subjectType: string;
      subjectId: string;
      subjectOwner: string | null;
      snapshot: string;
      reason: string;
      details: string | null;
      now: string;
    }): Promise<void> {
      await sql.execute(
        `INSERT OR IGNORE INTO social_reports
           (id, reporter_id, subject_type, subject_id, subject_owner, snapshot, reason, details, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [input.id, input.reporterId, input.subjectType, input.subjectId, input.subjectOwner, input.snapshot, input.reason, input.details, input.now],
      );
    },

    /** Child safety first, then oldest first, so nothing waits behind newer reports. */
    async openReports(): Promise<ReportRow[]> {
      const { rows } = await sql.execute(
        `SELECT r.*, o.handle AS owner_handle, o.display_name AS owner_name,
                u.handle AS reporter_handle, u.display_name AS reporter_name
         FROM social_reports r
         LEFT JOIN social_profiles o ON o.user_id = r.subject_owner
         LEFT JOIN social_profiles u ON u.user_id = r.reporter_id
         WHERE r.status = 'open'
         ORDER BY CASE r.reason WHEN 'child_safety' THEN 0 ELSE 1 END, r.created_at LIMIT 200`,
      );
      return rows.map((r) => ({
        id: String(r.id),
        subjectType: String(r.subject_type),
        subjectId: String(r.subject_id),
        subjectOwner: nullable(r.subject_owner),
        snapshot: String(r.snapshot),
        reason: String(r.reason),
        details: nullable(r.details),
        createdAt: String(r.created_at),
        ownerHandle: nullable(r.owner_handle),
        ownerName: nullable(r.owner_name),
        reporterHandle: nullable(r.reporter_handle),
        reporterName: nullable(r.reporter_name),
      }));
    },

    async openReport(id: string): Promise<{ subjectType: string; subjectId: string; subjectOwner: string | null } | null> {
      const row = await one("SELECT subject_type, subject_id, subject_owner FROM social_reports WHERE id = $1 AND status = 'open'", [id]);
      return row
        ? { subjectType: String(row.subject_type), subjectId: String(row.subject_id), subjectOwner: nullable(row.subject_owner) }
        : null;
    },

    /** Statements that remove one reported thing, for use in a single batch. */
    removalStatements(type: string, id: string, now: string): SqlStatement[] {
      switch (type) {
        case "scrap":
          return [{ text: "UPDATE social_scraps SET deleted_at = $2, body = '' WHERE id = $1", params: [id, now] }];
        case "testimonial":
          return [{ text: "DELETE FROM social_testimonials WHERE id = $1", params: [id] }];
        case "post":
          return [{ text: "UPDATE social_posts SET deleted_at = $2, body = '' WHERE id = $1", params: [id, now] }];
        case "topic":
          return [
            { text: "UPDATE social_topics SET deleted_at = $2 WHERE id = $1", params: [id, now] },
            { text: "UPDATE social_posts SET deleted_at = $2, body = '' WHERE topic_id = $1 AND deleted_at IS NULL", params: [id, now] },
          ];
        case "community":
          return [{ text: "UPDATE social_communities SET deleted_at = $2 WHERE slug = $1", params: [id, now] }];
        default:
          return [];
      }
    },

    /** Suspends someone: nothing of theirs shows, their sessions end, and their account says so. */
    suspensionStatements(userId: string, by: string, now: string): SqlStatement[] {
      const identityId = identityUserId(userId);
      return [
        { text: "INSERT OR IGNORE INTO social_suspensions (user_id, suspended_by, created_at) VALUES ($1, $2, $3)", params: [userId, by, now] },
        { text: "UPDATE social_profiles SET deleted_at = $2 WHERE user_id = $1", params: [userId, now] },
        { text: "UPDATE identity_users SET status = 'suspended' WHERE id = $1", params: [identityId] },
        { text: "UPDATE identity_sessions SET revoked_at = $2 WHERE user_id = $1 AND revoked_at IS NULL", params: [identityId, now] },
      ];
    },

    /** Closes every open report on this thing and erases their copies of it. */
    resolveStatements(type: string, id: string, status: string, by: string, now: string): SqlStatement[] {
      return [
        {
          text: `UPDATE social_reports SET status = $3, resolved_by = $4, resolved_at = $5, snapshot = ''
                 WHERE subject_type = $1 AND subject_id = $2 AND status = 'open'`,
          params: [type, id, status, by, now],
        },
      ];
    },

    async run(statements: SqlStatement[]): Promise<void> {
      await executeBatch(sql, statements);
    },

    async profileRowByHandle(handle: string): Promise<string | null> {
      const row = await one("SELECT user_id FROM social_profiles WHERE handle = $1", [handle]);
      return row ? String(row.user_id) : null;
    },

    async unsuspend(userId: string): Promise<void> {
      const identityId = identityUserId(userId);
      await executeBatch(sql, [
        { text: "DELETE FROM social_suspensions WHERE user_id = $1", params: [userId] },
        { text: "UPDATE social_profiles SET deleted_at = NULL WHERE user_id = $1", params: [userId] },
        { text: "UPDATE identity_users SET status = 'active' WHERE id = $1", params: [identityId] },
      ]);
    },
  };
}

export type SafetyRepository = ReturnType<typeof createSafetyRepository>;
