import { env } from "cloudflare:workers";
import type { Conversation } from "../lib/knowledge-data";
import type { EarningsCallSource, KnowledgeClaim, ParsedEarningsCall, TranscriptSegment } from "../lib/earnings-call";
import { schemaStatements } from "./schema";

type Statement = {
  bind: (...values: unknown[]) => Statement;
  run: () => Promise<unknown>;
  first: <T>() => Promise<T | null>;
  all: <T>() => Promise<{ results: T[] }>;
};

type Database = {
  prepare: (sql: string) => Statement;
  batch: (statements: Statement[]) => Promise<unknown>;
};

export function getDatabase(): Database {
  return (env as unknown as { DB: Database }).DB;
}

export async function ensureSchema(db: Database) {
  await db.batch(schemaStatements.map((sql) => db.prepare(sql)));
}

type ConversationRow = {
  id: string; title: string; date: string; location: string; scene: string; owner: string;
  participants_json: string; industry: string; tickers_json: string; tags_json: string;
  summary: string; theses_json: string; confidence: number; source_reliability: number;
  status: Conversation["status"]; sensitivity: Conversation["sensitivity"]; transcript: string;
  evidence_json: string; next_action: string; due_date: string;
};

function array(value: string) {
  try { return JSON.parse(value) as string[]; } catch { return []; }
}

export function rowToConversation(row: ConversationRow): Conversation {
  const participants = array(row.participants_json).filter((participant) => participant !== "林晓");
  const legacyStatus: Record<string, Conversation["status"]> = {
    "待结构化": "草稿", "待验证": "已复核", "已验证": "已证实",
  };
  return {
    id: row.id, title: row.title, date: row.date, location: row.location, scene: row.scene,
    owner: row.owner === "林晓" ? "研究员" : row.owner, participants, industry: row.industry,
    tickers: array(row.tickers_json), tags: array(row.tags_json), summary: row.summary,
    theses: array(row.theses_json), confidence: row.confidence, sourceReliability: row.source_reliability,
    status: legacyStatus[row.status] ?? row.status, sensitivity: row.sensitivity, transcript: row.transcript,
    evidence: array(row.evidence_json), nextAction: row.next_action, dueDate: row.due_date,
    validUntil: row.due_date, nextReviewAt: row.due_date, version: 1,
    department: "投研部", projectGroup: "二级市场",
  };
}

export function insertConversation(db: Database, record: Conversation) {
  return db.prepare(`INSERT OR REPLACE INTO conversations (
    id, title, date, location, scene, owner, participants_json, industry, tickers_json, tags_json,
    summary, theses_json, confidence, source_reliability, status, sensitivity, transcript,
    evidence_json, next_action, due_date, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`)
    .bind(record.id, record.title, record.date, record.location, record.scene, record.owner,
      JSON.stringify(record.participants), record.industry, JSON.stringify(record.tickers),
      JSON.stringify(record.tags), record.summary, JSON.stringify(record.theses), record.confidence,
      record.sourceReliability, record.status, record.sensitivity, record.transcript,
      JSON.stringify(record.evidence), record.nextAction, record.dueDate);
}

type SourceDocumentRow = {
  id: string; conversation_id: string; filename: string; media_type: "text/html"; publisher: string;
  published_at: string; event_at: string; source_url: string; object_key: string; sha256: string;
  parser_version: string; language: string;
};

type TranscriptSegmentRow = {
  id: string; conversation_id: string; source_document_id: string; section: "presentation" | "qna";
  ordinal: number; speaker: string; role: string; content: string; anchor: string;
};

type KnowledgeClaimRow = {
  id: string; conversation_id: string; source_document_id: string; segment_id: string;
  claim_type: KnowledgeClaim["type"]; subject: string; statement: string; metric_key: string;
  value_text: string; numeric_value: number | null; unit: string; period: string; evidence_excerpt: string;
  evidence_anchor: string; confidence: number; verification_status: KnowledgeClaim["verificationStatus"];
};

