import type { Conversation } from "./knowledge-data";

export type WikiPageType = "index" | "industry" | "company" | "research-note";

export type WikiPage = {
  id: string;
  slug: string;
  title: string;
  pageType: WikiPageType;
  summary: string;
  contentMd: string;
  backlinks: string[];
  sourceIds: string[];
  healthScore: number;
  version: number;
  generatedBy: "compiler" | "research-assistant";
  updatedAt: string;
};

export type WikiHealthIssue = {
  id: string;
  severity: "high" | "medium" | "low";
  type: "missing_evidence" | "low_confidence" | "missing_entity" | "overdue";
  title: string;
  detail: string;
  conversationId: string;
};

export type WikiSnapshot = {
  pages: WikiPage[];
  issues: WikiHealthIssue[];
  stats: { rawSources: number; pages: number; links: number; healthScore: number };
  compiledAt: string;
  persisted: boolean;
};

function slug(value: string) {
  return value.toLowerCase().replace(/\s+/g, "-").replace(/[^\p{L}\p{N}-]+/gu, "").replace(/-+/g, "-");
}

function pageId(type: string, value: string) {
  return `wiki-${type}-${slug(value) || "index"}`;
}

const companyDisplayNames: Record<string, string> = {
  "阿里巴巴": "阿里巴巴",
  "BABA": "阿里巴巴",
  "BABA.N": "阿里巴巴",
  "9988.HK": "阿里巴巴",
  "ALIBABA": "阿里巴巴",
  "ALIBABA GROUP": "阿里巴巴",
  "ALIBABA GROUP HOLDING LIMITED": "阿里巴巴",
  "英伟达": "英伟达",
  "NVIDIA": "英伟达",
  "NVIDIA CORPORATION": "英伟达",
  "NVDA": "英伟达",
  "NVDA.O": "英伟达",
  "厦门钨业": "厦门钨业",
  "厦门钨业股份有限公司": "厦门钨业",
  "600549": "厦门钨业",
  "600549.SH": "厦门钨业",
  "MINIMAX": "MiniMax",
  "MINIMAX-WP": "MiniMax",
  "MINMAX": "MiniMax",
  "0100": "MiniMax",
  "0100.HK": "MiniMax",
};

export function displayCompanyName(value: string) {
  const normalized = value.trim().toUpperCase();
  return companyDisplayNames[normalized] ?? value.trim();
}

function recordCompanies(record: Conversation) {
  return Array.from(new Set(record.tickers.map(displayCompanyName).filter(Boolean)));
}

function linkList(values: string[]) {
  return values.length ? values.map((value) => `[[${value}]]`).join(" · ") : "暂无";
}

function sourceLines(records: Conversation[]) {
  return records.map((record) => `- [[${record.title}]]｜${record.date}｜${record.participants[0] ?? "未标注信息源"}｜置信度 ${record.confidence}`).join("\n");
}

function thesisLines(records: Conversation[]) {
  return records.flatMap((record) => record.theses.map((thesis) => `- ${thesis} ^${record.id}`)).join("\n");
}

function healthScore(records: Conversation[]) {
  if (!records.length) return 0;
  const score = records.reduce((sum, record) => {
    const evidence = Math.min(15, record.evidence.length * 6);
    const entities = record.tickers.length ? 10 : 0;
    return sum + Math.min(100, record.confidence * .75 + evidence + entities);
  }, 0) / records.length;
  return Math.round(score);
}

export function auditWiki(records: Conversation[], now = new Date()): WikiHealthIssue[] {
  const today = now.toISOString().slice(0, 10);
  return records.flatMap((record) => {
    const issues: WikiHealthIssue[] = [];
    if (record.evidence.length < 2) issues.push({ id: `${record.id}-evidence`, severity: "high", type: "missing_evidence", title: record.title, detail: "证据少于 2 条，尚不足以形成稳定判断。", conversationId: record.id });
    if (record.confidence < 70) issues.push({ id: `${record.id}-confidence`, severity: "medium", type: "low_confidence", title: record.title, detail: `当前置信度 ${record.confidence}，建议补充交叉信息源。`, conversationId: record.id });
    if (!record.tickers.length) issues.push({ id: `${record.id}-entity`, severity: "low", type: "missing_entity", title: record.title, detail: "尚未绑定公司或证券实体。", conversationId: record.id });
    if (record.dueDate < today && !["已证实", "已证伪", "已归档"].includes(record.status)) issues.push({ id: `${record.id}-overdue`, severity: "high", type: "overdue", title: record.title, detail: `验证任务已于 ${record.dueDate} 到期。`, conversationId: record.id });
    return issues;
  });
}

