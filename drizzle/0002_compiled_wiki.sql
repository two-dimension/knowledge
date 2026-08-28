CREATE TABLE IF NOT EXISTS wiki_pages (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  page_type TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  content_md TEXT NOT NULL,
  backlinks_json TEXT NOT NULL DEFAULT '[]',
  source_ids_json TEXT NOT NULL DEFAULT '[]',
  health_score INTEGER NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 1,
  generated_by TEXT NOT NULL DEFAULT 'compiler',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_wiki_pages_type_updated
ON wiki_pages(page_type, updated_at DESC);

PRAGMA optimize;
