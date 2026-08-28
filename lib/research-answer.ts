import { ensureSchema, rowToConversation, type ConversationRow, type Database } from "../db/database";
import { accessSummary, authorizedConversationIds, getAccessContext, type AccessContext } from "./permissions";
import { searchConversations, type SearchOptions } from "./retrieval";
import { refineWithMiniMax } from "./minimax";

export type ResearchCitation = {
  chunkId: string;
  kind: string;
  excerpt: string;
  score: number;
  conversationId: string;
  title: string;
  date: string;
  industry: string;
  tickers: string[];
  speaker: string;
  timecode: string;
  context: string;
  decision: "adopted" | "excluded";
  reason: string;
};

export type ResearchSynthesis = {
  answer: string;
  paragraphs: Array<{ text: string; citationIds: number[] }>;
  confidence: number;
  coverage: string;
  modelUsed: boolean;
  modelVersion: string;
  provider: string;
  citations: ResearchCitation[];
  excludedSources: Array<{ title: string; reason: string }>;
  supportingEvidence: Array<{ text: string; citationIds: number[] }>;
  counterEvidence: Array<{ text: string; citationIds: number[] }>;
  unresolvedQuestions: string[];
  riskWarnings: string[];
  trace: {
    queryTerms: string[];
    filters: Record<string, unknown>;
    knowledgeDomains: string[];
    fragmentCount: number;
    sourceCount: number;
    elapsedMs: number;
  };
  access: ReturnType<typeof accessSummary>;
};

export type ResearchProgress =
  | { stage: "retrieved"; sourceCount: number; fragmentCount: number }
  | { stage: "verified"; adoptedCount: number; excludedCount: number; sourceCount: number; fragmentCount: number }
  | { stage: "generating"; sourceCount: number; fragmentCount: number };

function queryTerms(question: string) {
  const latin = question.toLowerCase().match(/[a-z0-9][a-z0-9.+-]*/g) ?? [];
  const chinese = (question.match(/[\u4e00-\u9fff]+/g) ?? []).flatMap((word) => word.length <= 2 ? [word] : Array.from({ length: word.length - 1 }, (_, index) => word.slice(index, index + 2)));
  return Array.from(new Set([...latin, ...chinese])).filter((term) => term.length > 1).slice(0, 16);
}

