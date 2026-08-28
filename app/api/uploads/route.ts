import { env } from "cloudflare:workers";
import { headers } from "next/headers";
import { ensureSchema, getDatabase } from "../../../db/database";
import { authorizedConversationIds, getAccessContext } from "../../../lib/permissions";

type BucketObject = { body: ReadableStream; httpMetadata?: { contentType?: string } };
type Bucket = { put: (key: string, value: ArrayBuffer, options?: unknown) => Promise<unknown>; get: (key: string) => Promise<BucketObject | null> };

export async function POST(request: Request) {
  const form = await request.formData();
  const file = form.get("file");
  const conversationId = String(form.get("conversationId") || "");
  if (!(file instanceof File) || !conversationId) return Response.json({ error: "文件或谈话 ID 缺失" }, { status: 400 });
  if (file.size > 500 * 1024 * 1024) return Response.json({ error: "文件超过 500MB" }, { status: 413 });
  if (!file.type.startsWith("audio/")) return Response.json({ error: "当前仅支持音频文件" }, { status: 415 });
  const db = getDatabase();
  await ensureSchema(db);
  const access = await getAccessContext(db);
  const allowedIds = await authorizedConversationIds(db, access);
  if (!allowedIds.has(conversationId)) return Response.json({ error: "无权向该谈话上传录音" }, { status: 403 });
  const safeName = file.name.replace(/[^\w.\-\u4e00-\u9fff]/g, "_");
  const key = `conversations/${conversationId}/${crypto.randomUUID()}-${safeName}`;
  const bucket = (env as unknown as { AUDIO: Bucket }).AUDIO;
  await bucket.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: file.type || "application/octet-stream" } });
  const id = crypto.randomUUID();
  await db.prepare("INSERT INTO uploads (id, conversation_id, object_key, filename, content_type, size_bytes) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(id, conversationId, key, file.name, file.type || "application/octet-stream", file.size).run();
  const runtime = env as unknown as { ASR_PROVIDER?: string; OPENAI_TRANSCRIBE_MODEL?: string };
  const jobId = crypto.randomUUID();
  const eligible = file.size <= 25 * 1024 * 1024;
  const status = eligible ? "queued" : "file_too_large";
  const errorMessage = eligible ? "" : "音频已安全留档，但超过 25MB；自动转写前需要在内网侧切分文件。";
  await db.prepare(`INSERT INTO transcription_jobs
    (id, upload_id, conversation_id, provider, model, status, error_message)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .bind(jobId, id, conversationId, runtime.ASR_PROVIDER || "openai", runtime.OPENAI_TRANSCRIBE_MODEL || "gpt-4o-transcribe-diarize", status, errorMessage).run();
  const requestHeaders = await headers();
  await db.prepare("INSERT INTO audit_events (entity_type, entity_id, action, actor_id, actor_email, detail_json) VALUES (?, ?, ?, ?, ?, ?)")
    .bind("conversation", conversationId, "audio_uploaded", requestHeaders.get("oai-authenticated-user-id"), requestHeaders.get("oai-authenticated-user-email"), JSON.stringify({ filename: file.name, size: file.size })).run();
  return Response.json({
    id,
    key,
    filename: file.name,
    transcriptionJob: { id: jobId, status, autoProcess: eligible },
  }, { status: 201 });
}

export async function GET(request: Request) {
  const uploadId = new URL(request.url).searchParams.get("id") || "";
  const db = getDatabase();
  await ensureSchema(db);
  const access = await getAccessContext(db);
  if (!access.canDownloadAudio) return Response.json({ error: "当前权限不允许下载录音" }, { status: 403 });
  const upload = await db.prepare("SELECT * FROM uploads WHERE id = ?").bind(uploadId).first<{ id: string; conversation_id: string; object_key: string; filename: string; content_type: string }>();
  if (!upload) return Response.json({ error: "录音不存在" }, { status: 404 });
  const allowedIds = await authorizedConversationIds(db, access);
  if (!allowedIds.has(upload.conversation_id)) return Response.json({ error: "无权访问该录音" }, { status: 403 });
  const object = await ((env as unknown as { AUDIO: Bucket }).AUDIO).get(upload.object_key);
  if (!object) return Response.json({ error: "录音文件不存在" }, { status: 404 });
  return new Response(object.body, { headers: { "content-type": object.httpMetadata?.contentType || upload.content_type, "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(upload.filename)}` } });
}
