import { env } from "cloudflare:workers";
import { headers } from "next/headers";
import { ensureSchema, getDatabase, persistParsedEarningsCall } from "../../../../db/database";
import { parseEarningsCallHtml } from "../../../../lib/earnings-call";
import { authorizedConversationIds, getAccessContext } from "../../../../lib/permissions";
import { indexConversation } from "../../../../lib/retrieval";

type BucketObject = { body: ReadableStream; httpMetadata?: { contentType?: string } };
type Bucket = {
  put: (key: string, value: ArrayBuffer, options?: unknown) => Promise<unknown>;
  get: (key: string) => Promise<BucketObject | null>;
};

function hex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function POST(request: Request) {
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return Response.json({ error: "请选择业绩交流会 HTML 文件。" }, { status: 400 });
  if (file.size > 5 * 1024 * 1024) return Response.json({ error: "HTML 文件不能超过 5MB。" }, { status: 413 });
  if (!file.name.toLowerCase().endsWith(".html") && file.type !== "text/html") {
    return Response.json({ error: "当前仅支持 HTML 格式的业绩交流会逐字稿。" }, { status: 415 });
  }

  const bytes = await file.arrayBuffer();
  const html = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  let parsed;
  try {
    parsed = parseEarningsCallHtml(html, file.name);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "HTML 解析失败。" }, { status: 422 });
  }

  const digest = hex(await crypto.subtle.digest("SHA-256", bytes));
  const safeName = file.name.replace(/[^\w.\-\u4e00-\u9fff]/g, "_");
  const objectKey = `source-documents/${parsed.record.id}/${digest.slice(0, 16)}-${safeName}`;
  const db = getDatabase();
  await ensureSchema(db);
  const access = await getAccessContext(db);
  const hostname = new URL(request.url).hostname;
  const isLocalHost = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  if (access.localPreview && !isLocalHost) return Response.json({ error: "请登录后再导入来源文件。" }, { status: 401 });
  if (!access.departments.includes("*") && !access.departments.includes(parsed.record.department)) {
    return Response.json({ error: "当前账号无权向该知识域导入材料。" }, { status: 403 });
  }
  const bucket = (env as unknown as { AUDIO: Bucket }).AUDIO;
  await bucket.put(objectKey, bytes, { httpMetadata: { contentType: "text/html; charset=utf-8" } });
  parsed.source.objectKey = objectKey;
  parsed.source.sha256 = digest;
  parsed.record.source = parsed.source;

  await persistParsedEarningsCall(db, parsed);
  await indexConversation(db, parsed.record);
  const requestHeaders = await headers();
  await db.prepare("INSERT INTO audit_events (entity_type, entity_id, action, actor_id, actor_email, detail_json) VALUES (?, ?, ?, ?, ?, ?)")
    .bind("conversation", parsed.record.id, "earnings_call_html_imported", requestHeaders.get("oai-authenticated-user-id"),
      requestHeaders.get("oai-authenticated-user-email"), JSON.stringify({ filename: file.name, sha256: digest, segmentCount: parsed.segments.length, claimCount: parsed.claims.length })).run();

  return Response.json({
    record: parsed.record,
    imported: {
      sourceDocumentId: parsed.source.id,
      sha256: digest,
      segmentCount: parsed.segments.length,
      claimCount: parsed.claims.length,
      companyParticipantCount: parsed.companyParticipants.length,
      conferenceParticipantCount: parsed.conferenceParticipants.length,
    },
  }, { status: 201 });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const conversationId = url.searchParams.get("conversationId") || "";
  const db = getDatabase();
  await ensureSchema(db);
  const access = await getAccessContext(db);
  const allowedIds = await authorizedConversationIds(db, access);
  if (!allowedIds.has(conversationId)) return Response.json({ error: "无权访问该来源文件。" }, { status: 403 });
  const source = await db.prepare("SELECT * FROM source_documents WHERE conversation_id = ?").bind(conversationId)
    .first<{ id: string; filename: string; object_key: string; publisher: string; published_at: string; sha256: string; parser_version: string }>();
  if (!source) return Response.json({ error: "来源文件不存在。" }, { status: 404 });
  if (url.searchParams.get("download") !== "1") return Response.json({ source });
  if (!source.object_key) return Response.json({ error: "原始文件尚未写入对象存储。" }, { status: 404 });
  const object = await ((env as unknown as { AUDIO: Bucket }).AUDIO).get(source.object_key);
  if (!object) return Response.json({ error: "对象存储中未找到该文件。" }, { status: 404 });
  return new Response(object.body, {
    headers: {
      "content-type": object.httpMetadata?.contentType || "text/html; charset=utf-8",
      "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(source.filename)}`,
    },
  });
}
