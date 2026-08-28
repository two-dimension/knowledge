import { getDatabase } from "../../../db/database";
import { buildResearchSynthesis } from "../../../lib/research-answer";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { question?: string; filters?: Record<string, string | number> };
    const question = body.question?.trim() ?? "";
    if (question.length < 2) return Response.json({ error: "问题至少需要 2 个字符" }, { status: 400 });
    if (question.length > 300) return Response.json({ error: "问题请控制在 300 个字符以内" }, { status: 400 });

    return Response.json(await buildResearchSynthesis(getDatabase(), question, body.filters ?? {}));
  } catch (error) {
    console.error("Research retrieval failed", error);
    return Response.json({ error: "在线证据检索暂时不可用，客户端将自动切换至本地资料索引。" }, { status: 503 });
  }
}
