import type { Conversation } from "./knowledge-data";

export type ClaimType = "financial_fact" | "management_guidance" | "management_view" | "research_inference";

export type EarningsCallSource = { id: string; conversationId: string; filename: string; mediaType: "text/html"; publisher: string; publishedAt: string; eventAt: string; sourceUrl: string; objectKey: string; sha256: string; parserVersion: string; language: string; segmentCount: number; claimCount: number };
export type TranscriptSegment = { id: string; conversationId: string; sourceDocumentId: string; section: "presentation" | "qna"; ordinal: number; speaker: string; role: string; content: string; anchor: string };
export type KnowledgeClaim = { id: string; conversationId: string; sourceDocumentId: string; segmentId: string; type: ClaimType; subject: string; statement: string; metricKey?: string; valueText?: string; numericValue?: number; unit?: string; period?: string; evidenceExcerpt: string; evidenceAnchor: string; confidence: number; verificationStatus: "reported" | "guidance" | "needs_review" };
export type CompanyEntity = { id: string; canonicalName: string; displayName: string; tickers: string[]; aliases: string[] };
export type ParsedEarningsCall = { record: Conversation; source: EarningsCallSource; segments: TranscriptSegment[]; claims: KnowledgeClaim[]; companyParticipants: string[]; conferenceParticipants: string[]; entity: CompanyEntity };

type ClaimRule = Omit<KnowledgeClaim, "id" | "conversationId" | "sourceDocumentId" | "segmentId" | "subject" | "evidenceExcerpt" | "evidenceAnchor" | "confidence" | "verificationStatus"> & { suffix: string; pattern: RegExp };
type CompanyProfile = { matches: RegExp; entity: CompanyEntity; conversationId: string; title: string; publishedAt: string; eventAt: string; publisher: string; sourceUrl: string; language: string; industry: string; tags: string[]; summary: string; nextAction: string; dueDate: string; defaultParticipants: string[]; claims: ClaimRule[] };

const PARSER_VERSION = "earnings-call-html-v2";