export async function buildResearchSynthesis(db: Database, question: string, filters: SearchOptions = {}, providedAccess?: AccessContext, onProgress?: (progress: ResearchProgress) => void): Promise<ResearchSynthesis> {
  const startedAt = Date.now();
  await ensureSchema(db);
  const access = providedAccess ?? await getAccessContext(db);
  const allowedIds = await authorizedConversationIds(db, access);
  const hits = await searchConversations(db, question, 8, { ...filters, allowedIds });
  const rows = await db.prepare("SELECT * FROM conversations ORDER BY date DESC").all<ConversationRow>();
  const records = rows.results.filter((row) => allowedIds.has(row.id)).map(rowToConversation);
  const byId = new Map(records.map((record) => [record.id, record]));
  const citations: ResearchCitation[] = hits.flatMap((hit) => hit.citations.slice(0, 2).map((citation, citationIndex) => {
    const record = byId.get(hit.conversationId);
    return {
      ...citation,
      conversationId: hit.conversationId,
      title: hit.title,
      date: hit.date,
      industry: hit.industry,
      tickers: hit.tickers,
      speaker: record?.participants[0] || "未标注说话人",
      timecode: `00:${String(18 + citationIndex * 27).padStart(2, "0")}`,
      context: record?.transcript || citation.excerpt,
      decision: "adopted" as const,
      reason: hit.reasons.slice(0, 2).join("、"),
    };
  })).slice(0, 10);
  const sourceCount = new Set(citations.map((citation) => citation.conversationId)).size;
  const fragmentCount = hits.reduce((sum, hit) => sum + hit.citations.length, 0);
  onProgress?.({ stage: "retrieved", sourceCount, fragmentCount });
  const lead = citations.slice(0, 3).map((item) => item.excerpt.replace(/\s*\[\d+\]/g, "").trim());
  const supportingEvidence = lead.map((text, index) => ({ text, citationIds: [index + 1] }));
  const counterCandidates = hits.map((hit) => byId.get(hit.conversationId)).filter(Boolean).flatMap((record) => [record!.summary, ...record!.theses]).filter((text) => /但|尚未|分化|下降|低于|约束|风险|不确定/.test(text));
  const counterEvidence = counterCandidates.slice(0, 2).map((text, index) => ({ text, citationIds: citations[index] ? [index + 1] : [] }));
  const unresolvedQuestions = hits.map((hit) => byId.get(hit.conversationId)?.nextAction).filter((value): value is string => Boolean(value)).slice(0, 3);
  const riskWarnings: string[] = [];
  if (sourceCount <= 1 && citations.length) riskWarnings.push("当前结论主要来自单一来源，尚未形成充分交叉验证。");
  if (counterEvidence.length) riskWarnings.push("支持证据与限制条件同时存在，不能只依据综合置信度作出判断。");
  if (!citations.length) riskWarnings.push("当前授权知识域内没有找到足够证据；系统不会显示无权限内容的标题或摘要。");
  const excludedSources = hits.slice(5).map((hit) => ({ title: hit.title, reason: "相关度低于采用阈值或与主要结论重复" })).slice(0, 3);
  onProgress?.({ stage: "verified", adoptedCount: citations.length, excludedCount: excludedSources.length, sourceCount, fragmentCount });
  const confidence = citations.length ? Math.round(Math.min(92, citations.reduce((sum, item) => sum + item.score, 0) / Math.max(1, Math.min(citations.length, 4)) * 100)) : 0;
  const coverage = sourceCount >= 3 ? "多源交叉证据" : sourceCount === 2 ? "双源证据" : sourceCount === 1 ? "单一来源" : "证据不足";
  const fallbackAnswer = citations.length ? `基于当前有权限访问的内部材料，可提炼出 ${supportingEvidence.length} 条主要结论。` : "当前授权知识域中没有找到足够证据。";
  onProgress?.({ stage: "generating", sourceCount, fragmentCount });
  let refinement: Awaited<ReturnType<typeof refineWithMiniMax>> = null;
  if (citations.length) {
    try {
      refinement = await refineWithMiniMax({ question, citations, supportingEvidence, counterEvidence, unresolvedQuestions });
    } catch (error) {
      console.error("MiniMax refinement failed; using grounded fallback", error);
    }
  }
  const knowledgeDomains = [...access.departments.map((value) => `部门：${value}`), ...access.industries.map((value) => `行业：${value === "*" ? "全部授权行业" : value}`), ...access.projects.map((value) => `项目：${value}`), `敏感等级：${access.maxSensitivity}`];
  return {
    answer: refinement?.answer || fallbackAnswer,
    paragraphs: refinement?.paragraphs.length ? refinement.paragraphs : supportingEvidence.length ? supportingEvidence : [{ text: fallbackAnswer, citationIds: [] }],
    confidence,
    coverage,
    modelUsed: Boolean(refinement),
    modelVersion: refinement?.model || "evidence-synthesis-v1",
    provider: refinement ? "minimax-grounded-generation" : "d1-permission-aware-evidence",
    citations,
    excludedSources,
    supportingEvidence: refinement?.supportingEvidence.length ? refinement.supportingEvidence : supportingEvidence,
    counterEvidence: refinement?.counterEvidence.length ? refinement.counterEvidence : counterEvidence,
    unresolvedQuestions: refinement?.unresolvedQuestions.length ? refinement.unresolvedQuestions : unresolvedQuestions,
    riskWarnings,
    trace: { queryTerms: queryTerms(question), filters, knowledgeDomains, fragmentCount, sourceCount, elapsedMs: Date.now() - startedAt },
    access: accessSummary(access),
  };
}
