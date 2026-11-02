import type { SqlExecutor, SqlRow } from "../d1/executor.js";
import { executeBatch } from "../d1/executor.js";
import { type Card, mapCard, notBlockedWith } from "./repository.js";

export type Role = "owner" | "moderator" | "member";
export type Status = "active" | "pending" | "banned";

export interface Community {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  category: string | null;
  joinPolicy: "open" | "approval";
  ownerId: string;
  members: number;
}

export interface Membership {
  role: Role;
  status: Status;
}

export interface TopicRow {
  id: string;
  communityId: string;
  title: string;
  author: Card;
  locked: boolean;
  replies: number;
  lastPostAt: string;
}

export interface PostRow {
  id: string;
  author: Card;
  body: string;
  createdAt: string;
}

const nullable = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));

const COMMUNITY_SELECT = `SELECT c.*,
  (SELECT COUNT(*) FROM social_community_members m WHERE m.community_id = c.id AND m.status = 'active') AS members
  FROM social_communities c`;

const mapCommunity = (r: SqlRow): Community => ({
  id: String(r.id),
  slug: String(r.slug),
  name: String(r.name),
  description: nullable(r.description),
  category: nullable(r.category),
  joinPolicy: r.join_policy === "approval" ? "approval" : "open",
  ownerId: String(r.owner_id),
  members: Number(r.members ?? 0),
});

const mapTopic = (r: SqlRow): TopicRow => ({
  id: String(r.id),
  communityId: String(r.community_id),
  title: String(r.title),
  locked: Number(r.locked) === 1,
  replies: Math.max(0, Number(r.post_count ?? 1) - 1),
  lastPostAt: String(r.last_post_at),
  author: mapCard(r),
});

/** Posts this viewer can see: replies from people blocked with them don't count. $1 is the viewer. */
const VISIBLE_POST_COUNT = `(SELECT COUNT(*) FROM social_posts po
  WHERE po.topic_id = t.id AND po.deleted_at IS NULL AND ${notBlockedWith("po.author_id")}) AS post_count`;

