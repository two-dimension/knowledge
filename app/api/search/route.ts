import { ensureSchema, getDatabase, rowToConversation, type ConversationRow } from "../../../db/database";
import { accessSummary, authorizedConversationIds, getAccessContext } from "../../../lib/permissions";
import { indexConversation, searchConversations } from "../../../lib/retrieval";

async function backfillIndex() {
  const db = getDatabase();
  await ensureSchema(db);
  const [conversationCount, indexedCount] = await Promise.all([
    db.prepare("SELECT COUNT(*) AS count FROM conversations").first<{ count: number }>(),
    db.prepare("SELECT COUNT(DISTINCT conversation_id) AS count FROM search_chunks").first<{ count: number }>(),
  ]);
  if ((indexedCount?.count ?? 0) < (conversationCount?.count ?? 0)) {
    const rows = await db.prepare("SELECT * FROM conversations ORDER BY date DESC").all<ConversationRow>();
    for (const row of rows.results) await indexConversation(db, rowToConversation(row));
  }
  return db;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.trim() ?? "";
  if (query.length < 2) return Response.json({ hits: [], provider: "d1-hybrid", query });
  if (query.length > 200) return Response.json({ error: "搜索内容请控制在 200 个字符以内" }, { status: 400 });
  const startedAt = Date.now();
  const db = await backfillIndex();
  const access = await getAccessContext(db);
  const allowedIds = await authorizedConversationIds(db, access);
  const filters = {
    industry: url.searchParams.get("industry") || undefined,
    ticker: url.searchParams.get("ticker") || undefined,
    owner: url.searchParams.get("owner") || undefined,
    dateFrom: url.searchParams.get("dateFrom") || undefined,
    dateTo: url.searchParams.get("dateTo") || undefined,
    minConfidence: Number(url.searchParams.get("minConfidence") || 0) || undefined,
    status: url.searchParams.get("status") || undefined,
    sensitivity: url.searchParams.get("sensitivity") || undefined,
    sort: (url.searchParams.get("sort") || "relevance") as "relevance" | "updated" | "confidence" | "citations",
  };
  const hits = await searchConversations(db, query, 24, { ...filters, allowedIds });
  const rows = await db.prepare("SELECT * FROM conversations ORDER BY date DESC").all<ConversationRow>();
  const records = rows.results.filter((row) => allowedIds.has(row.id)).map(rowToConversation);
  const needle = query.toLowerCase();
  const wikiRows = await db.prepare("SELECT id, slug, title, summary, source_ids_json, updated_at FROM wiki_pages ORDER BY updated_at DESC").all<{ id: string; slug: string; title: string; summary: string; source_ids_json: string; updated_at: string }>();
  const wiki = wikiRows.results.filter((page) => {
    const sourceIds = (() => { try { return JSON.parse(page.source_ids_json) as string[]; } catch { return []; } })();
    return sourceIds.length > 0 && sourceIds.some((id) => allowedIds.has(id)) && `${page.title} ${page.summary}`.toLowerCase().includes(needle);
  }).slice(0, 8).map((page) => ({ ...page, reason: "Wiki 标题或摘要匹配" }));
  const people = Array.from(new Set(records.flatMap((record) => record.participants))).filter((person) => person.toLowerCase().includes(needle)).slice(0, 8).map((name) => ({ name, reason: "信息源姓名匹配" }));
  const subjects = Array.from(new Set(records.flatMap((record) => [...record.tickers, record.industry]))).filter((subject) => subject.toLowerCase().includes(needle)).slice(0, 8).map((name) => ({ name, reason: "标的或行业匹配" }));
  const verification = records.filter((record) => !["已证实", "已证伪", "已归档"].includes(record.status) && `${record.title} ${record.nextAction}`.toLowerCase().includes(needle)).slice(0, 8);
  const elapsedMs = Date.now() - startedAt;
  const knowledgeDomains = [
    ...access.departments.map((value) => `部门：${value}`),
    ...access.industries.map((value) => `行业：${value === "*" ? "全部授权行业" : value}`),
    ...access.projects.map((value) => `项目：${value}`),
    `敏感等级：${access.maxSensitivity}`,
  ];
  await db.prepare(`INSERT INTO search_audit (id, actor_id, query, filters_json, knowledge_domains_json, result_count, elapsed_ms)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .bind(crypto.randomUUID(), access.userId, query, JSON.stringify(filters), JSON.stringify(knowledgeDomains), hits.length, elapsedMs).run();
  return Response.json({
    hits,
    groups: {
      bestAnswer: hits.slice(0, 3),
      opinions: hits.filter((hit) => hit.citations.some((citation) => citation.kind === "thesis")),
      conversations: hits,
      wiki,
      people,
      subjects,
      verification,
    },
    provider: "d1-permission-aware-hybrid",
    query,
    filters,
    sort: filters.sort,
    knowledgeDomains,
    access: accessSummary(access),
    elapsedMs,
  });
}
