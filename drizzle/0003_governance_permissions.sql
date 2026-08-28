CREATE TABLE IF NOT EXISTS conversation_access (
  conversation_id TEXT PRIMARY KEY,
  department TEXT NOT NULL DEFAULT '投研部',
  industry_group TEXT NOT NULL DEFAULT '*',
  project_group TEXT NOT NULL DEFAULT '二级市场',
  sensitivity TEXT NOT NULL DEFAULT '内部',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id)
);
CREATE INDEX IF NOT EXISTS idx_conversation_access_scope ON conversation_access(department, industry_group, project_group, sensitivity);

CREATE TABLE IF NOT EXISTS user_access_profiles (
  user_id TEXT PRIMARY KEY,
  email TEXT NOT NULL DEFAULT '',
  departments_json TEXT NOT NULL DEFAULT '[]',
  industries_json TEXT NOT NULL DEFAULT '[]',
  projects_json TEXT NOT NULL DEFAULT '[]',
  max_sensitivity TEXT NOT NULL DEFAULT '内部',
  can_export INTEGER NOT NULL DEFAULT 0,
  can_download_audio INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS knowledge_governance (
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  owner TEXT NOT NULL DEFAULT '',
  verification_status TEXT NOT NULL DEFAULT '草稿',
  valid_until TEXT NOT NULL DEFAULT '',
  next_review_at TEXT NOT NULL DEFAULT '',
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (entity_type, entity_id)
);
CREATE INDEX IF NOT EXISTS idx_governance_review ON knowledge_governance(next_review_at, verification_status);

CREATE TABLE IF NOT EXISTS content_versions (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  snapshot_json TEXT NOT NULL,
  change_summary TEXT NOT NULL DEFAULT '',
  actor_id TEXT,
  actor_email TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_versions_entity ON content_versions(entity_type, entity_id, version DESC);

CREATE TABLE IF NOT EXISTS research_feedback (
  id TEXT PRIMARY KEY,
  question TEXT NOT NULL,
  answer_json TEXT NOT NULL,
  source_ids_json TEXT NOT NULL DEFAULT '[]',
  feedback_type TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  model_version TEXT NOT NULL DEFAULT 'evidence-synthesis-v1',
  actor_id TEXT,
  actor_email TEXT,
  status TEXT NOT NULL DEFAULT '待处理',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_feedback_status_created ON research_feedback(status, created_at DESC);

CREATE TABLE IF NOT EXISTS knowledge_gaps (
  id TEXT PRIMARY KEY,
  question TEXT NOT NULL,
  suggestions_json TEXT NOT NULL DEFAULT '[]',
  actor_id TEXT,
  actor_email TEXT,
  status TEXT NOT NULL DEFAULT '待调研',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS follows (
  id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_value TEXT NOT NULL,
  cadence TEXT NOT NULL DEFAULT 'daily',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(actor_id, entity_type, entity_value)
);
CREATE INDEX IF NOT EXISTS idx_follows_actor ON follows(actor_id, created_at DESC);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL,
  title TEXT NOT NULL,
  detail TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_notifications_actor_read ON notifications(actor_id, read_at, created_at DESC);

CREATE TABLE IF NOT EXISTS search_audit (
  id TEXT PRIMARY KEY,
  actor_id TEXT,
  query TEXT NOT NULL,
  filters_json TEXT NOT NULL DEFAULT '{}',
  knowledge_domains_json TEXT NOT NULL DEFAULT '[]',
  result_count INTEGER NOT NULL DEFAULT 0,
  elapsed_ms INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_search_audit_actor_created ON search_audit(actor_id, created_at DESC);

PRAGMA optimize;
