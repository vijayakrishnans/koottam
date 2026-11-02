-- 240_social_safety
-- Koottam safety: reports, suspensions and the people who moderate.
-- Bounded context: social

CREATE TABLE IF NOT EXISTS social_reports (
  id            TEXT PRIMARY KEY,
  reporter_id   TEXT NOT NULL,
  subject_type  TEXT NOT NULL,
  subject_id    TEXT NOT NULL,
  subject_owner TEXT,
  -- A copy of what was reported, so a moderator can judge it if it is later
  -- deleted. Erased as soon as the report is resolved.
  snapshot      TEXT NOT NULL DEFAULT '',
  reason        TEXT NOT NULL,
  details       TEXT,
  status        TEXT NOT NULL DEFAULT 'open',
  resolved_by   TEXT,
  resolved_at   TEXT,
  created_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS social_reports_status_idx ON social_reports (status, created_at);
CREATE INDEX IF NOT EXISTS social_reports_subject_idx ON social_reports (subject_type, subject_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS social_reports_once_idx
  ON social_reports (reporter_id, subject_type, subject_id) WHERE status = 'open';

-- Outlives the profile, so someone suspended stays suspended.
CREATE TABLE IF NOT EXISTS social_suspensions (
  user_id    TEXT PRIMARY KEY,
  suspended_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS social_staff (
  user_id    TEXT PRIMARY KEY,
  created_at TEXT NOT NULL
);
