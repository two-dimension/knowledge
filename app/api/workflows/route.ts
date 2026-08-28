import { ensureSchema, getDatabase, rowToConversation, type ConversationRow } from "../../../db/database";
import { authorizedConversationIds, getAccessContext } from "../../../lib/permissions";

export async function GET(request: Request) {
  const db = getDatabase();
  await ensureSchema(db);
  const access = await getAccessContext(db);
  const allowedIds = await authorizedConversationIds(db, access);
  const action = new URL(request.url).searchParams.get("action") || "health";
  if (action === "follows") {
    const rows = await db.prepare("SELECT * FROM follows WHERE actor_id = ? ORDER BY created_at DESC").bind(access.userId).all<Record<string, unknown>>();
    return Response.json({ follows: rows.results });
  }
  if (action === "notifications") {
    const rows = await db.prepare("SELECT * FROM notifications WHERE actor_id = ? ORDER BY created_at DESC LIMIT 30").bind(access.userId).all<Record<string, unknown>>();
    return Response.json({ notifications: rows.results });
  }
  const [conversationRows, governanceRows, gapCount, feedbackCount, noResultRows] = await Promise.all([
    db.prepare("SELECT * FROM conversations ORDER BY date DESC").all<ConversationRow>(),
    db.prepare("SELECT * FROM knowledge_governance ORDER BY next_review_at ASC").all<{ entity_type: string; entity_id: string; owner: string; verification_status: string; valid_until: string; next_review_at: string; version: number }>(),
    db.prepare("SELECT COUNT(*) AS count FROM knowledge_gaps WHERE status = '待调研'").first<{ count: number }>(),
    db.prepare("SELECT COUNT(*) AS count FROM research_feedback WHERE status = '待处理'").first<{ count: number }>(),
    db.prepare("SELECT query, COUNT(*) AS count FROM search_audit WHERE actor_id = ? AND result_count = 0 GROUP BY query ORDER BY count DESC LIMIT 8").bind(access.userId).all<{ query: string; count: number }>(),
  ]);
  const records = conversationRows.results.filter((row) => allowedIds.has(row.id)).map(rowToConversation);
  governanceRows.results = governanceRows.results.filter((item) => item.entity_type !== "conversation" || allowedIds.has(item.entity_id));
  const today = new Date().toISOString().slice(0, 10);
  const expired = governanceRows.results.filter((item) => item.valid_until && item.valid_until < today && !["已归档", "已替代"].includes(item.verification_status));
  const noOwner = governanceRows.results.filter((item) => !item.owner.trim());
  const singleSource = records.filter((record) => record.evidence.length < 2);
  const noCounter = records.filter((record) => !/反证|证伪|相反|低于|下降|不/.test(`${record.nextAction} ${record.summary}`));
  const overdue = records.filter((record) => record.dueDate < today && !["已证实", "已证伪", "已归档"].includes(record.status));
  const titleCounts = new Map<string, number>();
  records.forEach((record) => { const key = record.title.replace(/\s+/g, "").toLowerCase(); titleCounts.set(key, (titleCounts.get(key) ?? 0) + 1); });
  const duplicates = Array.from(titleCounts.values()).filter((count) => count > 1).length;
  return Response.json({
    summary: { expired: expired.length, noOwner: noOwner.length, singleSource: singleSource.length, noCounter: noCounter.length, overdue: overdue.length, duplicates, knowledgeGaps: gapCount?.count ?? 0, feedbackPending: feedbackCount?.count ?? 0 },
    expired, noOwner, singleSource, noCounter, overdue, highFrequencyNoResults: noResultRows.results,
  });
}

export async function POST(request: Request) {
  const db = getDatabase();
  await ensureSchema(db);
  const access = await getAccessContext(db);
  const allowedIds = await authorizedConversationIds(db, access);
  const body = await request.json() as { action?: string; [key: string]: unknown };
  if (body.action === "feedback") {
    const sourceIds = Array.isArray(body.sourceIds) ? body.sourceIds.map(String) : [];
    if (sourceIds.some((id) => !allowedIds.has(id))) return Response.json({ error: "反馈中包含无权访问的来源" }, { status: 403 });
    const id = crypto.randomUUID();
    await db.prepare(`INSERT INTO research_feedback
      (id, question, answer_json, source_ids_json, feedback_type, detail, model_version, actor_id, actor_email)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(id, String(body.question || ""), JSON.stringify(body.answer || {}), JSON.stringify(sourceIds), String(body.feedbackType || "有帮助"), String(body.detail || ""), String(body.modelVersion || "evidence-synthesis-v1"), access.userId, access.email).run();
    return Response.json({ saved: true, id }, { status: 201 });
  }
  if (body.action === "knowledge-gap") {
    const id = crypto.randomUUID();
    await db.prepare("INSERT INTO knowledge_gaps (id, question, suggestions_json, actor_id, actor_email) VALUES (?, ?, ?, ?, ?)")
      .bind(id, String(body.question || ""), JSON.stringify(body.suggestions || []), access.userId, access.email).run();
    return Response.json({ saved: true, id }, { status: 201 });
  }
  if (body.action === "follow") {
    if (String(body.entityType || "") === "conversation" && !allowedIds.has(String(body.entityValue || ""))) return Response.json({ error: "无权关注该知识条目" }, { status: 403 });
    const id = crypto.randomUUID();
    await db.prepare(`INSERT OR REPLACE INTO follows (id, actor_id, entity_type, entity_value, cadence)
      VALUES (?, ?, ?, ?, ?)`)
      .bind(id, access.userId, String(body.entityType || "keyword"), String(body.entityValue || ""), String(body.cadence || "daily")).run();
    return Response.json({ saved: true, id }, { status: 201 });
  }
  if (body.action === "governance") {
    const entityType = String(body.entityType || "conversation");
    const entityId = String(body.entityId || "");
    if (!entityId) return Response.json({ error: "缺少知识条目 ID" }, { status: 400 });
    if (entityType === "conversation" && !allowedIds.has(entityId)) return Response.json({ error: "无权更新该知识条目" }, { status: 403 });
    const current = await db.prepare("SELECT version FROM knowledge_governance WHERE entity_type = ? AND entity_id = ?").bind(entityType, entityId).first<{ version: number }>();
    await db.prepare(`INSERT OR REPLACE INTO knowledge_governance
      (entity_type, entity_id, owner, verification_status, valid_until, next_review_at, version, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`)
      .bind(entityType, entityId, String(body.owner || ""), String(body.verificationStatus || "草稿"), String(body.validUntil || ""), String(body.nextReviewAt || ""), (current?.version ?? 0) + 1).run();
    return Response.json({ saved: true, version: (current?.version ?? 0) + 1 });
  }
  return Response.json({ error: "不支持的工作流操作" }, { status: 400 });
}