export async function persistParsedEarningsCall(db: Database, parsed: ParsedEarningsCall) {
  const { record, source, segments, claims, entity } = parsed;
  await insertConversation(db, record).run();
  await db.batch([
    db.prepare("DELETE FROM knowledge_claims WHERE conversation_id = ?").bind(record.id),
    db.prepare("DELETE FROM transcript_segments WHERE conversation_id = ?").bind(record.id),
    db.prepare("DELETE FROM source_documents WHERE conversation_id = ?").bind(record.id),
  ]);
  await db.prepare(`INSERT INTO source_documents
    (id, conversation_id, filename, media_type, publisher, published_at, event_at, source_url, object_key, sha256, parser_version, language, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`)
    .bind(source.id, record.id, source.filename, source.mediaType, source.publisher, source.publishedAt, source.eventAt,
      source.sourceUrl, source.objectKey, source.sha256, source.parserVersion, source.language).run();
  if (segments.length) {
    await db.batch(segments.map((segment) => db.prepare(`INSERT INTO transcript_segments
      (id, conversation_id, source_document_id, section, ordinal, speaker, role, content, anchor, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`)
      .bind(segment.id, record.id, source.id, segment.section, segment.ordinal, segment.speaker, segment.role, segment.content, segment.anchor)));
  }
  if (claims.length) {
    await db.batch(claims.map((item) => db.prepare(`INSERT INTO knowledge_claims
      (id, conversation_id, source_document_id, segment_id, claim_type, subject, statement, metric_key,
       value_text, numeric_value, unit, period, evidence_excerpt, evidence_anchor, confidence, verification_status, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`)
      .bind(item.id, record.id, source.id, item.segmentId, item.type, item.subject, item.statement, item.metricKey || "",
        item.valueText || "", item.numericValue ?? null, item.unit || "", item.period || "", item.evidenceExcerpt,
        item.evidenceAnchor, item.confidence, item.verificationStatus)));
  }
  await db.batch([
    db.prepare(`INSERT OR REPLACE INTO conversation_access
      (conversation_id, department, industry_group, project_group, sensitivity, updated_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`)
      .bind(record.id, record.department, record.industry, record.projectGroup, record.sensitivity),
    db.prepare(`INSERT OR REPLACE INTO knowledge_governance
      (entity_type, entity_id, owner, verification_status, valid_until, next_review_at, version, updated_at)
      VALUES ('conversation', ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`)
      .bind(record.id, record.owner, record.status, record.validUntil, record.nextReviewAt, record.version),
    db.prepare(`INSERT OR REPLACE INTO knowledge_entities
      (id, canonical_name, entity_type, tickers_json, aliases_json, updated_at)
      VALUES (?, ?, 'company', ?, ?, CURRENT_TIMESTAMP)`)
      .bind(entity.id, entity.canonicalName, JSON.stringify(entity.tickers), JSON.stringify(entity.aliases)),
    db.prepare(`INSERT OR REPLACE INTO conversation_entities (conversation_id, entity_id, relation_type)
      VALUES (?, ?, 'subject')`).bind(record.id, entity.id),
  ]);
}

export async function loadStructuredKnowledge(db: Database, conversationIds: Set<string>) {
  if (!conversationIds.size) return new Map<string, Pick<Conversation, "source" | "claims" | "segments">>();
  const [sourceRows, segmentRows, claimRows] = await Promise.all([
    db.prepare("SELECT * FROM source_documents").all<SourceDocumentRow>(),
    db.prepare("SELECT * FROM transcript_segments ORDER BY ordinal").all<TranscriptSegmentRow>(),
    db.prepare("SELECT * FROM knowledge_claims ORDER BY created_at, id").all<KnowledgeClaimRow>(),
  ]);
  const result = new Map<string, Pick<Conversation, "source" | "claims" | "segments">>();
  for (const conversationId of conversationIds) result.set(conversationId, { claims: [], segments: [] });
  for (const row of segmentRows.results) {
    if (!conversationIds.has(row.conversation_id)) continue;
    const segment: TranscriptSegment = { id: row.id, conversationId: row.conversation_id, sourceDocumentId: row.source_document_id, section: row.section, ordinal: row.ordinal, speaker: row.speaker, role: row.role, content: row.content, anchor: row.anchor };
    result.get(row.conversation_id)?.segments?.push(segment);
  }
  for (const row of claimRows.results) {
    if (!conversationIds.has(row.conversation_id)) continue;
    const item: KnowledgeClaim = { id: row.id, conversationId: row.conversation_id, sourceDocumentId: row.source_document_id, segmentId: row.segment_id, type: row.claim_type, subject: row.subject, statement: row.statement, metricKey: row.metric_key || undefined, valueText: row.value_text || undefined, numericValue: row.numeric_value ?? undefined, unit: row.unit || undefined, period: row.period || undefined, evidenceExcerpt: row.evidence_excerpt, evidenceAnchor: row.evidence_anchor, confidence: row.confidence, verificationStatus: row.verification_status };
    result.get(row.conversation_id)?.claims?.push(item);
  }
  for (const row of sourceRows.results) {
    if (!conversationIds.has(row.conversation_id)) continue;
    const entry = result.get(row.conversation_id)!;
    const source: EarningsCallSource = { id: row.id, conversationId: row.conversation_id, filename: row.filename, mediaType: row.media_type, publisher: row.publisher, publishedAt: row.published_at, eventAt: row.event_at, sourceUrl: row.source_url, objectKey: row.object_key, sha256: row.sha256, parserVersion: row.parser_version, language: row.language, segmentCount: entry.segments?.length || 0, claimCount: entry.claims?.length || 0 };
    entry.source = source;
  }
  return result;
}

export type { ConversationRow, Database };