const profiles: CompanyProfile[] = [
  {
    matches: /Alibaba Group|BABA(?:\.N)?|9988\.HK|阿里巴巴/i,
    entity: { id: "entity:alibaba-group", canonicalName: "Alibaba Group Holding Limited", displayName: "阿里巴巴", tickers: ["BABA.N", "9988.HK"], aliases: ["阿里巴巴", "Alibaba", "Alibaba Group", "BABA", "BABA.N", "9988.HK"] },
    conversationId: "baba-fy2027-q1-earnings-call", title: "阿里巴巴 2027 财年第一季度业绩交流会", publishedAt: "2026-08-20", eventAt: "2026-08-20T07:30:00-04:00", publisher: "Seeking Alpha transcript", sourceUrl: "https://seekingalpha.com/symbol/BABA", language: "en", industry: "互联网与云计算", tags: ["2027财年一季报", "AI云计算", "电商", "资本开支", "MaaS"],
    summary: "阿里巴巴披露 2027 财年第一季度集团收入同比增长 9% 至人民币 2,690 亿元，云业务外部收入同比增长 45%；集团经调整 EBITDA 同比下降 30%，资本开支为人民币 677 亿元，自由现金流净流出人民币 447 亿元。管理层继续将 AI 与云计算列为增长重点。", nextAction: "在下一季度业绩公告中核对云外部收入增速、AI 相关产品收入、MaaS ARR、资本开支及自由现金流。", dueDate: "2026-11-30", defaultParticipants: ["Yongming Wu", "Toby Xu", "Lydia Lu"],
    claims: [
      { suffix: "revenue", type: "financial_fact", statement: "集团收入同比增长 9% 至人民币 2,690 亿元", pattern: /Total revenue increased 9% year-over-year to RMB 269 billion/i, metricKey: "group_revenue", valueText: "RMB 269 billion", numericValue: 2690, unit: "亿元人民币", period: "FY2027 Q1" },
      { suffix: "cloud-growth", type: "financial_fact", statement: "阿里云外部收入同比增长 45%", pattern: /external revenue grew 45%|external revenue growth accelerated to 45%/i, metricKey: "cloud_external_revenue_yoy", valueText: "+45%", numericValue: 45, unit: "%", period: "FY2027 Q1" },
      { suffix: "adjusted-ebitda", type: "financial_fact", statement: "集团经调整 EBITDA 同比下降 30% 至人民币 273 亿元", pattern: /Total adjusted EBITDA decreased 30% to RMB 27\.3 billion/i, metricKey: "adjusted_ebitda", valueText: "RMB 27.3 billion", numericValue: 273, unit: "亿元人民币", period: "FY2027 Q1" },
      { suffix: "capex", type: "financial_fact", statement: "本季度资本开支为人民币 677 亿元", pattern: /CapEx was RMB 67\.7 billion/i, metricKey: "capex", valueText: "RMB 67.7 billion", numericValue: 677, unit: "亿元人民币", period: "FY2027 Q1" },
      { suffix: "free-cash-flow", type: "financial_fact", statement: "自由现金流净流出人民币 447 亿元", pattern: /Free cash flow was an outflow of RMB 44\.7 billion/i, metricKey: "free_cash_flow", valueText: "RMB -44.7 billion", numericValue: -447, unit: "亿元人民币", period: "FY2027 Q1" },
      { suffix: "ai-product-revenue", type: "financial_fact", statement: "AI 相关产品季度收入为人民币 124 亿元，占云外部收入的 35%", pattern: /AI-related product revenue was RMB 12\.4 billion|AI-related products generated RMB 12\.4 billion/i, metricKey: "ai_product_revenue", valueText: "RMB 12.4 billion / 35% of external cloud revenue", numericValue: 124, unit: "亿元人民币", period: "FY2027 Q1" },
      { suffix: "maas-arr", type: "financial_fact", statement: "截至 2026 年 8 月，MaaS ARR 已超过人民币 160 亿元", pattern: /ARR of our MaaS business has now surpassed RMB 16 billion|ARR of our model and application services[^.]*RMB 16 billion/i, metricKey: "maas_arr", valueText: "> RMB 16 billion", numericValue: 160, unit: "亿元人民币", period: "2026-08" },
      { suffix: "cloud-guidance", type: "management_guidance", statement: "管理层预计云收入未来数季继续加速", pattern: /expect revenue growth to continue accelerating over the coming quarters/i, period: "未来数季" },
      { suffix: "ai-growth-engine", type: "management_view", statement: "管理层将 AI 视为阿里巴巴当前最确定的增长引擎", pattern: /AI has become Alibaba's most certain growth engine/i, period: "长期" },
    ],
  },
  {
    matches: /NVIDIA|NVDA(?:\.O)?|英伟达/i,
    entity: { id: "entity:nvidia", canonicalName: "NVIDIA Corporation", displayName: "英伟达", tickers: ["NVDA.O"], aliases: ["英伟达", "NVIDIA", "NVIDIA Corporation", "NVDA", "NVDA.O"] },
    conversationId: "nvda-fy2027-q2-earnings-call", title: "英伟达 2027 财年第二季度业绩交流会", publishedAt: "2026-08-26", eventAt: "2026-08-26T17:00:00-04:00", publisher: "Seeking Alpha transcript", sourceUrl: "https://seekingalpha.com/symbol/NVDA", language: "en", industry: "半导体与AI基础设施", tags: ["2027财年二季报", "AI算力", "数据中心", "Vera Rubin", "业绩指引"],
    summary: "英伟达披露 2027 财年第二季度收入 960 亿美元，数据中心收入 890 亿美元、环比增长 18%，GAAP 与非 GAAP 毛利率均为 75%。公司指引第三季度收入 1,080 亿美元（上下浮动 2%），并预计 2028 财年收入增长约 70%，但供应约束仍将持续。", nextAction: "跟踪第三季度收入与毛利率指引兑现、Vera Rubin 放量、供应约束及中国数据中心收入变化。", dueDate: "2026-11-17", defaultParticipants: ["Toshiya Hari", "Colette Kress", "Jen-Hsun Huang"],
    claims: [
      { suffix: "revenue", type: "financial_fact", statement: "第二季度总收入为 960 亿美元，同比增幅超过一倍", pattern: /Total revenue of \$96 billion more than doubled year-over-year/i, metricKey: "group_revenue", valueText: "$96 billion", numericValue: 96, unit: "十亿美元", period: "FY2027 Q2" },
      { suffix: "data-center", type: "financial_fact", statement: "数据中心收入为 890 亿美元，环比增长 18%", pattern: /data center revenue increased 18% quarter-over-quarter to \$89 billion/i, metricKey: "data_center_revenue", valueText: "$89 billion / +18% QoQ", numericValue: 89, unit: "十亿美元", period: "FY2027 Q2" },
      { suffix: "gross-margin", type: "financial_fact", statement: "GAAP 与非 GAAP 毛利率均为 75%", pattern: /GAAP and non-GAAP gross margins were both 75%/i, metricKey: "gross_margin", valueText: "75%", numericValue: 75, unit: "%", period: "FY2027 Q2" },
      { suffix: "q3-revenue", type: "management_guidance", statement: "第三季度收入指引为 1,080 亿美元，上下浮动 2%", pattern: /Total revenue is expected to be \$108 billion, plus or minus 2%/i, metricKey: "revenue_guidance", valueText: "$108 billion ±2%", numericValue: 108, unit: "十亿美元", period: "FY2027 Q3" },
      { suffix: "q3-margin", type: "management_guidance", statement: "第三季度 GAAP 与非 GAAP 毛利率指引为 74%，上下浮动 50 个基点", pattern: /For Q3, we expect GAAP and non-GAAP gross margins to be 74% plus or minus 50 basis points/i, metricKey: "gross_margin_guidance", valueText: "74% ±50bp", numericValue: 74, unit: "%", period: "FY2027 Q3" },
      { suffix: "fy28-growth", type: "management_guidance", statement: "管理层初步预计 2028 财年收入同比增长约 70%", pattern: /fiscal year '28 revenue to grow approximately 70% year-over-year/i, metricKey: "revenue_growth_guidance", valueText: "+70%", numericValue: 70, unit: "%", period: "FY2028" },
      { suffix: "supply", type: "management_guidance", statement: "管理层预计供应至少到 2028 财年末仍是增长瓶颈", pattern: /supply to remain a bottleneck, at least through the end of fiscal year '28/i, period: "FY2028" },
      { suffix: "china", type: "management_view", statement: "公司前瞻展望未计入中国数据中心计算收入", pattern: /no China data center compute revenue in our forward outlook/i, period: "前瞻展望" },
    ],
  },
  {
    matches: /厦门钨业|600549(?:\.SH)?/i,
    entity: { id: "entity:xiamen-tungsten", canonicalName: "厦门钨业股份有限公司", displayName: "厦门钨业", tickers: ["600549.SH"], aliases: ["厦门钨业", "厦门钨业股份有限公司", "600549", "600549.SH"] },
    conversationId: "600549-2026-h1-results-briefing", title: "厦门钨业 2026 年半年度业绩说明会", publishedAt: "2026-08-28", eventAt: "2026-08-28T00:00:00+08:00", publisher: "用户提供的会议纪要", sourceUrl: "", language: "zh-CN", industry: "有色金属与新能源材料", tags: ["2026年中报", "钨钼", "稀土", "能源新材料", "现金流"],
    summary: "厦门钨业披露 2026 年上半年营业收入 350.14 亿元、同比增长 82%，归母净利润 22.01 亿元、同比增长 127%。钨钼业务是主要利润来源；受原材料价格上涨及产销扩张影响，经营活动现金净流出 24.63 亿元。", nextAction: "核对下半年钨价与产品售价联动、经营现金流改善、重点扩产项目投产及三大主业利润贡献。", dueDate: "2027-03-31", defaultParticipants: ["公司管理层", "厦门钨业发言人", "公司代表"],
    claims: [
      { suffix: "revenue", type: "financial_fact", statement: "上半年营业收入 350.14 亿元，同比增长 82%", pattern: /实现营业收入350\.14亿元，同比增长82%/, metricKey: "group_revenue", valueText: "350.14亿元 / +82%", numericValue: 350.14, unit: "亿元人民币", period: "2026H1" },
      { suffix: "net-profit", type: "financial_fact", statement: "上半年归母净利润 22.01 亿元，同比增长 127%", pattern: /归属于上市公司股东的净利润22\.01亿元，同比增长127%/, metricKey: "net_profit_attributable", valueText: "22.01亿元 / +127%", numericValue: 22.01, unit: "亿元人民币", period: "2026H1" },
      { suffix: "operating-cash-flow", type: "financial_fact", statement: "上半年经营活动现金净流出 24.63 亿元", pattern: /经营活动现金净流出24\.63亿元/, metricKey: "operating_cash_flow", valueText: "-24.63亿元", numericValue: -24.63, unit: "亿元人民币", period: "2026H1" },
      { suffix: "tungsten-revenue", type: "financial_fact", statement: "钨业务收入 161.5 亿元，占合并收入 46.12%", pattern: /钨业务：\s*实现营业收入161\.5亿元，占合并总营收比重为46\.12%/, metricKey: "tungsten_revenue", valueText: "161.5亿元 / 46.12%", numericValue: 161.5, unit: "亿元人民币", period: "2026H1" },
      { suffix: "tungsten-profit", type: "financial_fact", statement: "钨业务利润总额 32.96 亿元，占合并利润总额 82.99%", pattern: /实现利润总额32\.96亿元，占合并利润总额比重为82\.99%/, metricKey: "tungsten_profit", valueText: "32.96亿元 / 82.99%", numericValue: 32.96, unit: "亿元人民币", period: "2026H1" },
      { suffix: "battery-materials", type: "financial_fact", statement: "电池材料业务收入 144.88 亿元，同比增长 91%", pattern: /电池材料业务实现营业收入144\.88亿元，同比增长91%/, metricKey: "battery_materials_revenue", valueText: "144.88亿元 / +91%", numericValue: 144.88, unit: "亿元人民币", period: "2026H1" },
      { suffix: "debt-ratio", type: "financial_fact", statement: "2026 年 6 月末资产负债率为 59.17%", pattern: /资产负债率为59\.17%/, metricKey: "debt_ratio", valueText: "59.17%", numericValue: 59.17, unit: "%", period: "2026-06" },
      { suffix: "dividend", type: "management_guidance", statement: "公司拟派发 2026 年半年度现金股利合计 6.67 亿元", pattern: /本次合计派发现金股利（含税）6\.67亿元/, metricKey: "cash_dividend", valueText: "6.67亿元", numericValue: 6.67, unit: "亿元人民币", period: "2026H1" },
      { suffix: "pricing", type: "management_view", statement: "管理层通过产品售价与原材料价格联动应对原料价格波动", pattern: /推动产品价格与原材料价格联动上调/, period: "2026H1" },
    ],
  },
  {
    matches: /MINIMAX|MiniMax|0100(?:\.HK)?/i,
    entity: { id: "entity:minimax", canonicalName: "MiniMax", displayName: "MiniMax", tickers: ["0100.HK"], aliases: ["MiniMax", "MINIMAX", "MINIMAX-WP", "minmax", "0100", "0100.HK"] },
    conversationId: "0100-2026-h1-earnings-call", title: "MiniMax 2026 年中期业绩交流会", publishedAt: "2026-08-28", eventAt: "2026-08-28T00:00:00+08:00", publisher: "用户提供的会议纪要", sourceUrl: "", language: "zh-CN", industry: "人工智能与大模型", tags: ["2026年中报", "大模型", "ARR", "多模态", "推理效率"],
    summary: "MiniMax 披露 2026 年上半年收入约 1.2 亿美元、同比增长 283%，毛利率提升至 17.9%；截至 8 月 ARR 已突破 8 亿美元，其中 To B 占比超过 80%。公司仍处于高研发投入和亏损阶段，但现金储备超过 30 亿美元。", nextAction: "跟踪 ARR 向确认收入转化、毛利率改善、文本与多模态业务结构、现金消耗及新模型发布节奏。", dueDate: "2027-03-31", defaultParticipants: ["严俊杰", "薛子昭", "MiniMax 管理层"],
    claims: [
      { suffix: "revenue", type: "financial_fact", statement: "上半年营业收入约 1.2 亿美元，同比增长 283%", pattern: /集团实现营业收入约1\.2亿美元，同比增长283%/, metricKey: "group_revenue", valueText: "$120 million / +283%", numericValue: 120, unit: "百万美元", period: "2026H1" },
      { suffix: "platform-revenue", type: "financial_fact", statement: "开放平台及其他 AI 企业服务收入约 7,400 万美元，同比增长 703%", pattern: /开放平台及其他AI企业服务收入约7400万美元，同比增长703%/, metricKey: "enterprise_ai_revenue", valueText: "$74 million / +703%", numericValue: 74, unit: "百万美元", period: "2026H1" },
      { suffix: "native-product-revenue", type: "financial_fact", statement: "AI 原生产品收入约 4,300 万美元，同比增长 101%", pattern: /AI原生产品收入约4300万美元，同比增长101%/, metricKey: "ai_native_product_revenue", valueText: "$43 million / +101%", numericValue: 43, unit: "百万美元", period: "2026H1" },
      { suffix: "gross-margin", type: "financial_fact", statement: "上半年毛利约 2,100 万美元，毛利率为 17.9%", pattern: /公司毛利约2100万美元，同比增长465%；毛利率从上年同期的12\.1%提升5\.8个百分点至17\.9%/, metricKey: "gross_margin", valueText: "$21 million / 17.9%", numericValue: 17.9, unit: "%", period: "2026H1" },
      { suffix: "net-loss", type: "financial_fact", statement: "IFRS 口径上半年净亏损约 3.6 亿美元", pattern: /IFRS会计口径上半年净亏损从上年同期的约4亿美元收窄11%至约3\.6亿美元/, metricKey: "net_loss", valueText: "$360 million loss", numericValue: -360, unit: "百万美元", period: "2026H1" },
      { suffix: "arr", type: "financial_fact", statement: "截至 2026 年 8 月 ARR 已突破 8 亿美元，To B 占比超过 80%", pattern: /截至2026年8月公司年度经常性收入（ARR）已突破8亿美元，其中To B业务占ARR比重已超过80%/, metricKey: "arr", valueText: "> $800 million / To B >80%", numericValue: 800, unit: "百万美元", period: "2026-08" },
      { suffix: "cash", type: "financial_fact", statement: "公司现金储备已超过 30 亿美元", pattern: /目前公司现金储备已超30亿美元/, metricKey: "cash_reserves", valueText: "> $3 billion", numericValue: 3000, unit: "百万美元", period: "2026-08" },
      { suffix: "token", type: "financial_fact", statement: "7 月模型 Token 消耗量较 1 月增长约 20 倍", pattern: /7月模型Token消耗量较今年1月增长约20倍/, metricKey: "token_consumption_growth", valueText: "约20倍", numericValue: 20, unit: "倍", period: "2026-07 vs 2026-01" },
      { suffix: "margin-guidance", type: "management_guidance", statement: "管理层预计下半年毛利率维持改善趋势，明年有望进一步提升", pattern: /今年下半年毛利率将维持改善趋势，明年有望进一步提升/, period: "2026H2-2027" },
      { suffix: "strategy", type: "management_view", statement: "管理层将提升智能水平并降低单位算力成本作为核心技术路线", pattern: /在持续提升智能水平的同时，最大化单位算力产出的智能，实现极致性价比/, period: "长期" },
    ],
  },
];

function decodeEntities(value: string) {
  const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—" };
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity: string) => {
    if (entity.toLowerCase().startsWith("#x")) return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
    if (entity.startsWith("#")) return String.fromCodePoint(Number.parseInt(entity.slice(1), 10));
    return named[entity.toLowerCase()] ?? match;
  });
}

function cleanText(value: string) {
  return decodeEntities(value.replace(/<br\s*\/?\s*>/gi, "\n").replace(/<[^>]+>/g, " ")).replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();
}

function extractParticipants(html: string, className: string) {
  const block = html.match(new RegExp(`<div class="${className}">([\\s\\S]*?)<\\/div>`, "i"))?.[1] ?? "";
  return Array.from(block.matchAll(/<span>([\s\S]*?)<\/span>/gi), (match) => cleanText(match[1])).filter(Boolean);
}

function extractSegments(html: string, conversationId: string, sourceDocumentId: string) {
  const segments: Array<TranscriptSegment & { paragraphs: string[] }> = [];
  const pattern = /<div class="transcript-(presentation|qna)-section[^"]*"[^>]*seq="(\d+)"[^>]*>([\s\S]*?)<\/div>/gi;
  for (const match of html.matchAll(pattern)) {
    const section = match[1] === "presentation" ? "presentation" : "qna";
    const ordinal = Number(match[2]);
    const body = match[3];
    const speaker = cleanText(body.match(/<strong>([\s\S]*?)<\/strong>/i)?.[1] ?? "Unknown speaker");
    const role = cleanText(body.match(/<i>([\s\S]*?)<\/i>/i)?.[1] ?? "");
    const prefix = `${speaker}${role ? ` ${role}` : ""}`;
    const paragraphs = Array.from(body.matchAll(/<p(?:\s[^>]*)?>([\s\S]*?)<\/p>/gi), (item) => cleanText(item[1])).map((item) => item.startsWith(prefix) ? item.slice(prefix.length).trim() : item).filter(Boolean);
    const anchor = `${section}-seq-${ordinal}`;
    segments.push({ id: `${conversationId}:segment:${section}:${ordinal}`, conversationId, sourceDocumentId, section, ordinal, speaker, role, content: paragraphs.join("\n\n"), anchor, paragraphs });
  }
  return segments;
}

