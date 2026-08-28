import type { EarningsCallSource, KnowledgeClaim, TranscriptSegment } from "./earnings-call";

export type ConversationStatus = "草稿" | "已复核" | "跟踪中" | "已证实" | "已证伪" | "已替代" | "已归档";

export type Conversation = {
  id: string;
  title: string;
  date: string;
  location: string;
  scene: string;
  owner: string;
  participants: string[];
  industry: string;
  tickers: string[];
  tags: string[];
  summary: string;
  theses: string[];
  confidence: number;
  sourceReliability: number;
  status: ConversationStatus;
  sensitivity: "内部" | "核心组";
  transcript: string;
  evidence: string[];
  nextAction: string;
  dueDate: string;
  validUntil: string;
  nextReviewAt: string;
  version: number;
  department: string;
  projectGroup: string;
  source?: EarningsCallSource;
  claims?: KnowledgeClaim[];
  segments?: TranscriptSegment[];
};

/**
 * 测试案例来源：仓库根目录
 * `阿里巴巴[BABA.N]2027财年第一季度业绩交流会.html`
 *
 * 以下内容仅从该文字记录提取，不补造访谈、人物或交叉验证来源。
 */
export const seedConversations: Conversation[] = [
  {
    id: "baba-fy2027-q1-earnings-call",
    title: "阿里巴巴 2027 财年第一季度业绩交流会",
    date: "2026-08-20",
    location: "线上电话会",
    scene: "业绩交流会",
    owner: "待指定",
    participants: [
      "Lydia Lu（投资者关系负责人）",
      "Yongming Wu / Eddie Wu（首席执行官）",
      "Toby Xu（首席财务官）",
    ],
    industry: "互联网与云计算",
    tickers: ["阿里巴巴", "BABA.N"],
    tags: ["2027财年一季报", "AI云计算", "电商", "资本开支", "MaaS"],
    summary: "阿里巴巴披露 2027 财年第一季度集团收入同比增长 9% 至人民币 2,690 亿元；云业务外部收入同比增长 45%，AI 相关产品收入连续第 12 个季度实现三位数增长；本季度资本开支为人民币 677 亿元。管理层预计云收入未来数季继续加速，但集团经调整 EBITDA 同比下降 30%。",
    theses: [
      "管理层将 AI 视为阿里巴巴当前最确定的增长引擎，并预计云收入未来数季继续加速",
      "AI 相关产品季度收入为人民币 124 亿元，占云业务外部收入的 35%，MaaS 年化经常性收入截至 2026 年 8 月已超过人民币 160 亿元",
      "高强度 AI 基础设施投入正在拉低自由现金流，但管理层认为服务器通常可在三年内实现盈亏平衡",
    ],
    confidence: 90,
    sourceReliability: 95,
    status: "已复核",
    sensitivity: "内部",
    transcript: "Yongming Wu: Over the past quarter, Alibaba's strategic AI investments have translated into robust results with a total group revenue growing 9% year-over-year. Alibaba Cloud's external revenue grew 45% and EBITDA increased 133% year-over-year. Revenue from AI-related products has maintained a triple-digit growth for the 12th consecutive quarter with annual revenue run rate surpassing RMB 49.5 billion.\n\nToby Xu: Total revenue increased 9% year-over-year to RMB 269 billion, driven by the strong momentum in cloud business and quick commerce. Total adjusted EBITDA decreased 30% to RMB 27.3 billion. CapEx was RMB 67.7 billion this quarter, reflecting our continued investments in AI infrastructure to meet strong and growing customer demand.\n\nManagement Q&A: AI-related products generated RMB 12.4 billion in revenue this quarter. The ARR of our MaaS business has now surpassed RMB 16 billion as of August. We expect revenue growth to continue accelerating over the coming quarters.",
    evidence: [
      "Yongming Wu 管理层陈述：集团收入、云外部收入及 AI 相关产品增长",
      "Toby Xu 财务陈述：收入、经调整 EBITDA、资本开支与自由现金流",
      "问答环节管理层陈述：MaaS ARR、云收入增速预期与 AI 投资回报",
    ],
    nextAction: "在下一季度业绩公告中核对云外部收入增速、AI 相关产品收入、MaaS ARR、资本开支及自由现金流",
    dueDate: "2026-11-30",
    validUntil: "2026-11-30",
    nextReviewAt: "2026-11-20",
    version: 1,
    department: "投研部",
    projectGroup: "二级市场",
  },
];

export const people = [
  { name: "Yongming Wu", role: "首席执行官", domain: "AI、云计算与电商", trust: 95, talks: 1, last: "2026-08-20" },
  { name: "Toby Xu", role: "首席财务官", domain: "财务与资本配置", trust: 95, talks: 1, last: "2026-08-20" },
  { name: "Lydia Lu", role: "投资者关系负责人", domain: "投资者关系", trust: 95, talks: 1, last: "2026-08-20" },
];

export const topicStats = [
  { name: "AI 云计算", count: 1, signals: 3, trend: "+45%", color: "#315f50" },
  { name: "AI 相关产品", count: 1, signals: 2, trend: "三位数增长", color: "#5a6e91" },
  { name: "即时零售", count: 1, signals: 1, trend: "+45%", color: "#9c6f50" },
  { name: "集团盈利", count: 1, signals: 1, trend: "-30%", color: "#8f8b62" },
];
