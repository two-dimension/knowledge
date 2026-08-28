import type { Database } from "../db/database";
import type { Conversation } from "./knowledge-data";

export type SearchCitation = {
  chunkId: string;
  kind: string;
  excerpt: string;
  score: number;
};

export type SearchHit = {
  conversationId: string;
  title: string;
  industry: string;
  tickers: string[];
  status: Conversation["status"];
  sensitivity: Conversation["sensitivity"];
  date: string;
  score: number;
  citations: SearchCitation[];
  reasons: string[];
};

type Chunk = {
  id: string;
  conversation_id: string;
  kind: string;
  content: string;
  title: string;
  industry: string;
  tickers_json: string;
  status: Conversation["status"];
  sensitivity: Conversation["sensitivity"];
  date: string;
  confidence: number;
  owner: string;
};

export type SearchOptions = {
  allowedIds?: Set<string>;
  industry?: string;
  ticker?: string;
  owner?: string;
  dateFrom?: string;
  dateTo?: string;
  minConfidence?: number;
  status?: string;
  sensitivity?: string;
  sort?: "relevance" | "updated" | "confidence" | "citations";
};

const kindBoost: Record<string, number> = {
  title: 1.45,
  thesis: 1.35,
  summary: 1.15,
  transcript: 1,
};

function safeArray(value: string) {
  try { return JSON.parse(value) as string[]; } catch { return []; }
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^\p{L}\p{N}\u4e00-\u9fff]+/gu, " ").trim();
}

function terms(value: string) {
  const normalized = normalize(value);
  const latin = normalized.match(/[a-z0-9][a-z0-9.+-]*/g) ?? [];
  const chinese = normalized.match(/[\u4e00-\u9fff]+/g)?.flatMap((word) => {
    if (word.length <= 2) return [word];
    return [word, ...Array.from({ length: word.length - 1 }, (_, index) => word.slice(index, index + 2))];
  }) ?? [];
  return Array.from(new Set([...latin, ...chinese].filter(Boolean)));
}

function excerpt(content: string, queryTerms: string[]) {
  const compact = content.replace(/\s+/g, " ").trim();
  const lower = compact.toLowerCase();
  const positions = queryTerms.map((term) => lower.indexOf(term.toLowerCase())).filter((position) => position >= 0);
  const start = positions.length ? Math.max(0, Math.min(...positions) - 38) : 0;
  const slice = compact.slice(start, start + 170);
  return `${start > 0 ? "…" : ""}${slice}${start + slice.length < compact.length ? "…" : ""}`;
}

function splitTranscript(value: string) {
  const paragraphs = value.split(/\n{2,}|(?<=[。！？!?；;])\s*/).map((item) => item.trim()).filter(Boolean);
  const chunks: string[] = [];
  let current = "";
  for (const paragraph of paragraphs) {
    if (current && current.length + paragraph.length > 520) {
      chunks.push(current);
      current = paragraph;
    } else {
      current += `${current ? "\n" : ""}${paragraph}`;
    }
  }
  if (current) chunks.push(current);
  return chunks.length ? chunks : [value];
}

export function buildConversationChunks(record: Conversation) {
  const chunks = [
    { kind: "title", content: `${record.title}\n${record.industry}\n${record.tickers.join(" ")}\n${record.tags.join(" ")}` },
    { kind: "summary", content: record.summary },
    ...record.theses.map((content) => ({ kind: "thesis", content })),
    ...splitTranscript(record.transcript).map((content) => ({ kind: "transcript", content })),
  ].filter((chunk) => chunk.content.trim());
  const ordinals = new Map<string, number>();
  return chunks.map((chunk) => {
    const ordinal = ordinals.get(chunk.kind) ?? 0;
    ordinals.set(chunk.kind, ordinal + 1);
    return {
      id: `${record.id}:${chunk.kind}:${ordinal}`,
      conversationId: record.id,
      kind: chunk.kind,
      ordinal,
      content: chunk.content.trim(),
      metadata: { industry: record.industry, tickers: record.tickers, sensitivity: record.sensitivity, date: record.date },
    };
  });
}

export async function indexConversation(db: Database, record: Conversation) {
  const chunks = buildConversationChunks(record);
  await db.batch([
    db.prepare("DELETE FROM search_chunks WHERE conversation_id = ?").bind(record.id),
    ...chunks.map((chunk) => db.prepare(`INSERT INTO search_chunks
      (id, conversation_id, kind, ordinal, content, metadata_json, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`)
      .bind(chunk.id, chunk.conversationId, chunk.kind, chunk.ordinal, chunk.content, JSON.stringify(chunk.metadata))),
  ]);
}

