CREATE TABLE IF NOT EXISTS source_documents (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL UNIQUE,
  filename TEXT NOT NULL,
  media_type TEXT NOT NULL DEFAULT 'text/html',
  publisher TEXT NOT NULL DEFAULT '',
  published_at TEXT NOT NULL,
  event_at TEXT NOT NULL DEFAULT '',
  source_url TEXT NOT NULL DEFAULT '',
  object_key TEXT NOT NULL DEFAULT '',
  sha256 TEXT NOT NULL DEFAULT '',
  parser_version TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'en',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id)
);
CREATE INDEX IF NOT EXISTS idx_source_documents_published ON source_documents(published_at DESC);

CREATE TABLE IF NOT EXISTS transcript_segments (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  source_document_id TEXT NOT NULL,
  section TEXT NOT NULL,
  ordinal INTEGER NOT NULL,
  speaker TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL,
  anchor TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id),
  FOREIGN KEY (source_document_id) REFERENCES source_documents(id),
  UNIQUE(source_document_id, ordinal)
);
CREATE INDEX IF NOT EXISTS idx_transcript_segments_conversation ON transcript_segments(conversation_id, ordinal);

CREATE TABLE IF NOT EXISTS knowledge_claims (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  source_document_id TEXT NOT NULL,
  segment_id TEXT NOT NULL,
  claim_type TEXT NOT NULL,
  subject TEXT NOT NULL,
  statement TEXT NOT NULL,
  metric_key TEXT NOT NULL DEFAULT '',
  value_text TEXT NOT NULL DEFAULT '',
  numeric_value REAL,
  unit TEXT NOT NULL DEFAULT '',
  period TEXT NOT NULL DEFAULT '',
  evidence_excerpt TEXT NOT NULL,
  evidence_anchor TEXT NOT NULL,
  confidence INTEGER NOT NULL,
  verification_status TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id),
  FOREIGN KEY (source_document_id) REFERENCES source_documents(id),
  FOREIGN KEY (segment_id) REFERENCES transcript_segments(id)
);
CREATE INDEX IF NOT EXISTS idx_knowledge_claims_conversation_type ON knowledge_claims(conversation_id, claim_type);
CREATE INDEX IF NOT EXISTS idx_knowledge_claims_metric_period ON knowledge_claims(metric_key, period);

CREATE TABLE IF NOT EXISTS knowledge_entities (
  id TEXT PRIMARY KEY,
  canonical_name TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  tickers_json TEXT NOT NULL DEFAULT '[]',
  aliases_json TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_knowledge_entities_name_type ON knowledge_entities(canonical_name, entity_type);

CREATE TABLE IF NOT EXISTS conversation_entities (
  conversation_id TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  relation_type TEXT NOT NULL DEFAULT 'subject',
  PRIMARY KEY (conversation_id, entity_id, relation_type),
  FOREIGN KEY (conversation_id) REFERENCES conversations(id),
  FOREIGN KEY (entity_id) REFERENCES knowledge_entities(id)
);
CREATE INDEX IF NOT EXISTS idx_conversation_entities_entity ON conversation_entities(entity_id, conversation_id);

DELETE FROM transcription_jobs WHERE conversation_id IN ('conv-0820-semi', 'conv-0818-pharma', 'conv-0815-copper', 'conv-0812-consumer', 'conv-0808-ai', 'conv-0803-auto');
DELETE FROM uploads WHERE conversation_id IN ('conv-0820-semi', 'conv-0818-pharma', 'conv-0815-copper', 'conv-0812-consumer', 'conv-0808-ai', 'conv-0803-auto');
DELETE FROM search_chunks WHERE conversation_id IN ('conv-0820-semi', 'conv-0818-pharma', 'conv-0815-copper', 'conv-0812-consumer', 'conv-0808-ai', 'conv-0803-auto');
DELETE FROM conversation_access WHERE conversation_id IN ('conv-0820-semi', 'conv-0818-pharma', 'conv-0815-copper', 'conv-0812-consumer', 'conv-0808-ai', 'conv-0803-auto');
DELETE FROM knowledge_governance WHERE entity_type = 'conversation' AND entity_id IN ('conv-0820-semi', 'conv-0818-pharma', 'conv-0815-copper', 'conv-0812-consumer', 'conv-0808-ai', 'conv-0803-auto');
DELETE FROM conversations WHERE id IN ('conv-0820-semi', 'conv-0818-pharma', 'conv-0815-copper', 'conv-0812-consumer', 'conv-0808-ai', 'conv-0803-auto');

PRAGMA optimize;
