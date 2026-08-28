import { env } from "cloudflare:workers";

type EvidenceItem = { text: string; citationIds: number[] };

export type MiniMaxRefinement = {
  answer: string;
  paragraphs: EvidenceItem[];
  supportingEvidence: EvidenceItem[];
  counterEvidence: EvidenceItem[];
  unresolvedQuestions: string[];
  model: string;
};

type ChatResponse = {
  choices?: Array<{ message?: { content?: string } }>;
  base_resp?: { status_code?: number; status_msg?: string };
};

function extractJson(value: string) {
  const withoutThinking = value.replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/```(?:json)?|```/gi, "").trim();
  const start = withoutThinking.indexOf("{");
  const end = withoutThinking.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("MiniMax response did not contain JSON");
  return JSON.parse(withoutThinking.slice(start, end + 1)) as Partial<MiniMaxRefinement>;
}

function normalizeEvidence(items: unknown, citationCount: number): EvidenceItem[] {
  if (!Array.isArray(items)) return [];
  return items.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const value = item as { text?: unknown; citationIds?: unknown };
    const text = typeof value.text === "string" ? value.text.replace(/\s*\[\d+\]/g, "").trim() : "";
    const citationIds = Array.isArray(value.citationIds)
      ? Array.from(new Set(value.citationIds.filter((id): id is number => Number.isInteger(id) && Number(id) >= 1 && Number(id) <= citationCount)))
      : [];
    return text ? [{ text, citationIds }] : [];
  }).slice(0, 6);
}

export async function refineWithMiniMax(input: {
  question: string;
  citations: Array<{ excerpt: string }>;
  supportingEvidence: EvidenceItem[];
  counterEvidence: EvidenceItem[];
  unresolvedQuestions: string[];
}): Promise<MiniMaxRefinement | null> {
  const runtime = env as unknown as { MINIMAX_API_KEY?: string; MINIMAX_MODEL?: string; MINIMAX_BASE_URL?: string; MINIMAX_ENABLED?: string };
  if (!runtime.MINIMAX_API_KEY || runtime.MINIMAX_ENABLED === "false") return null;
  const model = runtime.MINIMAX_MODEL || "MiniMax-M3";
  const endpoint = `${(runtime.MINIMAX_BASE_URL || "https://api.minimax.io/v1").replace(/\/$/, "")}/chat/completions`;
  const evidence = input.citations.map((item, index) => `[${index + 1}] ${item.excerpt.slice(0, 260)}`).join("\n");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 28_000);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      signal: controller.signal,
      headers: { authorization: `Bearer ${runtime.MINIMAX_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({
        model,
        stream: false,
        temperature: 0.2,
        max_completion_tokens: 1800,
        reasoning_split: true,
        messages: [
          {
            role: "system",
            content: "你是二级市场买方研究助手。只依据用户提供的编号证据作答，不得补充外部事实，不得暴露思维链。输出严格 JSON；每个结论必须绑定有效 citationIds，但 text 字段中禁止书写 [N] 引用标记，前端会统一渲染。证据不足时明确保留未决问题。",
          },
          {
            role: "user",
            content: `研究问题：${input.question}\n\n已授权证据片段：\n${evidence}\n\n基础支持证据：${JSON.stringify(input.supportingEvidence)}\n基础反证：${JSON.stringify(input.counterEvidence)}\n未决问题：${JSON.stringify(input.unresolvedQuestions)}\n\n返回 JSON：{"answer":"一句话摘要","paragraphs":[{"text":"结论","citationIds":[1]}],"supportingEvidence":[{"text":"支持证据","citationIds":[1]}],"counterEvidence":[{"text":"相反证据或限制条件","citationIds":[2]}],"unresolvedQuestions":["仍需验证的问题"]}`,
          },
        ],
      }),
    });
    const payload = await response.json() as ChatResponse;
    if (!response.ok || (payload.base_resp?.status_code ?? 0) !== 0) throw new Error(payload.base_resp?.status_msg || `MiniMax request failed (${response.status})`);
    const content = payload.choices?.[0]?.message?.content || "";
    const parsed = extractJson(content);
    const citationCount = input.citations.length;
    const paragraphs = normalizeEvidence(parsed.paragraphs, citationCount);
    if (!paragraphs.length) throw new Error("MiniMax response did not contain grounded paragraphs");
    return {
      answer: typeof parsed.answer === "string" && parsed.answer.trim() ? parsed.answer.trim() : paragraphs.map((item) => item.text).join(" "),
      paragraphs,
      supportingEvidence: normalizeEvidence(parsed.supportingEvidence, citationCount),
      counterEvidence: normalizeEvidence(parsed.counterEvidence, citationCount),
      unresolvedQuestions: Array.isArray(parsed.unresolvedQuestions) ? parsed.unresolvedQuestions.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim()).slice(0, 5) : [],
      model,
    };
  } finally {
    clearTimeout(timeout);
  }
}
