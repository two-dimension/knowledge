import { env } from "cloudflare:workers";
import { headers } from "next/headers";
import { ensureSchema, getDatabase, rowToConversation, type ConversationRow } from "../../../db/database";
import { authorizedConversationIds, getAccessContext } from "../../../lib/permissions";
import { indexConversation } from "../../../lib/retrieval";
import { structureTranscript } from "../../../lib/structure-transcript";

type AudioObject = { arrayBuffer: () => Promise<ArrayBuffer> };
type Bucket = { get: (key: string) => Promise<AudioObject | null> };
type Segment = { speaker?: string; text?: string; start?: number; end?: number };

type JobRow = {
  id: string;
  upload_id: string;
  conversation_id: string;
  provider: string;
  model: string;
  status: string;
  raw_transcript: string;
  corrected_transcript: string;
  segments_json: string;
  structure_json: string;
  error_message: string;
  filename?: string;
  content_type?: string;
  size_bytes?: number;
  object_key?: string;
  created_at: string;
  updated_at: string;
  completed_at?: string;
};

function parseJson<T>(value: string, fallback: T): T {
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

function publicJob(row: JobRow) {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    provider: row.provider,
    model: row.model,
    status: row.status,
    transcript: row.corrected_transcript || row.raw_transcript,
    segments: parseJson<Segment[]>(row.segments_json, []),
    suggestion: parseJson<Record<string, unknown>>(row.structure_json, {}),
    error: row.error_message,
    filename: row.filename,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
  };
}

async function getJob(id: string) {
  const db = getDatabase();
  await ensureSchema(db);
  const row = await db.prepare(`SELECT tj.*, u.filename, u.content_type, u.size_bytes, u.object_key
    FROM transcription_jobs tj
    JOIN uploads u ON u.id = tj.upload_id
    WHERE tj.id = ?`).bind(id).first<JobRow>();
  return { db, row };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id")?.trim();
  const conversationId = url.searchParams.get("conversationId")?.trim();
  if (!id && !conversationId) return Response.json({ error: "缺少任务或谈话 ID" }, { status: 400 });
  const db = getDatabase();
  await ensureSchema(db);
  const access = await getAccessContext(db);
  const allowedIds = await authorizedConversationIds(db, access);
  if (conversationId && !allowedIds.has(conversationId)) return Response.json({ error: "无权查看该谈话的转写内容" }, { status: 403 });
  const row = id
    ? await db.prepare(`SELECT tj.*, u.filename FROM transcription_jobs tj JOIN uploads u ON u.id = tj.upload_id WHERE tj.id = ?`).bind(id).first<JobRow>()
    : await db.prepare(`SELECT tj.*, u.filename FROM transcription_jobs tj JOIN uploads u ON u.id = tj.upload_id WHERE tj.conversation_id = ? ORDER BY tj.created_at DESC LIMIT 1`).bind(conversationId).first<JobRow>();
  if (row && !allowedIds.has(row.conversation_id)) return Response.json({ error: "无权查看该谈话的转写内容" }, { status: 403 });
  return Response.json({ job: row ? publicJob(row) : null });
}