function excerptFor(segment: { paragraphs: string[]; content: string }, pattern: RegExp) {
  const paragraph = segment.paragraphs.find((item) => pattern.test(item)) ?? segment.content;
  return paragraph.length > 420 ? `${paragraph.slice(0, 417)}…` : paragraph;
}

export function parseEarningsCallHtml(html: string, filename = "earnings-call.html"): ParsedEarningsCall {
  const headline = cleanText(html.match(/<div class="transcript-headline">([\s\S]*?)<\/div>/i)?.[1] ?? "");
  if (!headline || !/earnings call|业绩(?:交流|说明)会/i.test(headline)) throw new Error("未识别到业绩交流会标题，请确认文件为受支持的 HTML 逐字稿。");
  const profile = profiles.find((item) => item.matches.test(`${headline} ${filename}`));
  if (!profile) throw new Error(`未配置该公司的业绩交流会解析规则：${headline}`);

  const sourceDocumentId = `source:${profile.conversationId}`;
  const companyParticipants = extractParticipants(html, "transcript-company-participants");
  const conferenceParticipants = extractParticipants(html, "transcript-other-participants");
  const extracted = extractSegments(html, profile.conversationId, sourceDocumentId);
  if (!extracted.length) throw new Error("逐字稿中没有找到可解析的发言段落。");
  const segments: TranscriptSegment[] = extracted.map((segment) => ({
    id: segment.id,
    conversationId: segment.conversationId,
    sourceDocumentId: segment.sourceDocumentId,
    section: segment.section,
    ordinal: segment.ordinal,
    speaker: segment.speaker,
    role: segment.role,
    content: segment.content,
    anchor: segment.anchor,
  }));
  const claims = profile.claims.map((rule): KnowledgeClaim => {
    const segment = extracted.find((item) => rule.pattern.test(item.content));
    if (!segment) throw new Error(`未找到声明“${rule.statement}”对应的原文证据。`);
    return { id: `${profile.conversationId}:claim:${rule.suffix}`, conversationId: profile.conversationId, sourceDocumentId, segmentId: segment.id, type: rule.type, subject: profile.entity.canonicalName, statement: rule.statement, metricKey: rule.metricKey, valueText: rule.valueText, numericValue: rule.numericValue, unit: rule.unit, period: rule.period, evidenceExcerpt: excerptFor(segment, rule.pattern), evidenceAnchor: segment.anchor, confidence: rule.type === "financial_fact" ? 96 : rule.type === "management_guidance" ? 82 : 76, verificationStatus: rule.type === "financial_fact" ? "reported" : rule.type === "management_guidance" ? "guidance" : "needs_review" };
  });
  const transcript = segments.filter((segment) => segment.content).map((segment) => `[${segment.section === "presentation" ? "Presentation" : "Q&A"} · ${segment.speaker}${segment.role ? ` · ${segment.role}` : ""}]\n${segment.content}`).join("\n\n");
  const source: EarningsCallSource = { id: sourceDocumentId, conversationId: profile.conversationId, filename, mediaType: "text/html", publisher: profile.publisher, publishedAt: profile.publishedAt, eventAt: profile.eventAt, sourceUrl: profile.sourceUrl, objectKey: "", sha256: "", parserVersion: PARSER_VERSION, language: profile.language, segmentCount: segments.length, claimCount: claims.length };
  const record: Conversation = {
    id: profile.conversationId, title: profile.title, date: profile.publishedAt, location: "线上电话会", scene: profile.title.includes("说明会") ? "业绩说明会" : "业绩交流会", owner: "待指定", participants: companyParticipants.length ? companyParticipants : profile.defaultParticipants, industry: profile.industry, tickers: [profile.entity.displayName, ...profile.entity.tickers], tags: profile.tags, summary: profile.summary,
    theses: claims.filter((item) => item.type === "management_guidance" || item.type === "management_view").map((item) => item.statement), confidence: profile.publisher === "Seeking Alpha transcript" ? 86 : 82, sourceReliability: profile.publisher === "Seeking Alpha transcript" ? 95 : 82, status: "已复核", sensitivity: "内部", transcript, evidence: claims.slice(0, 6).map((item) => `${item.evidenceAnchor} · ${item.statement}`), nextAction: profile.nextAction, dueDate: profile.dueDate, validUntil: profile.dueDate, nextReviewAt: profile.dueDate, version: 1, department: "投研部", projectGroup: "二级市场", source, claims, segments,
  };
  return { record, source, segments, claims, companyParticipants, conferenceParticipants, entity: profile.entity };
}
