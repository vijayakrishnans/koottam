import type { SqlExecutor, SqlStatement } from "../d1/executor.js";
import { executeBatch } from "../d1/executor.js";
import { identityUserId } from "./safety.js";

/** Everything a person gave Koottam, for them to take away. */
export function createAccountRepository(sql: SqlExecutor) {
  const rows = async (text: string, params: unknown[]) => (await sql.execute(text, params)).rows;

  return {
    async export(userId: string) {
      const [profile] = await rows(
        `SELECT handle, display_name, about, city, country, interests, relationship, birthday_day, birthday_month,
                birthday_visible, visibility, adult_declared_at, created_at FROM social_profiles WHERE user_id = $1`,
        [userId],
      );
      const handleOf = "(SELECT handle FROM social_profiles p WHERE p.user_id = ";
      return {
        exportedFormat: 1,
        profile: profile ?? null,
        friends: await rows(
          `SELECT p.handle, f.created_at FROM social_friendships f
           JOIN social_profiles p ON p.user_id = CASE WHEN f.user_a = $1 THEN f.user_b ELSE f.user_a END
           WHERE f.user_a = $1 OR f.user_b = $1`,
          [userId],
        ),
        blocked: await rows(
          "SELECT p.handle, b.created_at FROM social_blocks b JOIN social_profiles p ON p.user_id = b.blocked_id WHERE b.blocker_id = $1",
          [userId],
        ),
        scrapsWritten: await rows(
          `SELECT ${handleOf}s.to_user) AS to_handle, s.body, s.visibility, s.created_at
           FROM social_scraps s WHERE s.from_user = $1 AND s.deleted_at IS NULL`,
          [userId],
        ),
        scrapsReceived: await rows(
          `SELECT ${handleOf}s.from_user) AS from_handle, s.body, s.visibility, s.created_at
           FROM social_scraps s WHERE s.to_user = $1 AND s.deleted_at IS NULL`,
          [userId],
        ),
        testimonialsWritten: await rows(
          `SELECT ${handleOf}t.to_user) AS to_handle, t.body, t.status, t.created_at FROM social_testimonials t WHERE t.from_user = $1`,
          [userId],
        ),
        testimonialsReceived: await rows(
          `SELECT ${handleOf}t.from_user) AS from_handle, t.body, t.status, t.created_at FROM social_testimonials t WHERE t.to_user = $1`,
          [userId],
        ),
        fanOf: await rows(`SELECT ${handleOf}f.of_user) AS handle, f.created_at FROM social_fans f WHERE f.fan_user = $1`, [userId]),
        ratingsGiven: await rows(
          `SELECT ${handleOf}r.ratee) AS handle, r.trusty, r.cool, r.funny, r.updated_at FROM social_ratings r WHERE r.rater = $1`,
          [userId],
        ),
        communities: await rows(
          `SELECT c.slug, c.name, m.role, m.status, m.joined_at FROM social_community_members m
           JOIN social_communities c ON c.id = m.community_id WHERE m.user_id = $1 AND c.deleted_at IS NULL`,
          [userId],
        ),
        topicsStarted: await rows(
          "SELECT t.title, t.created_at FROM social_topics t WHERE t.author_id = $1 AND t.deleted_at IS NULL",
          [userId],
        ),
        posts: await rows("SELECT p.body, p.created_at FROM social_posts p WHERE p.author_id = $1 AND p.deleted_at IS NULL", [userId]),
        invitesCreated: await rows(
          "SELECT i.created_at, i.expires_at, i.redeemed_at, i.revoked_at FROM social_invites i WHERE i.created_by = $1",
          [userId],
        ),
      };
    },

    /** Communities others are still in, which must be handed over before their owner can leave. */
    async communitiesNeedingHandover(userId: string): Promise<Array<{ slug: string; name: string }>> {
      const found = await rows(
        `SELECT c.slug, c.name FROM social_communities c
         WHERE c.owner_id = $1 AND c.deleted_at IS NULL AND EXISTS (
           SELECT 1 FROM social_community_members m
           WHERE m.community_id = c.id AND m.user_id <> $1 AND m.status = 'active')`,
        [userId],
      );
      return found.map((r) => ({ slug: String(r.slug), name: String(r.name) }));
    },

    /**
     * Deletes a person for good, atomically. Their words go, including topics they
     * started with any replies in them, because a topic can't outlive its author here.
     * Their email goes too: the identity row keeps only a tombstone, so signing in
     * again with that address starts from nothing and needs a new invite.
     * An invite they spent stays spent, or it could be used again.
     */
    async deleteEverything(userId: string, now: string): Promise<void> {
      const identityId = identityUserId(userId);
      const myTopics = "SELECT id FROM social_topics WHERE author_id = $1";
      const myEmptyCommunities = "SELECT id FROM social_communities WHERE owner_id = $1";
      const statements: SqlStatement[] = [
        // Communities they own by now have no one else active in them.
        { text: `UPDATE social_communities SET deleted_at = $2 WHERE owner_id = $1 AND deleted_at IS NULL`, params: [userId, now] },
        { text: `DELETE FROM social_posts WHERE topic_id IN (SELECT id FROM social_topics WHERE community_id IN (${myEmptyCommunities}))`, params: [userId] },
        { text: `DELETE FROM social_topics WHERE community_id IN (${myEmptyCommunities})`, params: [userId] },
        { text: `DELETE FROM social_community_members WHERE community_id IN (${myEmptyCommunities})`, params: [userId] },
        { text: `DELETE FROM social_communities WHERE owner_id = $1`, params: [userId] },
        { text: `DELETE FROM social_posts WHERE topic_id IN (${myTopics})`, params: [userId] },
        { text: "DELETE FROM social_topics WHERE author_id = $1", params: [userId] },
        { text: "DELETE FROM social_posts WHERE author_id = $1", params: [userId] },
        { text: "DELETE FROM social_community_members WHERE user_id = $1", params: [userId] },
        { text: "DELETE FROM social_scraps WHERE from_user = $1 OR to_user = $1", params: [userId] },
        { text: "DELETE FROM social_scraps_seen WHERE user_id = $1", params: [userId] },
        { text: "DELETE FROM social_testimonials WHERE from_user = $1 OR to_user = $1", params: [userId] },
        { text: "DELETE FROM social_fans WHERE fan_user = $1 OR of_user = $1", params: [userId] },
        { text: "DELETE FROM social_ratings WHERE rater = $1 OR ratee = $1", params: [userId] },
        { text: "DELETE FROM social_friendships WHERE user_a = $1 OR user_b = $1", params: [userId] },
        { text: "DELETE FROM social_friend_requests WHERE from_user = $1 OR to_user = $1", params: [userId] },
        { text: "DELETE FROM social_blocks WHERE blocker_id = $1 OR blocked_id = $1", params: [userId] },
        { text: "UPDATE social_invites SET revoked_at = $2 WHERE created_by = $1 AND redeemed_by IS NULL AND revoked_at IS NULL", params: [userId, now] },
        { text: "UPDATE social_invites SET created_by = NULL WHERE created_by = $1", params: [userId] },
        { text: "UPDATE social_invites SET redeemed_by = 'deleted' WHERE redeemed_by = $1", params: [userId] },
        // Reports they made stay open for others' safety, without saying who made them.
        { text: "UPDATE social_reports SET reporter_id = 'deleted:' || id, details = NULL WHERE reporter_id = $1", params: [userId] },
        { text: `UPDATE social_reports SET subject_owner = NULL, snapshot = '', status = 'removed', resolved_at = $2
                 WHERE subject_owner = $1 AND status = 'open'`, params: [userId, now] },
        { text: "UPDATE social_reports SET subject_owner = NULL WHERE subject_owner = $1", params: [userId] },
        { text: "DELETE FROM social_profiles WHERE user_id = $1", params: [userId] },
        // The hidden personal organization is named after the person, often from their email.
        {
          text: `UPDATE membership_organizations SET name = 'Deleted account'
                 WHERE id IN (SELECT org_id FROM membership_organization_members WHERE subject_id IN ($1, $2))`,
          params: [userId, identityId],
        },
        { text: "DELETE FROM identity_security_events WHERE user_id IN ($1, $2)", params: [userId, identityId] },
        // Must run while identity_users still holds the address.
        {
          text: `UPDATE notifications_notifications SET recipient_address = 'deleted@deleted.invalid', template_data = '{}'
                 WHERE recipient_address = (SELECT email_lower FROM identity_users WHERE id = $1)`,
          params: [identityId],
        },
        {
          text: `DELETE FROM notifications_notification_suppressions
                 WHERE address = (SELECT email_lower FROM identity_users WHERE id = $1)`,
          params: [identityId],
        },
        { text: "DELETE FROM identity_auth_identities WHERE user_id = $1", params: [identityId] },
        { text: "DELETE FROM identity_login_challenges WHERE user_id = $1", params: [identityId] },
        { text: "UPDATE identity_sessions SET revoked_at = $2 WHERE user_id = $1 AND revoked_at IS NULL", params: [identityId, now] },
        {
          text: `UPDATE identity_users SET email = 'deleted+' || id || '@deleted.invalid',
                   email_lower = 'deleted+' || id || '@deleted.invalid', display_name = NULL, status = 'deleted'
                 WHERE id = $1`,
          params: [identityId],
        },
      ];
      await executeBatch(sql, statements);
    },
  };
}

export type AccountRepository = ReturnType<typeof createAccountRepository>;
