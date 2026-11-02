-- 210_social_friends
-- Koottam friends: requests, friendships and blocks.
-- Bounded context: social

CREATE TABLE IF NOT EXISTS social_friend_requests (
  id         TEXT PRIMARY KEY,
  from_user  TEXT NOT NULL,
  to_user    TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS social_friend_requests_pending_idx
  ON social_friend_requests (from_user, to_user) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS social_friend_requests_to_idx ON social_friend_requests (to_user, status, created_at);

-- One row per pair, with user_a < user_b, so a friendship cannot exist twice.
CREATE TABLE IF NOT EXISTS social_friendships (
  user_a     TEXT NOT NULL,
  user_b     TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_a, user_b),
  CHECK (user_a < user_b)
);

CREATE INDEX IF NOT EXISTS social_friendships_b_idx ON social_friendships (user_b);

CREATE TABLE IF NOT EXISTS social_blocks (
  blocker_id TEXT NOT NULL,
  blocked_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (blocker_id, blocked_id)
);

CREATE INDEX IF NOT EXISTS social_blocks_blocked_idx ON social_blocks (blocked_id);

-- A short-lived invite for testing on stage. Only its hash is here.
INSERT OR IGNORE INTO social_invites (id, code_hash, created_by, expires_at, created_at)
VALUES ('stage-tester', '359edd2ad36e818c0a23c433e5cf0582f62acd8ae05e757cd5d3412751b1658b', NULL, '2026-11-04T12:00:00.000Z', '2026-11-02T00:00:00.000Z');
