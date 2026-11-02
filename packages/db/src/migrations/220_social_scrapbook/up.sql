-- 220_social_scrapbook
-- Koottam scrapbook: scraps, testimonials, fans and ratings.
-- Bounded context: social

CREATE TABLE IF NOT EXISTS social_scraps (
  id         TEXT PRIMARY KEY,
  to_user    TEXT NOT NULL,
  from_user  TEXT NOT NULL,
  body       TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'everyone',
  created_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS social_scraps_to_idx ON social_scraps (to_user, created_at);
CREATE INDEX IF NOT EXISTS social_scraps_from_idx ON social_scraps (from_user, created_at);

CREATE TABLE IF NOT EXISTS social_scraps_seen (
  user_id TEXT PRIMARY KEY,
  seen_at TEXT NOT NULL
);

-- One testimonial from one person about another, ever: writing another means deleting the first.
CREATE TABLE IF NOT EXISTS social_testimonials (
  id         TEXT PRIMARY KEY,
  to_user    TEXT NOT NULL,
  from_user  TEXT NOT NULL,
  body       TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  UNIQUE (to_user, from_user)
);

CREATE INDEX IF NOT EXISTS social_testimonials_from_idx ON social_testimonials (from_user);

CREATE TABLE IF NOT EXISTS social_fans (
  fan_user   TEXT NOT NULL,
  of_user    TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (fan_user, of_user)
);

CREATE INDEX IF NOT EXISTS social_fans_of_idx ON social_fans (of_user);

CREATE TABLE IF NOT EXISTS social_ratings (
  rater      TEXT NOT NULL,
  ratee      TEXT NOT NULL,
  trusty     INTEGER NOT NULL CHECK (trusty BETWEEN 0 AND 3),
  cool       INTEGER NOT NULL CHECK (cool BETWEEN 0 AND 3),
  funny      INTEGER NOT NULL CHECK (funny BETWEEN 0 AND 3),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (rater, ratee)
);

CREATE INDEX IF NOT EXISTS social_ratings_ratee_idx ON social_ratings (ratee);
