import { ensureSchema, getDatabase } from "../../../../db/database";
import { buildResearchSynthesis, type ResearchProgress } from "../../../../lib/research-answer";
import { getAccessContext } from "../../../../lib/permissions";

type Result = Awaited<ReturnType<typeof buildResearchSynthesis>>;
type StreamEvent = { type: "stage"; label: string; detail: string; elapsedMs: number; sourceCount?: number; fragmentCount?: number } | { type: "result"; result: Result } | { type: "error"; error: string };
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function POST(request: Request) {
  const body = await request.json() as { question?: string; filters?: Record<string, string | number> };
  const question = body.question?.trim() ?? "";
  if (question.length < 2) return Response.json({ error: "问题至少需要 2 个字符" }, { status: 400 });
  const db = getDatabase();
  await ensureSchema(db);
  const access = await getAccessContext(db);
  const encoder = new TextEncoder();
  const startedAt = Date.now();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: StreamEvent) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      try {
        send({ type: "stage", label: "理解问题", detail: "解析研究对象、时间范围与指标", elapsedMs: Date.now() - startedAt });
        await wait(120);
        send({ type: "stage", label: "检查访问权限", detail: "确认部门、行业组、项目组与敏感等级", elapsedMs: Date.now() - startedAt });
        await wait(120);
        send({ type: "stage", label: "检索内部资料", detail: "检索谈话、观点、原话与 Wiki 索引", elapsedMs: Date.now() - startedAt });
        const progress = (event: ResearchProgress) => {
          if (event.stage === "retrieved") send({ type: "stage", label: `找到 ${event.fragmentCount} 个相关片段`, detail: `来自 ${event.sourceCount} 个有权限访问的来源`, elapsedMs: Date.now() - startedAt, sourceCount: event.sourceCount, fragmentCount: event.fragmentCount });
          if (event.stage === "verified") send({ type: "stage", label: "交叉核验", detail: `采用 ${event.adoptedCount} 个片段，排除 ${event.excludedCount} 个来源`, elapsedMs: Date.now() - startedAt, sourceCount: event.sourceCount, fragmentCount: event.fragmentCount });
          if (event.stage === "generating") send({ type: "stage", label: "组织答案", detail: "MiniMax M3 基于授权证据生成结论，不展示内部思维链", elapsedMs: Date.now() - startedAt, sourceCount: event.sourceCount, fragmentCount: event.fragmentCount });
        };
        const result = await buildResearchSynthesis(db, question, body.filters ?? {}, access, progress);
        result.trace.elapsedMs = Date.now() - startedAt;
        send({ type: "result", result });
      } catch (error) {
        console.error("Streaming research failed", error);
        send({ type: "error", error: "在线检索暂时不可用" });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" } });
}
