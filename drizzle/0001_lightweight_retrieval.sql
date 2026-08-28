CREATE TABLE IF NOT EXISTS search_chunks (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  ordinal INTEGER NOT NULL DEFAULT 0,
  content TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id),
  UNIQUE(conversation_id, kind, ordinal)
);

CREATE TABLE IF NOT EXISTS transcription_jobs (
  id TEXT PRIMARY KEY,
  upload_id TEXT NOT NULL UNIQUE,
  conversation_id TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'openai',
  model TEXT NOT NULL DEFAULT 'gpt-4o-transcribe-diarize',
  status TEXT NOT NULL DEFAULT 'queued',
  raw_transcript TEXT NOT NULL DEFAULT '',
  corrected_transcript TEXT NOT NULL DEFAULT '',
  segments_json TEXT NOT NULL DEFAULT '[]',
  structure_json TEXT NOT NULL DEFAULT '{}',
  error_message TEXT NOT NULL DEFAULT '',
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (upload_id) REFERENCES uploads(id),
  FOREIGN KEY (conversation_id) REFERENCES conversations(id)
);

CREATE INDEX IF NOT EXISTS idx_transcription_jobs_conversation
ON transcription_jobs(conversation_id, created_at DESC);

PRAGMA optimize;
