CREATE TABLE IF NOT EXISTS live_study_sessions (
  id TEXT PRIMARY KEY,
  presenter_token_hash TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'learning' CHECK (status IN ('learning','lobby','quiz','closed')),
  duration_seconds INTEGER NOT NULL DEFAULT 3600,
  quiz_started_at TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_live_study_sessions_expires
  ON live_study_sessions(expires_at);

CREATE TABLE IF NOT EXISTS live_study_participants (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  participant_token_hash TEXT NOT NULL,
  joined_at TEXT NOT NULL,
  submitted_at TEXT,
  score INTEGER,
  total INTEGER,
  topic_scores_json TEXT,
  wrong_question_ids_json TEXT,
  FOREIGN KEY (session_id) REFERENCES live_study_sessions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_live_study_participants_session
  ON live_study_participants(session_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_live_study_participant_token
  ON live_study_participants(session_id, participant_token_hash);