export async function POST(request: Request) {
  const body = await request.json() as { jobId?: string };
  if (!body.jobId) return Response.json({ error: "缺少转写任务 ID" }, { status: 400 });
  const { db, row } = await getJob(body.jobId);
  if (!row) return Response.json({ error: "转写任务不存在" }, { status: 404 });
  const access = await getAccessContext(db);
  const allowedIds = await authorizedConversationIds(db, access);
  if (!allowedIds.has(row.conversation_id)) return Response.json({ error: "无权处理该谈话的转写任务" }, { status: 403 });
  if (row.status === "completed") return Response.json({ job: publicJob(row) });
  if ((row.size_bytes ?? 0) > 25 * 1024 * 1024) {
    return Response.json({ job: publicJob(row), error: row.error_message }, { status: 413 });
  }

  const runtime = env as unknown as {
    AUDIO: Bucket;
    OPENAI_API_KEY?: string;
    OPENAI_BASE_URL?: string;
    OPENAI_TRANSCRIBE_MODEL?: string;
  };
  if (!runtime.OPENAI_API_KEY) {
    const message = "音频已安全留档；管理员配置合规批准的 ASR 密钥后即可启动自动转写。";
    await db.prepare("UPDATE transcription_jobs SET status = 'configuration_required', error_message = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(message, row.id).run();
    return Response.json({ job: { ...publicJob(row), status: "configuration_required", error: message } }, { status: 503 });
  }

  await db.prepare("UPDATE transcription_jobs SET status = 'processing', error_message = '', started_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
    .bind(row.id).run();
  try {
    const object = await runtime.AUDIO.get(row.object_key || "");
    if (!object) throw new Error("对象存储中未找到原始音频");
    const audio = await object.arrayBuffer();
    const form = new FormData();
    form.append("file", new File([audio], row.filename || "audio.webm", { type: row.content_type || "audio/webm" }));
    const model = runtime.OPENAI_TRANSCRIBE_MODEL || row.model || "gpt-4o-transcribe-diarize";
    form.append("model", model);
    if (model.includes("diarize")) {
      form.append("response_format", "diarized_json");
      form.append("chunking_strategy", "auto");
    } else {
      form.append("response_format", "json");
      form.append("prompt", "请准确识别中文二级市场投研谈话中的公司名、股票简称、行业术语、数字、单位和英文缩写，不要自行改写原意。");
    }
    const response = await fetch(`${(runtime.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "")}/audio/transcriptions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${runtime.OPENAI_API_KEY}` },
      body: form,
    });
    const data = await response.json() as { text?: string; segments?: Segment[]; error?: { message?: string } };
    if (!response.ok) throw new Error(data.error?.message || `语音服务返回 ${response.status}`);
    const segments = Array.isArray(data.segments) ? data.segments : [];
    const corrected = segments.length
      ? segments.map((segment) => {
        const time = typeof segment.start === "number" ? new Date(segment.start * 1000).toISOString().slice(14, 19) : "00:00";
        return `[${time}] ${segment.speaker || "说话人"}：${segment.text || ""}`;
      }).join("\n")
      : (data.text || "").trim();
    if (!corrected) throw new Error("语音服务未返回可用文字");
    const suggestion = structureTranscript(corrected);
    await db.prepare(`UPDATE transcription_jobs SET status = 'completed', raw_transcript = ?, corrected_transcript = ?,
      segments_json = ?, structure_json = ?, error_message = '', completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .bind(data.text || corrected, corrected, JSON.stringify(segments), JSON.stringify(suggestion), row.id).run();
    await db.prepare("UPDATE conversations SET transcript = ?, status = '草稿', updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(corrected, row.conversation_id).run();
    const conversationRow = await db.prepare("SELECT * FROM conversations WHERE id = ?").bind(row.conversation_id).first<ConversationRow>();
    if (conversationRow) await indexConversation(db, rowToConversation(conversationRow));
    const requestHeaders = await headers();
    await db.prepare("INSERT INTO audit_events (entity_type, entity_id, action, actor_id, actor_email, detail_json) VALUES (?, ?, ?, ?, ?, ?)")
      .bind("conversation", row.conversation_id, "audio_transcribed", requestHeaders.get("oai-authenticated-user-id"), requestHeaders.get("oai-authenticated-user-email"), JSON.stringify({ jobId: row.id, model, segments: segments.length })).run();
    const completed = await db.prepare(`SELECT tj.*, u.filename FROM transcription_jobs tj JOIN uploads u ON u.id = tj.upload_id WHERE tj.id = ?`).bind(row.id).first<JobRow>();
    return Response.json({ job: completed ? publicJob(completed) : null });
  } catch (error) {
    const message = error instanceof Error ? error.message : "语音转写失败";
    await db.prepare("UPDATE transcription_jobs SET status = 'failed', error_message = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(message.slice(0, 500), row.id).run();
    return Response.json({ error: message }, { status: 502 });
  }
}
