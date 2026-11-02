-- 200_social_people
-- Koottam people: profiles and invites.
-- Bounded context: social
-- schema social: Social bounded context — owns profiles, friendships, scrapbook, communities and photos.

CREATE TABLE IF NOT EXISTS social_profiles (
  user_id           TEXT PRIMARY KEY,
  handle            TEXT NOT NULL UNIQUE,
  display_name      TEXT NOT NULL,
  about             TEXT,
  city              TEXT,
  country           TEXT,
  interests         TEXT,
  relationship      TEXT,
  birthday_day      INTEGER,
  birthday_month    INTEGER,
  birthday_visible  INTEGER NOT NULL DEFAULT 0,
  visibility        TEXT NOT NULL DEFAULT 'everyone',
  adult_declared_at TEXT NOT NULL,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL,
  deleted_at        TEXT
);

CREATE TABLE IF NOT EXISTS social_invites (
  id          TEXT PRIMARY KEY,
  code_hash   TEXT NOT NULL UNIQUE,
  created_by  TEXT,
  redeemed_by TEXT,
  redeemed_at TEXT,
  revoked_at  TEXT,
  expires_at  TEXT,
  created_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS social_invites_created_by_idx ON social_invites (created_by, created_at);

-- The founder invite: lets the first person in on each environment. Only the
-- hash is here; the code was given privately to the owner.
INSERT OR IGNORE INTO social_invites (id, code_hash, created_by, expires_at, created_at)
VALUES ('founder', '07443a2d87256d0306db334a08f612d8c04f53ab827290de8f22ff02e24d81ac', NULL, NULL, '2026-11-02T00:00:00.000Z');
