-- 230_social_communities
-- Koottam communities: membership and forums.
-- Bounded context: social

CREATE TABLE IF NOT EXISTS social_communities (
  id          TEXT PRIMARY KEY,
  slug        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  description TEXT,
  category    TEXT,
  join_policy TEXT NOT NULL DEFAULT 'open',
  owner_id    TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  deleted_at  TEXT
);

CREATE INDEX IF NOT EXISTS social_communities_created_idx ON social_communities (created_at);

CREATE TABLE IF NOT EXISTS social_community_members (
  community_id TEXT NOT NULL,
  user_id      TEXT NOT NULL,
  role         TEXT NOT NULL DEFAULT 'member',
  status       TEXT NOT NULL DEFAULT 'active',
  joined_at    TEXT NOT NULL,
  PRIMARY KEY (community_id, user_id)
);

CREATE INDEX IF NOT EXISTS social_community_members_user_idx ON social_community_members (user_id, status);

CREATE TABLE IF NOT EXISTS social_topics (
  id           TEXT PRIMARY KEY,
  community_id TEXT NOT NULL,
  author_id    TEXT NOT NULL,
  title        TEXT NOT NULL,
  locked       INTEGER NOT NULL DEFAULT 0,
  last_post_at TEXT NOT NULL,
  created_at   TEXT NOT NULL,
  deleted_at   TEXT
);

CREATE INDEX IF NOT EXISTS social_topics_community_idx ON social_topics (community_id, last_post_at);

CREATE TABLE IF NOT EXISTS social_posts (
  id         TEXT PRIMARY KEY,
  topic_id   TEXT NOT NULL,
  author_id  TEXT NOT NULL,
  body       TEXT NOT NULL,
  created_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS social_posts_topic_idx ON social_posts (topic_id, created_at);
CREATE INDEX IF NOT EXISTS social_posts_author_idx ON social_posts (author_id, created_at);
