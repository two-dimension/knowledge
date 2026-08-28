import { headers } from "next/headers";
import { ensureSchema, getDatabase, insertConversation, loadStructuredKnowledge, rowToConversation, type ConversationRow } from "../../../db/database";
import type { Conversation } from "../../../lib/knowledge-data";
import { accessSummary, authorizedConversationIds, ensureAccessRows, getAccessContext } from "../../../lib/permissions";
import { indexConversation } from "../../../lib/retrieval";

type GovernanceRow = { entity_id: string; owner: string; verification_status: Conversation["status"]; valid_until: string; next_review_at: string; version: number };

async function loadAuthorizedRecords(db: ReturnType<typeof getDatabase>) {
  const access = await getAccessContext(db);
  const allowedIds = await authorizedConversationIds(db, access);
  const [rows, governance] = await Promise.all([
    db.prepare("SELECT * FROM conversations ORDER BY date DESC, created_at DESC").all<ConversationRow>(),
    db.prepare("SELECT * FROM knowledge_governance WHERE entity_type = 'conversation'").all<GovernanceRow>(),
  ]);
  const governanceById = new Map(governance.results.map((item) => [item.entity_id, item]));
  const structured = await loadStructuredKnowledge(db, allowedIds);
  const records = rows.results.filter((row) => allowedIds.has(row.id)).map((row) => {
    const record = rowToConversation(row);
    const state = governanceById.get(row.id);
    const governed = state ? { ...record, owner: state.owner || record.owner, status: state.verification_status, validUntil: state.valid_until, nextReviewAt: state.next_review_at, version: state.version } : record;
    return { ...governed, ...structured.get(record.id) };
  });
  return { access, records };
}

export async function GET(request: Request) {
  const db = getDatabase();
  await ensureSchema(db);
  await ensureAccessRows(db);
  const { access, records } = await loadAuthorizedRecords(db);
  if (new URL(request.url).searchParams.get("format") === "export") {
    if (!access.canExport) return Response.json({ error: "当前权限不允许导出" }, { status: 403 });
    return new Response(JSON.stringify(records, null, 2), { headers: { "content-type": "application/json; charset=utf-8", "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`投研知识库-${new Date().toISOString().slice(0, 10)}.json`)}` } });
  }
  return Response.json({ records, access: accessSummary(access), saveState: "saved" });
}

export async function POST(request: Request) {
  const record = await request.json() as Conversation;
  if (!record.id || !record.title || !record.date) return Response.json({ error: "缺少必要字段" }, { status: 400 });
  const db = getDatabase();
  await ensureSchema(db);
  await insertConversation(db, record).run();
  await indexConversation(db, record);
  await db.prepare(`INSERT OR REPLACE INTO conversation_access
    (conversation_id, department, industry_group, project_group, sensitivity, updated_at)
    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`)
    .bind(record.id, record.department || "投研部", record.industry, record.projectGroup || "二级市场", record.sensitivity).run();
  await db.prepare(`INSERT OR REPLACE INTO knowledge_governance
    (entity_type, entity_id, owner, verification_status, valid_until, next_review_at, version, updated_at)
    VALUES ('conversation', ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`)
    .bind(record.id, record.owner, record.status, record.validUntil || record.dueDate, record.nextReviewAt || record.dueDate, record.version || 1).run();
  const requestHeaders = await headers();
  await db.prepare("INSERT INTO audit_events (entity_type, entity_id, action, actor_id, actor_email, detail_json) VALUES (?, ?, ?, ?, ?, ?)")
    .bind("conversation", record.id, "created", requestHeaders.get("oai-authenticated-user-id"), requestHeaders.get("oai-authenticated-user-email"), JSON.stringify({ title: record.title }))
    .run();
  return Response.json({ record }, { status: 201 });
}

export async function PATCH(request: Request) {
  const body = await request.json() as { id?: string; status?: Conversation["status"]; owner?: string; validUntil?: string; nextReviewAt?: string; snapshot?: Conversation; changeSummary?: string };
  if (!body.id) return Response.json({ error: "缺少观点 ID" }, { status: 400 });
  const db = getDatabase();
  await ensureSchema(db);
  const access = await getAccessContext(db);
  const allowedIds = await authorizedConversationIds(db, access);
  if (!allowedIds.has(body.id)) return Response.json({ error: "无权修改该观点" }, { status: 403 });
  const current = await db.prepare("SELECT * FROM knowledge_governance WHERE entity_type = 'conversation' AND entity_id = ?").bind(body.id).first<GovernanceRow>();
  const version = (current?.version ?? 1) + 1;
  await db.prepare(`INSERT OR REPLACE INTO knowledge_governance
    (entity_type, entity_id, owner, verification_status, valid_until, next_review_at, version, updated_at)
    VALUES ('conversation', ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`)
    .bind(body.id, body.owner || current?.owner || "研究员", body.status || current?.verification_status || "草稿", body.validUntil || current?.valid_until || "", body.nextReviewAt || current?.next_review_at || "", version).run();
  await db.prepare(`INSERT INTO content_versions
    (id, entity_type, entity_id, version, snapshot_json, change_summary, actor_id, actor_email)
    VALUES (?, 'conversation', ?, ?, ?, ?, ?, ?)`)
    .bind(crypto.randomUUID(), body.id, version, JSON.stringify(body.snapshot ?? {}), body.changeSummary || "更新观点状态", access.userId, access.email).run();
  await db.prepare("UPDATE conversations SET status = ?, owner = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
    .bind(body.status || current?.verification_status || "草稿", body.owner || current?.owner || "研究员", body.id).run();
  const followers = await db.prepare("SELECT actor_id FROM follows WHERE entity_type = 'conversation' AND entity_value = ?").bind(body.id).all<{ actor_id: string }>();
  if (followers.results.length) {
    await db.batch(followers.results.map((follower) => db.prepare(`INSERT INTO notifications
      (id, actor_id, title, detail, entity_type, entity_id)
      VALUES (?, ?, ?, ?, 'conversation', ?)`)
      .bind(crypto.randomUUID(), follower.actor_id, "关注的观点已更新", body.changeSummary || `状态更新为 ${body.status || "草稿"}`, body.id!)));
  }
  return Response.json({ saved: true, version, savedAt: new Date().toISOString() });
}
