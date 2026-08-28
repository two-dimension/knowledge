import { headers } from "next/headers";
import { ensureSchema, getDatabase, rowToConversation, type ConversationRow } from "../../../db/database";
import { seedConversations, type Conversation } from "../../../lib/knowledge-data";
import { authorizedConversationIds, getAccessContext } from "../../../lib/permissions";
import { auditWiki, compileWiki, type WikiPage, type WikiPageType } from "../../../lib/wiki-compiler";

type WikiRow = {
  id: string; slug: string; title: string; page_type: WikiPageType; summary: string; content_md: string;
  backlinks_json: string; source_ids_json: string; health_score: number; version: number;
  generated_by: "compiler" | "research-assistant"; updated_at: string;
};

function stringArray(value: string) {
  try { return JSON.parse(value) as string[]; } catch { return []; }
}

function rowToPage(row: WikiRow): WikiPage {
  return { id: row.id, slug: row.slug, title: row.title, pageType: row.page_type, summary: row.summary, contentMd: row.content_md, backlinks: stringArray(row.backlinks_json), sourceIds: stringArray(row.source_ids_json), healthScore: row.health_score, version: row.version, generatedBy: row.generated_by, updatedAt: row.updated_at };
}

async function loadConversations(allowedIds?: Set<string>): Promise<Conversation[]> {
  const db = getDatabase();
  const rows = await db.prepare("SELECT * FROM conversations ORDER BY date DESC, created_at DESC").all<ConversationRow>();
  const records = rows.results.length ? rows.results.map(rowToConversation) : seedConversations;
  return allowedIds ? records.filter((record) => allowedIds.has(record.id)) : records;
}

async function loadPages(allowedIds?: Set<string>) {
  const db = getDatabase();
  const rows = await db.prepare("SELECT * FROM wiki_pages ORDER BY CASE page_type WHEN 'index' THEN 0 WHEN 'industry' THEN 1 WHEN 'company' THEN 2 ELSE 3 END, title ASC").all<WikiRow>();
  const pages = rows.results.map(rowToPage);
  return allowedIds ? pages.filter((page) => page.sourceIds.some((id) => allowedIds.has(id))) : pages;
}

export async function GET(request: Request) {
  const db = getDatabase();
  await ensureSchema(db);
  const access = await getAccessContext(db);
  const allowedIds = await authorizedConversationIds(db, access);
  const records = await loadConversations(allowedIds);
  const persistedPages = await loadPages(allowedIds);
  const compiled = compileWiki(records, persistedPages.length > 0);
  const pages = persistedPages.length ? persistedPages : compiled.pages;
  const url = new URL(request.url);
  const requestedSlug = url.searchParams.get("slug");
  if (url.searchParams.get("format") === "markdown" && requestedSlug) {
    if (!access.canExport) return Response.json({ error: "当前权限不允许导出 Wiki" }, { status: 403 });
    const page = pages.find((item) => item.slug === requestedSlug);
    if (!page) return new Response("Wiki page not found", { status: 404 });
    return new Response(page.contentMd, { headers: { "content-type": "text/markdown; charset=utf-8", "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(page.title)}.md` } });
  }
  const issues = auditWiki(records);
  const links = pages.reduce((sum, page) => sum + page.backlinks.length, 0);
  return Response.json({ pages, issues, stats: { rawSources: records.length, pages: pages.length, links, healthScore: compiled.stats.healthScore }, compiledAt: pages[0]?.updatedAt ?? compiled.compiledAt, persisted: persistedPages.length > 0 });
}

export async function POST(request: Request) {
  const db = getDatabase();
  await ensureSchema(db);
  const body = await request.json() as { action?: "compile" | "file"; title?: string; contentMd?: string; sourceIds?: string[] };
  const requestHeaders = await headers();
  const access = await getAccessContext(db);
  const allowedIds = await authorizedConversationIds(db, access);

  if (body.action === "compile") {
    const records = await loadConversations(allowedIds);
    const snapshot = compileWiki(records, true);
    await db.batch([
      db.prepare("DELETE FROM wiki_pages WHERE generated_by = 'compiler'"),
      ...snapshot.pages.map((page) => db.prepare(`INSERT INTO wiki_pages
        (id, slug, title, page_type, summary, content_md, backlinks_json, source_ids_json, health_score, version, generated_by, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`)
        .bind(page.id, page.slug, page.title, page.pageType, page.summary, page.contentMd, JSON.stringify(page.backlinks), JSON.stringify(page.sourceIds), page.healthScore, page.version, page.generatedBy)),
    ]);
    await db.prepare("INSERT INTO audit_events (entity_type, entity_id, action, actor_id, actor_email, detail_json) VALUES (?, ?, ?, ?, ?, ?)")
      .bind("wiki", "wiki-index", "compiled", requestHeaders.get("oai-authenticated-user-id"), requestHeaders.get("oai-authenticated-user-email"), JSON.stringify({ pages: snapshot.pages.length, sources: records.length }))
      .run();
    return Response.json(snapshot);
  }

  if (body.action === "file") {
    const title = body.title?.trim() ?? "";
    const contentMd = body.contentMd?.trim() ?? "";
    if (title.length < 2 || contentMd.length < 10) return Response.json({ error: "研究笔记内容不足" }, { status: 400 });
    if ((body.sourceIds ?? []).some((id) => !allowedIds.has(id))) return Response.json({ error: "引用来源超出当前权限范围" }, { status: 403 });
    const id = `wiki-note-${Date.now()}`;
    const pageSlug = `notes/${Date.now()}-${title.toLowerCase().replace(/\s+/g, "-").replace(/[^\p{L}\p{N}-]+/gu, "").slice(0, 42)}`;
    await db.prepare(`INSERT INTO wiki_pages
      (id, slug, title, page_type, summary, content_md, backlinks_json, source_ids_json, health_score, version, generated_by, updated_at)
      VALUES (?, ?, ?, 'research-note', ?, ?, '[]', ?, 70, 1, 'research-assistant', CURRENT_TIMESTAMP)`)
      .bind(id, pageSlug, title, contentMd.slice(0, 180), contentMd, JSON.stringify(body.sourceIds ?? []))
      .run();
    await db.prepare("INSERT INTO audit_events (entity_type, entity_id, action, actor_id, actor_email, detail_json) VALUES (?, ?, ?, ?, ?, ?)")
      .bind("wiki_page", id, "filed_from_research_assistant", requestHeaders.get("oai-authenticated-user-id"), requestHeaders.get("oai-authenticated-user-email"), JSON.stringify({ title }))
      .run();
    return Response.json({ page: (await loadPages(allowedIds)).find((page) => page.id === id) }, { status: 201 });
  }

  return Response.json({ error: "不支持的 Wiki 操作" }, { status: 400 });
}