export function createCommunityRepository(sql: SqlExecutor) {
  return {
    async bySlug(slug: string): Promise<Community | null> {
      const { rows } = await sql.execute(`${COMMUNITY_SELECT} WHERE c.slug = $1 AND c.deleted_at IS NULL`, [slug]);
      return rows[0] ? mapCommunity(rows[0]) : null;
    },

    async list(q: string): Promise<Community[]> {
      const like = `%${q.toLowerCase().replace(/[\\%_]/g, "\\$&")}%`;
      const { rows } = await sql.execute(
        `${COMMUNITY_SELECT} WHERE c.deleted_at IS NULL AND LOWER(c.name) LIKE $1 ESCAPE '\\'
         ORDER BY c.created_at DESC LIMIT 50`,
        [like],
      );
      return rows.map(mapCommunity);
    },

    async ofUser(userId: string): Promise<Community[]> {
      const { rows } = await sql.execute(
        `${COMMUNITY_SELECT}
         JOIN social_community_members me ON me.community_id = c.id AND me.user_id = $1 AND me.status = 'active'
         WHERE c.deleted_at IS NULL ORDER BY c.name LIMIT 200`,
        [userId],
      );
      return rows.map(mapCommunity);
    },

    async countOwned(userId: string): Promise<number> {
      const { rows } = await sql.execute(
        "SELECT COUNT(*) AS n FROM social_communities WHERE owner_id = $1 AND deleted_at IS NULL",
        [userId],
      );
      return Number(rows[0]?.n ?? 0);
    },

    /** Throws a unique violation when the slug is taken. */
    async create(input: {
      id: string;
      slug: string;
      name: string;
      description: string | null;
      category: string | null;
      joinPolicy: string;
      ownerId: string;
      now: string;
    }): Promise<void> {
      await executeBatch(sql, [
        {
          text: `INSERT INTO social_communities (id, slug, name, description, category, join_policy, owner_id, created_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          params: [input.id, input.slug, input.name, input.description, input.category, input.joinPolicy, input.ownerId, input.now],
        },
        {
          text: `INSERT INTO social_community_members (community_id, user_id, role, status, joined_at)
                 VALUES ($1, $2, 'owner', 'active', $3)`,
          params: [input.id, input.ownerId, input.now],
        },
      ]);
    },

    async softDelete(id: string, now: string): Promise<void> {
      await sql.execute("UPDATE social_communities SET deleted_at = $2 WHERE id = $1", [id, now]);
    },

    async membership(communityId: string, userId: string): Promise<Membership | null> {
      const { rows } = await sql.execute(
        "SELECT role, status FROM social_community_members WHERE community_id = $1 AND user_id = $2",
        [communityId, userId],
      );
      const r = rows[0];
      return r ? { role: r.role as Role, status: r.status as Status } : null;
    },

    async addMember(communityId: string, userId: string, status: Status, now: string): Promise<void> {
      await sql.execute(
        `INSERT OR IGNORE INTO social_community_members (community_id, user_id, role, status, joined_at)
         VALUES ($1, $2, 'member', $3, $4)`,
        [communityId, userId, status, now],
      );
    },

    async removeMember(communityId: string, userId: string): Promise<void> {
      await sql.execute("DELETE FROM social_community_members WHERE community_id = $1 AND user_id = $2", [communityId, userId]);
    },

    async setStatus(communityId: string, userId: string, status: Status): Promise<void> {
      await sql.execute(
        "UPDATE social_community_members SET status = $3, role = CASE WHEN $3 = 'banned' THEN 'member' ELSE role END WHERE community_id = $1 AND user_id = $2",
        [communityId, userId, status],
      );
    },

    async setRole(communityId: string, userId: string, role: Role): Promise<void> {
      await sql.execute("UPDATE social_community_members SET role = $3 WHERE community_id = $1 AND user_id = $2", [communityId, userId, role]);
    },

    /** Hands a community over atomically: one owner before, one owner after. */
    async transferOwner(communityId: string, from: string, to: string): Promise<void> {
      await executeBatch(sql, [
        { text: "UPDATE social_community_members SET role = 'moderator' WHERE community_id = $1 AND user_id = $2", params: [communityId, from] },
        { text: "UPDATE social_community_members SET role = 'owner' WHERE community_id = $1 AND user_id = $2", params: [communityId, to] },
        { text: "UPDATE social_communities SET owner_id = $2 WHERE id = $1", params: [communityId, to] },
      ]);
    },

    /** Members as this viewer may see them. Pending and banned people are shown only when asked for. */
    async members(viewerId: string, communityId: string, includeAll: boolean): Promise<Array<Card & Membership>> {
      const { rows } = await sql.execute(
        `SELECT p.user_id, p.handle, p.display_name, m.role, m.status
         FROM social_community_members m
         JOIN social_profiles p ON p.user_id = m.user_id AND p.deleted_at IS NULL
         WHERE m.community_id = $2 AND ($3 = 1 OR m.status = 'active') AND ${notBlockedWith("m.user_id")}
         ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'moderator' THEN 1 ELSE 2 END, p.display_name LIMIT 500`,
        [viewerId, communityId, includeAll ? 1 : 0],
      );
      return rows.map((r) => ({ ...mapCard(r), role: r.role as Role, status: r.status as Status }));
    },

    async topics(viewerId: string, communityId: string): Promise<TopicRow[]> {
      const { rows } = await sql.execute(
        `SELECT t.*, p.user_id, p.handle, p.display_name, ${VISIBLE_POST_COUNT}
         FROM social_topics t JOIN social_profiles p ON p.user_id = t.author_id
         WHERE t.community_id = $2 AND t.deleted_at IS NULL AND ${notBlockedWith("t.author_id")}
         ORDER BY t.last_post_at DESC LIMIT 50`,
        [viewerId, communityId],
      );
      return rows.map(mapTopic);
    },

    async topic(viewerId: string, id: string): Promise<TopicRow | null> {
      const { rows } = await sql.execute(
        `SELECT t.*, p.user_id, p.handle, p.display_name, ${VISIBLE_POST_COUNT}
         FROM social_topics t JOIN social_profiles p ON p.user_id = t.author_id
         WHERE t.id = $2 AND t.deleted_at IS NULL AND ${notBlockedWith("t.author_id")}`,
        [viewerId, id],
      );
      return rows[0] ? mapTopic(rows[0]) : null;
    },

    async communityById(id: string): Promise<Community | null> {
      const { rows } = await sql.execute(`${COMMUNITY_SELECT} WHERE c.id = $1 AND c.deleted_at IS NULL`, [id]);
      return rows[0] ? mapCommunity(rows[0]) : null;
    },

    async createTopic(input: {
      topicId: string;
      postId: string;
      communityId: string;
      authorId: string;
      title: string;
      body: string;
      now: string;
    }): Promise<void> {
      await executeBatch(sql, [
        {
          text: `INSERT INTO social_topics (id, community_id, author_id, title, last_post_at, created_at)
                 VALUES ($1, $2, $3, $4, $5, $5)`,
          params: [input.topicId, input.communityId, input.authorId, input.title, input.now],
        },
        {
          text: "INSERT INTO social_posts (id, topic_id, author_id, body, created_at) VALUES ($1, $2, $3, $4, $5)",
          params: [input.postId, input.topicId, input.authorId, input.body, input.now],
        },
      ]);
    },

    async addPost(id: string, topicId: string, authorId: string, body: string, now: string): Promise<void> {
      await executeBatch(sql, [
        {
          text: "INSERT INTO social_posts (id, topic_id, author_id, body, created_at) VALUES ($1, $2, $3, $4, $5)",
          params: [id, topicId, authorId, body, now],
        },
        { text: "UPDATE social_topics SET last_post_at = $2 WHERE id = $1", params: [topicId, now] },
      ]);
    },

    async countPostsSince(authorId: string, since: string): Promise<number> {
      const { rows } = await sql.execute(
        "SELECT COUNT(*) AS n FROM social_posts WHERE author_id = $1 AND created_at > $2",
        [authorId, since],
      );
      return Number(rows[0]?.n ?? 0);
    },

    async posts(viewerId: string, topicId: string): Promise<PostRow[]> {
      const { rows } = await sql.execute(
        `SELECT po.id, po.body, po.created_at, p.user_id, p.handle, p.display_name
         FROM social_posts po JOIN social_profiles p ON p.user_id = po.author_id
         WHERE po.topic_id = $2 AND po.deleted_at IS NULL AND ${notBlockedWith("po.author_id")}
         ORDER BY po.created_at, po.id LIMIT 500`,
        [viewerId, topicId],
      );
      return rows.map((r) => ({ id: String(r.id), body: String(r.body), createdAt: String(r.created_at), author: mapCard(r) }));
    },

    async postById(id: string): Promise<{ topicId: string; authorId: string } | null> {
      const { rows } = await sql.execute("SELECT topic_id, author_id FROM social_posts WHERE id = $1 AND deleted_at IS NULL", [id]);
      return rows[0] ? { topicId: String(rows[0].topic_id), authorId: String(rows[0].author_id) } : null;
    },

    async topicCommunity(topicId: string): Promise<string | null> {
      const { rows } = await sql.execute("SELECT community_id FROM social_topics WHERE id = $1 AND deleted_at IS NULL", [topicId]);
      return rows[0] ? String(rows[0].community_id) : null;
    },

    async deletePost(id: string, now: string): Promise<void> {
      await sql.execute("UPDATE social_posts SET deleted_at = $2, body = '' WHERE id = $1", [id, now]);
    },

    async deleteTopic(id: string, now: string): Promise<void> {
      await executeBatch(sql, [
        { text: "UPDATE social_topics SET deleted_at = $2 WHERE id = $1", params: [id, now] },
        { text: "UPDATE social_posts SET deleted_at = $2, body = '' WHERE topic_id = $1 AND deleted_at IS NULL", params: [id, now] },
      ]);
    },

    async setLocked(id: string, locked: boolean): Promise<void> {
      await sql.execute("UPDATE social_topics SET locked = $2 WHERE id = $1", [id, locked ? 1 : 0]);
    },
  };
}

export type CommunityRepository = ReturnType<typeof createCommunityRepository>;
