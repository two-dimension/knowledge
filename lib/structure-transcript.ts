export type StructureSuggestion = {
  mode: "rules";
  title: string;
  industry: string;
  tickers: string[];
  participant: string;
  location: string;
  scene: string;
  summary: string;
  theses: string[];
  evidence: string[];
  tags: string[];
  confidence: number;
  nextAction: string;
  statements: StructuredStatement[];
  risks: string[];
  timeHorizon: string;
};

export type StatementType = "事实" | "观察" | "观点" | "预测" | "风险";

export type StructuredStatement = {
  type: StatementType;
  content: string;
  evidence: string;
};

const domains = [
  { industry: "互联网与云计算", keywords: ["阿里巴巴", "Alibaba", "BABA", "云", "AI", "MaaS", "电商", "即时零售", "资本开支"], companies: ["阿里巴巴", "BABA.N"] },
] as const;

const cities = ["北京", "上海", "深圳", "广州", "杭州", "苏州", "长沙", "南京", "成都", "武汉", "香港"];
const scenes = ["业绩交流会", "业绩会", "电话会", "公司调研", "专家交流", "电话访谈", "线下交流"];
const thesisWords = /预计|判断|可能|有望|趋势|增长|下降|提升|上升|减少|瓶颈|核心|将会|将从|意味着|我们认为|看好|拐点|订单|放量|份额/;
const forecastWords = /预计|可能|有望|将会|将从|未来|明年|下半年|上半年|季度|年底|同比|环比/;
const opinionWords = /判断|认为|看好|核心|意味着|趋势|拐点|逻辑|定价|估值/;
const riskWords = /风险|不及预期|低于|放缓|下降|减少|瓶颈|约束|压力|困难|扰动|尚未|未能|不确定/;
const factWords = /已经|数据显示|公告|签署|完成|发生|截至|达到|同比增长|同比下降|环比增长|环比下降/;

function classifyStatement(value: string): StatementType {
  if (riskWords.test(value)) return "风险";
  if (forecastWords.test(value)) return "预测";
  if (opinionWords.test(value)) return "观点";
  if (factWords.test(value) || /\d+(?:\.\d+)?%|\d+亿元|\d+个季度/.test(value)) return "事实";
  return "观察";
}

function detectTimeHorizon(text: string) {
  const match = text.match(/(?:20\d{2}(?:年|H[12]|Q[1-4])?|今年|明年|本季度|下季度|上半年|下半年|年底|未来[一二三四五六七八九十\d]+(?:个月|季度|年))/);
  return match?.[0] ?? "待研究员确认";
}

function normalize(text: string) {
  return text.replace(/\r/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

function sentences(text: string) {
  return text.split(/(?<=[。！？!?；;])|\n+/).map((item) => item.replace(/^[\s\-•\d.、]+/, "").trim()).filter((item) => item.length >= 8);
}

function detectParticipant(text: string) {
  const labeled = text.match(/(?:专家|嘉宾|发言人|信息源|受访者|对方|人物)[：:]\s*([^\n，。；;]{2,24})/);
  if (labeled) return labeled[1].trim();
  if (/采购/.test(text)) return "产业链采购人士";
  if (/销售/.test(text)) return "产业链销售人士";
  if (/经销商|加盟商/.test(text)) return "渠道从业者";
  if (/高管|管理层/.test(text)) return "公司管理层人士";
  return "待确认信息源";
}

export function structureTranscript(input: string): StructureSuggestion {
  const text = normalize(input);
  const items = sentences(text);
  const scored = domains.map((domain) => ({ ...domain, score: domain.keywords.reduce((sum, word) => sum + (text.toLowerCase().includes(word.toLowerCase()) ? 1 : 0), 0) })).sort((a, b) => b.score - a.score);
  const domain = scored[0];
  const industry = domain.score ? domain.industry : "待分类";
  const tickers = domains.flatMap((item) => item.companies).filter((company) => text.includes(company));
  const location = cities.find((city) => text.includes(city)) ?? "待确认";
  const sceneMatch = scenes.find((scene) => text.includes(scene));
  const scene = sceneMatch === "业绩会" || sceneMatch === "电话会" ? "业绩交流会" : sceneMatch ?? "线下交流";
  const theses = items.filter((item) => thesisWords.test(item)).map((item) => item.replace(/[。；;]$/, "")).slice(0, 3);
  const fallback = items.slice(0, 3).map((item) => item.replace(/[。；;]$/, ""));
  const finalTheses = theses.length ? theses : fallback.length ? fallback : ["待研究员确认：原文中尚未识别出明确的可验证判断"];
  const statements = items.slice(0, 8).map((item) => ({
    type: classifyStatement(item),
    content: item.replace(/[。；;]$/, ""),
    evidence: item,
  }));
  const risks = statements.filter((item) => item.type === "风险").map((item) => item.content).slice(0, 3);
  const summarySource = items.slice(0, 3).join("");
  const summary = summarySource.length > 180 ? `${summarySource.slice(0, 178)}…` : summarySource || "文本内容不足，建议补充更多上下文。";
  const leading = finalTheses[0].replace(/[“”"']/g, "").slice(0, 28);
  const title = `${industry === "待分类" ? "投研谈话" : industry}：${leading}${finalTheses[0].length > 28 ? "…" : ""}`;
  const tags = [industry, ...["AI", "云计算", "MaaS", "电商", "即时零售", "资本开支", "自由现金流"].filter((tag) => text.includes(tag))].filter((tag) => tag !== "待分类");
  return {
    mode: "rules",
    title,
    industry,
    tickers: Array.from(new Set(tickers)),
    participant: detectParticipant(text),
    location,
    scene,
    summary,
    theses: finalTheses,
    evidence: statements.filter((item) => finalTheses.some((thesis) => item.content.includes(thesis) || thesis.includes(item.content))).map((item) => `原话：${item.evidence}`).slice(0, 3).concat(items.length ? [] : ["原始谈话待复核"]),
    tags: Array.from(new Set(tags)),
    confidence: Math.min(72, 48 + domain.score * 4 + Math.min(tickers.length * 4, 8)),
    nextAction: tickers.length ? `核对${tickers.slice(0, 2).join("、")}后续业绩公告中的公开数据` : "补充可观测指标、反证条件和验证截止时间",
    statements,
    risks,
    timeHorizon: detectTimeHorizon(text),
  };
}