export function compileWiki(records: Conversation[], persisted = false): WikiSnapshot {
  const compiledAt = new Date().toISOString();
  const industries = Array.from(new Set(records.map((record) => record.industry))).filter(Boolean).sort();
  const companies = Array.from(new Set(records.flatMap(recordCompanies))).filter(Boolean).sort();
  const pages: WikiPage[] = [];

  pages.push({
    id: "wiki-index", slug: "index", title: "砚知研究 Wiki", pageType: "index",
    summary: `由 ${records.length} 条原始谈话增量编译而成，覆盖 ${industries.length} 个行业与 ${companies.length} 个公司。`,
    contentMd: `# 砚知研究 Wiki\n\n> 这是由原始谈话自动编译的机构知识层；原始材料不会被覆盖。\n\n## 行业地图\n${industries.map((item) => `- [[${item}]]`).join("\n")}\n\n## 公司索引\n${companies.map((item) => `- [[${item}]]`).join("\n")}\n\n## 编译原则\n- 每条判断保留来源谈话与置信度\n- 新证据增量更新页面，不删除旧上下文\n- 研究问答可归档为独立笔记，再参与后续检索`,
    backlinks: [], sourceIds: records.map((record) => record.id), healthScore: healthScore(records), version: 1, generatedBy: "compiler", updatedAt: compiledAt,
  });

  for (const industry of industries) {
    const related = records.filter((record) => record.industry === industry);
    const relatedCompanies = Array.from(new Set(related.flatMap(recordCompanies)));
    pages.push({
      id: pageId("industry", industry), slug: `industry/${slug(industry)}`, title: industry, pageType: "industry",
      summary: related.map((record) => record.summary).slice(0, 2).join(" "),
      contentMd: `# ${industry}\n\n## 当前判断\n${thesisLines(related)}\n\n## 关联公司\n${linkList(relatedCompanies)}\n\n## 原始来源\n${sourceLines(related)}\n\n## 待验证\n${related.map((record) => `- ${record.nextAction}（截止 ${record.dueDate}）`).join("\n")}`,
      backlinks: ["砚知研究 Wiki", ...relatedCompanies], sourceIds: related.map((record) => record.id), healthScore: healthScore(related), version: 1, generatedBy: "compiler", updatedAt: compiledAt,
    });
  }

  for (const company of companies) {
    const related = records.filter((record) => recordCompanies(record).includes(company));
    const relatedIndustries = Array.from(new Set(related.map((record) => record.industry)));
    pages.push({
      id: pageId("company", company), slug: `company/${slug(company)}`, title: company, pageType: "company",
      summary: related.map((record) => record.summary).slice(0, 2).join(" "),
      contentMd: `# ${company}\n\n## 投资命题\n${thesisLines(related)}\n\n## 行业归属\n${linkList(relatedIndustries)}\n\n## 证据与来源\n${sourceLines(related)}\n\n## 下一步研究\n${related.map((record) => `- ${record.nextAction}`).join("\n")}`,
      backlinks: ["砚知研究 Wiki", ...relatedIndustries], sourceIds: related.map((record) => record.id), healthScore: healthScore(related), version: 1, generatedBy: "compiler", updatedAt: compiledAt,
    });
  }

  const issues = auditWiki(records);
  const links = pages.reduce((sum, page) => sum + page.backlinks.length, 0);
  return { pages, issues, stats: { rawSources: records.length, pages: pages.length, links, healthScore: healthScore(records) }, compiledAt, persisted };
}