export async function searchConversations(db: Database, query: string, limit = 8, options: SearchOptions = {}): Promise<SearchHit[]> {
  const queryTerms = terms(query);
  if (!queryTerms.length) return [];
  const rows = await db.prepare(`SELECT sc.id, sc.conversation_id, sc.kind, sc.content,
    c.title, c.industry, c.tickers_json, c.status, c.sensitivity, c.date, c.confidence, c.owner
    FROM search_chunks sc
    JOIN conversations c ON c.id = sc.conversation_id
    ORDER BY c.date DESC, sc.ordinal ASC
    LIMIT 1000`).all<Chunk>();
  const phrase = normalize(query);
  const now = Date.now();
  const scored = rows.results.filter((chunk) => {
    if (options.allowedIds && !options.allowedIds.has(chunk.conversation_id)) return false;
    if (options.industry && chunk.industry !== options.industry) return false;
    if (options.ticker && !safeArray(chunk.tickers_json).includes(options.ticker)) return false;
    if (options.owner && chunk.owner !== options.owner) return false;
    if (options.dateFrom && chunk.date < options.dateFrom) return false;
    if (options.dateTo && chunk.date > options.dateTo) return false;
    if (options.minConfidence && chunk.confidence < options.minConfidence) return false;
    if (options.status && chunk.status !== options.status) return false;
    if (options.sensitivity && chunk.sensitivity !== options.sensitivity) return false;
    return true;
  }).map((chunk) => {
    const haystack = normalize(chunk.content);
    const matched = queryTerms.filter((term) => haystack.includes(term));
    if (!matched.length) return null;
    const coverage = matched.length / queryTerms.length;
    const density = matched.reduce((score, term) => score + Math.min(3, haystack.split(term).length - 1), 0) / Math.max(1, queryTerms.length * 2);
    const exact = phrase.length >= 2 && haystack.includes(phrase) ? 0.45 : 0;
    const age = Math.max(0, (now - new Date(`${chunk.date}T00:00:00Z`).getTime()) / 86_400_000);
    const recency = Math.max(0, 0.12 - age / 3650);
    const confidence = Math.max(0, Math.min(0.1, chunk.confidence / 1000));
    const score = (coverage * 0.72 + Math.min(0.35, density * 0.2) + exact + recency + confidence) * (kindBoost[chunk.kind] ?? 1);
    return { chunk, score };
  }).filter((item): item is { chunk: Chunk; score: number } => Boolean(item)).sort((a, b) => b.score - a.score);

  const grouped = new Map<string, SearchHit>();
  for (const item of scored) {
    const current = grouped.get(item.chunk.conversation_id);
    const citation = {
      chunkId: item.chunk.id,
      kind: item.chunk.kind,
      excerpt: excerpt(item.chunk.content, queryTerms),
      score: Number(Math.min(1, item.score / 2).toFixed(3)),
    };
    if (!current) {
      grouped.set(item.chunk.conversation_id, {
        conversationId: item.chunk.conversation_id,
        title: item.chunk.title,
        industry: item.chunk.industry,
        tickers: safeArray(item.chunk.tickers_json),
        status: item.chunk.status,
        sensitivity: item.chunk.sensitivity,
        date: item.chunk.date,
        score: Number(Math.min(1, item.score / 2).toFixed(3)),
        citations: [citation],
        reasons: [
          normalize(item.chunk.title).includes(phrase) ? "标题精确匹配" : "语义相关",
          item.chunk.confidence >= 80 ? "高可信来源" : "已交叉检索",
          (now - new Date(`${item.chunk.date}T00:00:00Z`).getTime()) / 86_400_000 <= 30 ? "近期材料" : "历史材料",
          safeArray(item.chunk.tickers_json).some((ticker) => ["阿里巴巴", "BABA.N"].includes(ticker)) ? "与当前持仓相关" : "",
        ].filter(Boolean),
      });
    } else if (current.citations.length < 3) {
      current.citations.push(citation);
    }
  }
  const results = Array.from(grouped.values());
  results.sort((a, b) => options.sort === "updated" ? b.date.localeCompare(a.date)
    : options.sort === "confidence" ? b.score - a.score
    : options.sort === "citations" ? b.citations.length - a.citations.length
    : b.score - a.score);
  return results.slice(0, limit);
}
