"use client";

import {
  Archive,
  Activity,
  AlertTriangle,
  ArrowUp,
  AudioLines,
  BookOpen,
  BrainCircuit,
  Check,
  ChevronDown,
  ChevronRight,
  CircleUserRound,
  Clock3,
  Command,
  Download,
  FileAudio,
  FileText,
  Gauge,
  GitBranch,
  Home,
  Inbox,
  Layers3,
  Lightbulb,
  Link2,
  ListChecks,
  LockKeyhole,
  Menu,
  MessageSquareQuote,
  Plus,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Square,
  Target,
  ThumbsDown,
  ThumbsUp,
  Timer,
  UploadCloud,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import { FormEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Conversation, ConversationStatus, seedConversations, topicStats } from "../lib/knowledge-data";
import type { SearchHit } from "../lib/retrieval";
import type { ResearchCitation, ResearchSynthesis } from "../lib/research-answer";
import type { StructureSuggestion } from "../lib/structure-transcript";
import type { WikiHealthIssue, WikiPage, WikiSnapshot } from "../lib/wiki-compiler";

type ViewKey = "overview" | "ask" | "inbox" | "wiki" | "knowledge" | "verify" | "health";

const navItems: { key: ViewKey; label: string; icon: typeof Home; count?: number }[] = [
  { key: "overview", label: "总览", icon: Home },
  { key: "ask", label: "研究问答", icon: Sparkles },
  { key: "inbox", label: "谈话收件箱", icon: Inbox, count: 6 },
  { key: "wiki", label: "研究 Wiki", icon: BookOpen },
  { key: "knowledge", label: "观点库", icon: Layers3 },
  { key: "verify", label: "验证队列", icon: ListChecks, count: 4 },
  { key: "health", label: "知识健康", icon: Activity },
];

const viewMeta: Record<ViewKey, { eyebrow: string; title: string; subtitle: string }> = {
  overview: { eyebrow: "Research command center", title: "今日投研总览", subtitle: "从碎片谈话中，找到值得继续下注的变化。" },
  ask: { eyebrow: "Evidence-grounded research", title: "研究问答", subtitle: "先检索内部证据，再形成可回溯的研究摘要；没有证据时明确说不知道。" },
  inbox: { eyebrow: "Conversation inbox", title: "谈话收件箱", subtitle: "先完整保留原始信息，再进入研究员的结构化判断。" },
  wiki: { eyebrow: "Compiled institutional wiki", title: "研究 Wiki", subtitle: "把原始谈话持续编译为有目录、有双链、可检查的机构知识。" },
  knowledge: { eyebrow: "Institutional memory", title: "知识库", subtitle: "按观点而非文档组织，让每条判断都能回到证据与上下文。" },
  verify: { eyebrow: "Verification loop", title: "验证队列", subtitle: "把可证伪假设变成有负责人、有期限、有结果的研究任务。" },
  health: { eyebrow: "Knowledge health", title: "知识健康度", subtitle: "集中处理过期、无负责人、单一来源和长期未验证的知识问题。" },
};

const statusClass: Record<ConversationStatus, string> = {
  草稿: "slate",
  已复核: "amber",
  跟踪中: "blue",
  已证实: "green",
  已证伪: "amber",
  已替代: "slate",
  已归档: "slate",
};

type SaveState = "idle" | "saving" | "saved" | "failed" | "local";

function formatDate(date: string) {
  return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit" }).format(new Date(`${date}T00:00:00`));
}

function Badge({ children, tone = "slate" }: { children: ReactNode; tone?: string }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

function SaveStateIndicator({ state, onRetry }: { state: SaveState; onRetry?: () => void }) {
  if (state === "idle") return null;
  const labels: Record<Exclude<SaveState, "idle">, string> = { saving: "保存中", saved: "已保存", failed: "保存失败", local: "仅本地草稿" };
  return <span className={`save-state save-${state}`}>{state === "saving" ? <span className="loading-dot dark"/> : state === "saved" ? <Check size={13}/> : <AlertTriangle size={13}/>}<span>{labels[state]}</span>{onRetry && (state === "failed" || state === "local") && <button onClick={onRetry}><RefreshCw size={12}/>重试</button>}</span>;
}

function Meter({ value, small = false }: { value: number; small?: boolean }) {
  return <div className={`meter ${small ? "meter-small" : ""}`}><span style={{ width: `${value}%` }} /></div>;
}

export default function WorkspaceApp() {
  const [view, setView] = useState<ViewKey>("overview");
  const [records, setRecords] = useState<Conversation[]>(seedConversations);
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [recordOpen, setRecordOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [mobileNav, setMobileNav] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sourceCitation, setSourceCitation] = useState<ResearchCitation | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [pendingSave, setPendingSave] = useState<{ record: Conversation; audio?: File } | null>(null);
  const [accessDomains, setAccessDomains] = useState<string[]>(["投研部", "全部授权行业", "二级市场", "核心组"]);

  useEffect(() => {
    fetch("/api/conversations")
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((data) => {
        if (Array.isArray(data.records) && data.records.length) setRecords(data.records);
        if (data.access) setAccessDomains([...(data.access.departments ?? []), ...(data.access.industries ?? []).map((item: string) => item === "*" ? "全部授权行业" : item), ...(data.access.projects ?? []), data.access.maxSensitivity].filter(Boolean));
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
      }
      if (event.key === "Escape") {
        setSearchOpen(false);
        setRecordOpen(false);
        setSelected(null);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(null), 2600);
  }

  function openRecord(record: Conversation) {
    setSelected(record);
    setSearchOpen(false);
  }

  async function addRecord(record: Conversation, audio?: File) {
    setSaveState("saving");
    let audioQueued = false;
    try {
      const response = await fetch("/api/conversations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(record),
      });
      if (!response.ok) throw new Error((await response.json() as { error?: string }).error || "后端保存失败");
      const saved = (await response.json()).record as Conversation;
      if (audio && response.ok) {
        const body = new FormData();
        body.append("file", audio);
        body.append("conversationId", record.id);
        const uploadResponse = await fetch("/api/uploads", { method: "POST", body });
        const upload = await uploadResponse.json() as { transcriptionJob?: { id: string; autoProcess: boolean } };
        if (uploadResponse.ok && upload.transcriptionJob?.autoProcess) {
          audioQueued = true;
          void fetch("/api/transcriptions", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ jobId: upload.transcriptionJob.id }),
          });
        }
      }
      setRecords((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
      setPendingSave(null);
      setSaveState("saved");
      setRecordOpen(false);
      setView("inbox");
      showToast(audioQueued ? "谈话已保存，音频正在进入转写流程" : "谈话已保存并进入收件箱");
    } catch {
      setRecords((current) => [record, ...current.filter((item) => item.id !== record.id)]);
      setPendingSave({ record, audio });
      setSaveState("local");
      setRecordOpen(false);
      setView("inbox");
      showToast("后端保存失败，当前仅保留为本地草稿，可点击重试");
    }
  }

  async function updateStatus(record: Conversation, status: ConversationStatus) {
    setSaveState("saving");
    try {
      const response = await fetch("/api/conversations", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: record.id, status, owner: record.owner, validUntil: record.validUntil, nextReviewAt: record.nextReviewAt, snapshot: record, changeSummary: `状态更新为 ${status}` }) });
      if (!response.ok) throw new Error();
      const data = await response.json() as { version: number };
      const updated = { ...record, status, version: data.version };
      setRecords((current) => current.map((item) => item.id === record.id ? updated : item));
      setSelected(updated);
      setSaveState("saved");
      showToast(`已保存：状态更新为「${status}」`);
    } catch {
      setSaveState("failed");
      showToast("状态保存失败，原状态未更改");
    }
  }

  async function exportData() {
    setSaveState("saving");
    try {
      const response = await fetch("/api/conversations?format=export");
      if (!response.ok) throw new Error();
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = url; anchor.download = `投研知识库-${new Date().toISOString().slice(0, 10)}.json`; anchor.click(); URL.revokeObjectURL(url);
      setSaveState("saved"); showToast("已按当前权限范围导出");
    } catch { setSaveState("failed"); showToast("导出失败或当前权限不允许导出"); }
  }

  async function importEarningsCall(file: File) {
    setSaveState("saving");
    const body = new FormData();
    body.append("file", file);
    try {
      const response = await fetch("/api/imports/earnings-call", { method: "POST", body });
      const data = await response.json() as { record?: Conversation; error?: string; imported?: { segmentCount: number; claimCount: number } };
      if (!response.ok || !data.record) throw new Error(data.error || "导入失败");
      setRecords((current) => [data.record!, ...current.filter((item) => item.id !== data.record!.id)]);
      setSelected(data.record);
      setSaveState("saved");
      showToast(`已导入 ${data.imported?.segmentCount || 0} 个原文片段和 ${data.imported?.claimCount || 0} 条结构化陈述`);
    } catch (error) {
      setSaveState("failed");
      showToast(error instanceof Error ? error.message : "业绩会 HTML 导入失败");
    }
  }

  const meta = viewMeta[view];

  return (
    <main className={`app-shell ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      <aside className={`app-sidebar ${mobileNav ? "is-open" : ""}`}>
        <button className="mobile-close icon-button" aria-label="关闭菜单" onClick={() => setMobileNav(false)}><X size={18} /></button>
        <button className="sidebar-collapse icon-button" aria-label={sidebarCollapsed ? "展开侧栏" : "收起侧栏"} onClick={() => setSidebarCollapsed((current) => !current)}>{sidebarCollapsed ? <PanelLeftOpen size={17}/> : <><PanelLeftClose size={17}/><span>收起导航</span></>}</button>
        <nav className="main-nav" aria-label="主导航">
          {navItems.map((item) => {
            const Icon = item.icon;
            return <button title={item.label} key={item.key} className={view === item.key ? "active" : ""} onClick={() => { setView(item.key); setMobileNav(false); }}>
              <Icon size={16} /><span>{item.label}</span>{item.count ? <b>{item.count}</b> : null}
            </button>;
          })}
        </nav>
        <div className="security-note"><LockKeyhole size={13} /><span>内部平台权限管控</span></div>
      </aside>

      <section className="app-main">
        <header className="topbar">
          <button className="mobile-menu icon-button" aria-label="打开菜单" onClick={() => setMobileNav(true)}><Menu size={19} /></button>
          <button className="command-search" onClick={() => setSearchOpen(true)}><Search size={15} /><span>搜索观点、人物或标的</span><kbd><Command size={11} /> K</kbd></button>
          <div className="topbar-actions">
            <SaveStateIndicator state={saveState} onRetry={pendingSave ? () => void addRecord(pendingSave.record, pendingSave.audio) : undefined}/>
            <button className="quiet-button" onClick={exportData}><Download size={14} />导出</button>
            <button className="primary-button" onClick={() => setRecordOpen(true)}><Plus size={15} />记录新谈话</button>
          </div>
        </header>

        <div className="page-wrap">
          <div className="page-heading">
            <div><span className="section-eyebrow">{meta.eyebrow}</span><h1>{meta.title}</h1><p>{meta.subtitle}</p></div>
            {view !== "overview" && <div className="heading-stamp"><span>LAST SYNC</span><b>08:42</b></div>}
          </div>

          {view === "overview" && <Overview records={records} onOpen={openRecord} onNavigate={setView} />}
          {view === "ask" && <ResearchAssistantV2 records={records} accessDomains={accessDomains} onOpenCitation={setSourceCitation} />}
          {view === "inbox" && <InboxView records={records} onOpen={openRecord} onRecord={() => setRecordOpen(true)} onImport={importEarningsCall} />}
          {view === "wiki" && <WikiView records={records} onOpen={openRecord} />}
          {view === "knowledge" && <KnowledgeView records={records} onOpen={openRecord} />}
          {view === "verify" && <VerifyView records={records} onOpen={openRecord} />}
          {view === "health" && <HealthView records={records} onOpen={openRecord} />}
        </div>
      </section>

      {searchOpen && <SearchDialog query={query} setQuery={setQuery} records={records} onClose={() => setSearchOpen(false)} onOpen={openRecord} />}
      {recordOpen && <RecordDialog onClose={() => setRecordOpen(false)} onSubmit={addRecord} />}
      {selected && <DetailDrawer record={selected} onClose={() => setSelected(null)} onStatus={updateStatus} />}
      {sourceCitation && <SourceDrawer citation={sourceCitation} record={records.find((item) => item.id === sourceCitation.conversationId)} onClose={() => setSourceCitation(null)} />}
      {mobileNav && <button className="sidebar-scrim" aria-label="关闭菜单" onClick={() => setMobileNav(false)} />}
      {toast && <div className="toast"><Check size={15} />{toast}</div>}
    </main>
  );
}

function Overview({ records, onOpen, onNavigate }: { records: Conversation[]; onOpen: (record: Conversation) => void; onNavigate: (view: ViewKey) => void }) {
  const theses = records.flatMap((item) => item.theses);
  const pending = records.filter((item) => item.status === "已复核" || item.status === "跟踪中");
  return <>
    <section className="research-brief surface"><header><div><span className="section-eyebrow">Earnings call brief</span><h2>重点变化</h2></div><button className="text-action" onClick={() => onNavigate("knowledge")}>查看全部观点 <ChevronRight size={14}/></button></header><div className="brief-items"><button onClick={() => onNavigate("knowledge")}><span>AI 云计算</span><strong>云外部收入同比增长 45%</strong><small>阿里巴巴 2027 财年一季度 · 管理层口径</small></button><button onClick={() => onNavigate("knowledge")}><span>集团盈利</span><strong>经调整 EBITDA 同比下降 30%</strong><small>AI 基础设施投入增加 · 待后续验证</small></button><button onClick={() => onNavigate("verify")}><span>验证提醒</span><strong>{pending.length} 条假设需要更新</strong><small>最早截止 {pending[0] ? formatDate(pending[0].dueDate) : "—"}</small></button></div></section>

    <section className="metric-grid">
      <Metric label="已导入交流会" value={records.length} note="数据截至 2026-08-20" icon={<MessageSquareQuote size={16} />} />
      <Metric label="提炼有效观点" value={theses.length} note={records.length ? `平均每场 ${(theses.length / records.length).toFixed(1)} 条` : "暂无数据"} icon={<Lightbulb size={16} />} />
      <Metric label="待验证假设" value={pending.length} note="等待下一季业绩核对" trend="warn" icon={<ListChecks size={16} />} />
      <Metric label="原始材料" value="1" note="业绩会 HTML" icon={<Gauge size={16} />} />
    </section>

    <section className="dashboard-grid">
      <div className="surface recent-surface">
        <PanelTitle eyebrow="Latest captures" title="最近沉淀" action="查看全部" onAction={() => onNavigate("inbox")} />
        <div className="record-list compact">
          {records.slice(0, 4).map((record) => <button className="record-row" key={record.id} onClick={() => onOpen(record)}>
            <div className="date-block"><b>{formatDate(record.date)}</b><small>{record.location}</small></div>
            <div className="record-main"><strong>{record.title}</strong><span>{record.scene} · {record.participants[0]}</span><div className="inline-tags">{record.tickers.slice(0, 2).map((ticker) => <em key={ticker}>{ticker}</em>)}</div></div>
            <div className="confidence"><span>{record.confidence}</span><small>置信度</small></div>
            <Badge tone={statusClass[record.status]}>{record.status}</Badge><ChevronRight size={16} />
          </button>)}
        </div>
      </div>
      <aside className="surface verify-surface">
        <PanelTitle eyebrow="Action required" title="验证队列" count={String(pending.length).padStart(2, "0")} />
        <div className="mini-queue">
          {pending.slice(0, 3).map((record, index) => <button key={record.id} onClick={() => onOpen(record)}><span className={`priority-dot ${index === 0 ? "hot" : ""}`} /><div><strong>{record.theses[0]}</strong><small>{record.tickers[0]} · 截止 {formatDate(record.dueDate)}</small></div></button>)}
        </div>
        <button className="text-action" onClick={() => onNavigate("verify")}>进入验证工作台 <ChevronRight size={14} /></button>
      </aside>
      <div className="surface pulse-surface">
        <PanelTitle eyebrow="Signal pulse" title="主题信号热度" action="查看覆盖图" onAction={() => onNavigate("subjects")} />
        <div className="pulse-list">{topicStats.map((topic, index) => <div key={topic.name}><span>{topic.name}</span><div><i style={{ width: `${86 - index * 12}%`, background: topic.color }} /></div><b className={topic.trend.startsWith("+") ? "positive" : "negative"}>{topic.trend}</b></div>)}</div>
      </div>
      <aside className="surface portfolio-surface">
        <PanelTitle eyebrow="Portfolio linkage" title="组合关联" />
        <div className="portfolio-stat"><strong>3</strong><span>条观点关联阿里巴巴</span></div>
        <div className="portfolio-tags"><span>阿里巴巴 <b>3</b></span><span>BABA.N <b>3</b></span></div>
      </aside>
    </section>
  </>;
}

function Metric({ label, value, note, trend, icon }: { label: string; value: string | number; note: string; trend?: string; icon: ReactNode }) {
  return <article className="metric-card"><div className="metric-label"><span>{icon}</span>{label}</div><strong>{value}</strong><small className={trend}>{note}</small></article>;
}

function PanelTitle({ eyebrow, title, action, onAction, count }: { eyebrow: string; title: string; action?: string; onAction?: () => void; count?: string }) {
  return <div className="panel-title"><div><span>{eyebrow}</span><h3>{title}</h3></div>{count ? <b className="panel-count">{count}</b> : action ? <button onClick={onAction}>{action}<ChevronRight size={13} /></button> : null}</div>;
}

function InboxView({ records, onOpen, onRecord, onImport }: { records: Conversation[]; onOpen: (record: Conversation) => void; onRecord: () => void; onImport: (file: File) => Promise<void> }) {
  const [filter, setFilter] = useState("全部");
  const filtered = filter === "全部" ? records : records.filter((record) => record.status === filter);
  return <div className="stack-gap">
    <section className="workflow-strip"><div className="workflow-copy"><AudioLines size={19} /><div><strong>原始谈话层</strong><p>录音、速记与原文只做留存；任何 AI 提炼必须由研究员确认后才能进入知识库。</p></div></div><div className="workflow-steps"><span className="done">1. 采集</span><i /><span className="current">2. 结构化</span><i /><span>3. 验证</span><i /><span>4. 归档</span></div></section>
    <section className="surface table-surface">
      <div className="table-toolbar"><div className="filter-tabs">{["全部", "草稿", "已复核", "跟踪中", "已证实", "已证伪", "已归档"].map((item) => <button key={item} className={filter === item ? "active" : ""} onClick={() => setFilter(item)}>{item}</button>)}</div><div className="import-actions"><label className="secondary-button file-import-button"><FileText size={14} />导入业绩会 HTML<input type="file" accept="text/html,.html" onChange={(event) => { const file = event.target.files?.[0]; if (file) void onImport(file); event.currentTarget.value = ""; }}/></label><button className="secondary-button" onClick={onRecord}><UploadCloud size={14} />记录谈话</button></div></div>
      <div className="record-table-head"><span>谈话 / 场景</span><span>覆盖方向</span><span>信息源</span><span>置信度</span><span>状态</span><span /></div>
      <div className="record-list">{filtered.map((record) => <button className="record-row table-row" key={record.id} onClick={() => onOpen(record)}>
        <div className="record-main"><strong>{record.title}</strong><span>{record.date} · {record.location} · {record.scene}</span></div>
        <div className="coverage-cell"><span>{record.industry}</span><small>{record.tickers.join(" / ")}</small></div>
        <div className="source-cell"><span className="mini-avatar">{record.participants[0].slice(0, 1)}</span><div><strong>{record.participants[0]}</strong><small>{record.sensitivity}</small></div></div>
        <div className="confidence-cell"><b>{record.confidence}</b><Meter value={record.confidence} small /></div>
        <Badge tone={statusClass[record.status]}>{record.status}</Badge><ChevronRight size={15} />
      </button>)}</div>
    </section>
  </div>;
}

type ResearchAnswer = {
  answer: string;
  confidence: number;
  coverage: string;
  modelUsed: boolean;
  provider?: string;
  citations: Array<SearchHit["citations"][number] & {
    conversationId: string;
    title: string;
    date: string;
    industry: string;
    tickers: string[];
  }>;
};

function buildLocalResearchAnswer(records: Conversation[], question: string): ResearchAnswer {
  const stopTerms = new Set(["什么", "是否", "哪些", "如何", "怎么", "变化", "情况", "目前", "有哪"]);
  const latinTerms = question.toLowerCase().match(/[a-z0-9][a-z0-9.+-]*/g) ?? [];
  const chineseTerms = (question.match(/[\u4e00-\u9fff]+/g) ?? []).flatMap((word) =>
    word.length <= 2 ? [word] : Array.from({ length: word.length - 1 }, (_, index) => word.slice(index, index + 2)),
  );
  const terms = Array.from(new Set([...latinTerms, ...chineseTerms])).filter((term) => term.length > 1 && !stopTerms.has(term));
  const candidates = records.map((record) => {
    const searchable = [record.title, record.industry, record.summary, record.transcript, ...record.tickers, ...record.tags, ...record.theses, ...record.evidence].join(" ").toLowerCase();
    const matched = terms.filter((term) => searchable.includes(term.toLowerCase()));
    return { record, matched, score: matched.length / Math.max(1, terms.length) };
  }).filter((item) => item.matched.length).sort((a, b) => b.score - a.score || b.record.confidence - a.record.confidence).slice(0, 4);

  if (!candidates.length) {
    return {
      answer: "当前已加载的内部资料中没有找到足够证据。建议补充公司名、行业、指标或时间范围后再检索。",
      confidence: 0,
      coverage: "证据不足",
      citations: [],
      modelUsed: false,
      provider: "local-evidence",
    };
  }

  const citations = candidates.map(({ record, matched, score }, index) => {
    const thesis = record.theses.find((item) => matched.some((term) => item.toLowerCase().includes(term.toLowerCase())));
    const content = thesis || record.summary || record.transcript;
    return {
      chunkId: `${record.id}:local:${index}`,
      kind: thesis ? "thesis" : "summary",
      excerpt: content.length > 180 ? `${content.slice(0, 180)}…` : content,
      score: Number(Math.min(1, score).toFixed(3)),
      conversationId: record.id,
      title: record.title,
      date: record.date,
      industry: record.industry,
      tickers: record.tickers,
    };
  });
  const lead = citations.slice(0, 3).map((citation, index) => `${index + 1}. ${citation.excerpt}`).join("\n");
  return {
    answer: `在线检索暂时不可达，已自动切换至当前已加载的内部资料。可提炼出以下证据摘要：\n${lead}`,
    confidence: Math.min(88, Math.round(candidates.reduce((sum, item) => sum + item.record.confidence, 0) / candidates.length)),
    coverage: citations.length >= 3 ? "本地多条证据" : citations.length === 2 ? "本地有限证据" : "本地单一证据",
    citations,
    modelUsed: false,
    provider: "local-evidence",
  };
}

// Kept as the migration reference for previously filed research notes.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function ResearchAssistant({ records, onOpen }: { records: Conversation[]; onOpen: (record: Conversation) => void }) {
  const examples = ["阿里巴巴云业务为何加速增长？", "AI 基础设施投入如何影响盈利和现金流？", "管理层对 MaaS 收入作出了哪些指引？"];
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<Array<{ id: number; question: string; answer?: ResearchAnswer; error?: string; pending: boolean }>>([]);
  const [filedTurns, setFiledTurns] = useState<Set<number>>(new Set());
  const asking = turns.some((turn) => turn.pending);

  async function ask(value = question) {
    const normalized = value.trim();
    if (normalized.length < 2) return;
    const id = Date.now();
    setQuestion("");
    setTurns((current) => [...current, { id, question: normalized, pending: true }]);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch("/api/ask", { method: "POST", credentials: "same-origin", signal: controller.signal, headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify({ question: normalized }) });
      if (!response.headers.get("content-type")?.includes("application/json")) throw new Error("invalid-response");
      const data = await response.json() as ResearchAnswer & { error?: string };
      if (!response.ok) throw new Error(data.error || "研究问答暂时不可用");
      setTurns((current) => current.map((turn) => turn.id === id ? { ...turn, answer: data, pending: false } : turn));
    } catch {
      const fallback = buildLocalResearchAnswer(records, normalized);
      setTurns((current) => current.map((turn) => turn.id === id ? { ...turn, answer: fallback, pending: false } : turn));
    } finally {
      window.clearTimeout(timeout);
    }
  }

  function openCitation(conversationId: string) {
    const record = records.find((item) => item.id === conversationId);
    if (record) onOpen(record);
  }

  async function fileTurn(turn: { id: number; question: string; answer?: ResearchAnswer }) {
    if (!turn.answer || filedTurns.has(turn.id)) return;
    const citations = turn.answer.citations.map((citation, index) => `- [${index + 1}] [[${citation.title}]]：${citation.excerpt}`).join("\n");
    const contentMd = `# ${turn.question}\n\n## 研究问题\n${turn.question}\n\n## 证据摘要\n${turn.answer.answer}\n\n## 引用依据\n${citations}\n\n> 由研究助手生成，需研究员复核。`;
    const response = await fetch("/api/wiki", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "file", title: turn.question, contentMd, sourceIds: Array.from(new Set(turn.answer.citations.map((citation) => citation.conversationId))) }) });
    if (response.ok) setFiledTurns((current) => new Set(current).add(turn.id));
  }

  return <section className="chat-shell surface" aria-live="polite">
    <header className="chat-header"><div><strong>研究检索</strong><span>覆盖谈话、观点、原话与 Wiki 页面</span></div><div className="research-scope"><button className="active">全部来源</button><button>内部谈话</button><button>观点库</button><button>研究 Wiki</button></div><button className="quiet-button" onClick={() => setTurns([])} disabled={!turns.length}>新建检索</button></header>
    <div className="chat-composer"><form onSubmit={(event) => { event.preventDefault(); void ask(); }}><Search size={17}/><textarea aria-label="输入研究问题" value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void ask(); } }} rows={1} placeholder="输入公司、行业、人物、指标或研究问题"/><button type="submit" aria-label="发送问题" disabled={asking || question.trim().length < 2}><ArrowUp size={16}/></button></form><div className="query-options"><span><ShieldCheck size={12}/>仅检索有权限访问的内部材料</span><span>按相关度与时效排序</span></div></div>
    <div className={`chat-thread ${turns.length ? "has-turns" : ""}`}>
      {!turns.length && <div className="research-empty"><div className="research-empty-title"><FileText size={17}/><div><strong>建议检索</strong><span>从常用投研问题开始，答案将附带可点击来源。</span></div></div><div className="research-suggestions">{examples.map((example) => <button key={example} onClick={() => void ask(example)}><Search size={13}/><span>{example}</span><ChevronRight size={13}/></button>)}</div><div className="research-guidance"><span>检索建议</span><p>同时输入公司、时间范围与指标，通常可以获得更精确的证据覆盖。</p></div></div>}
      {turns.map((turn) => <article className="chat-turn" key={turn.id}>
        <div className="chat-user-row"><div className="chat-user-bubble">{turn.question}</div><span className="chat-user-avatar">研</span></div>
        <div className="chat-assistant-row"><span className="chat-assistant-avatar"><Sparkles size={15}/></span><div className="chat-response">
          {turn.pending && <div className="chat-thinking"><span className="loading-dot dark"/><span>正在检索观点与原话切片…</span></div>}
          {turn.error && <div className="chat-error"><ShieldCheck size={16}/><span>{turn.error}</span></div>}
          {turn.answer && <><div className="chat-response-meta"><Badge tone={turn.answer.confidence >= 70 ? "green" : "amber"}>{turn.answer.coverage}</Badge><span>证据置信度 {turn.answer.confidence}/100</span></div><div className="chat-answer-copy">{turn.answer.answer.split("\n").map((line, index) => <p key={`${index}-${line}`}>{line}</p>)}</div>{turn.answer.citations.length > 0 && <details className="chat-citations"><summary><GitBranch size={14}/><span>查看 {turn.answer.citations.length} 个引用依据</span><ChevronDown size={14}/></summary><div>{turn.answer.citations.map((citation, index) => <button key={`${citation.chunkId}-${index}`} onClick={() => openCitation(citation.conversationId)}><span className="citation-no">{String(index + 1).padStart(2, "0")}</span><div><strong>{citation.title}</strong><p>{citation.excerpt}</p><small>{citation.industry} · {citation.date} · {citation.kind === "transcript" ? "原话" : citation.kind === "thesis" ? "观点" : "摘要"}</small></div><ChevronRight size={15}/></button>)}</div></details>}<div className="chat-model-note"><span><BrainCircuit size={13}/>{turn.answer.modelUsed ? "模型辅助生成，需研究员复核" : turn.answer.provider === "local-evidence" ? "本地资料索引降级检索 · 未调用外部模型" : "可解释证据拼接 · 未调用外部模型"}</span><button onClick={() => void fileTurn(turn)} disabled={filedTurns.has(turn.id)}><Archive size={13}/>{filedTurns.has(turn.id) ? "已沉淀到 Wiki" : "沉淀到 Wiki"}</button></div></>}
        </div></div>
      </article>)}
    </div>
  </section>;
}

type WorkStage = { label: string; detail: string; elapsedMs: number; sourceCount?: number; fragmentCount?: number };
type ResearchTurn = { id: number; question: string; stages: WorkStage[]; result?: ResearchSynthesis; revealed: number; pending: boolean; stopped?: boolean; error?: string; narrowed?: boolean };

function localSynthesis(records: Conversation[], question: string): ResearchSynthesis {
  const local = buildLocalResearchAnswer(records, question);
  const citations: ResearchCitation[] = local.citations.map((citation) => {
    const record = records.find((item) => item.id === citation.conversationId);
    return { ...citation, speaker: record?.participants[0] || "未标注说话人", timecode: "00:18", context: record?.transcript || citation.excerpt, decision: "adopted", reason: "本地关键词匹配" };
  });
  const supportingEvidence = citations.slice(0, 3).map((citation, index) => ({ text: citation.excerpt, citationIds: [index + 1] }));
  return {
    answer: local.answer,
    paragraphs: supportingEvidence.length ? supportingEvidence : [{ text: local.answer, citationIds: [] }],
    confidence: local.confidence,
    coverage: local.coverage,
    modelUsed: false,
    modelVersion: "local-evidence-fallback-v1",
    provider: "local-evidence",
    citations,
    excludedSources: [],
    supportingEvidence,
    counterEvidence: [],
    unresolvedQuestions: citations.length ? ["需要补充独立来源完成交叉核验。"] : ["是否扩大时间范围或补充公司、指标关键词？"],
    riskWarnings: citations.length <= 1 ? ["当前仅有单一来源或无匹配来源，结论不可直接用于投资决策。"] : [],
    trace: { queryTerms: question.split(/[，。\s]+/).filter(Boolean), filters: {}, knowledgeDomains: ["当前浏览器已加载资料"], fragmentCount: citations.length, sourceCount: new Set(citations.map((item) => item.conversationId)).size, elapsedMs: 0 },
    access: { departments: ["本地资料"], industries: [], projects: [], maxSensitivity: "内部" },
  };
}

function CitationMarks({ ids, citations, onOpen }: { ids: number[]; citations: ResearchCitation[]; onOpen: (citation: ResearchCitation) => void }) {
  return <>{ids.map((id) => { const citation = citations[id - 1]; return citation ? <button className="inline-citation" key={id} onClick={() => onOpen(citation)} aria-label={`打开引用 ${id}`}>[{id}]</button> : null; })}</>;
}

function ResearchAssistantV2({ records, accessDomains, onOpenCitation }: { records: Conversation[]; accessDomains: string[]; onOpenCitation: (citation: ResearchCitation) => void }) {
  const examples = ["阿里巴巴云业务为何加速增长？", "AI 基础设施投入如何影响盈利和现金流？", "管理层对 MaaS 收入作出了哪些指引？"];
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<ResearchTurn[]>([]);
  const controllers = useRef(new Map<number, AbortController>());
  const timers = useRef(new Map<number, number>());
  const nextTurnId = useRef(0);
  const asking = turns.some((turn) => turn.pending);

  function updateTurn(id: number, mutate: (turn: ResearchTurn) => ResearchTurn) {
    setTurns((current) => current.map((turn) => turn.id === id ? mutate(turn) : turn));
  }

  function revealAnswer(id: number, paragraphCount: number) {
    let revealed = 0;
    const timer = window.setInterval(() => {
      revealed += 1;
      updateTurn(id, (turn) => ({ ...turn, revealed: Math.min(revealed, paragraphCount) }));
      if (revealed >= paragraphCount) { window.clearInterval(timer); timers.current.delete(id); }
    }, 260);
    timers.current.set(id, timer);
  }

  async function ask(value = question, filters: Record<string, string> = {}) {
    const normalized = value.trim();
    if (normalized.length < 2) return;
    const id = ++nextTurnId.current;
    setQuestion("");
    setTurns((current) => [...current, { id, question: normalized, stages: [], revealed: 0, pending: true, narrowed: Boolean(filters.dateFrom) }]);
    const controller = new AbortController();
    controllers.current.set(id, controller);
    try {
      const response = await fetch("/api/ask/stream", { method: "POST", signal: controller.signal, credentials: "same-origin", headers: { "content-type": "application/json", accept: "application/x-ndjson" }, body: JSON.stringify({ question: normalized, filters }) });
      if (!response.ok || !response.body) throw new Error("stream-unavailable");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value: chunk } = await reader.read();
        if (done) break;
        buffer += decoder.decode(chunk, { stream: true });
        const lines = buffer.split("\n"); buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as { type: string; label?: string; detail?: string; elapsedMs?: number; sourceCount?: number; fragmentCount?: number; result?: ResearchSynthesis; error?: string };
          if (event.type === "stage") updateTurn(id, (turn) => ({ ...turn, stages: [...turn.stages, { label: event.label || "处理中", detail: event.detail || "", elapsedMs: event.elapsedMs || 0, sourceCount: event.sourceCount, fragmentCount: event.fragmentCount }] }));
          if (event.type === "result" && event.result) {
            updateTurn(id, (turn) => ({ ...turn, result: event.result, pending: false }));
            revealAnswer(id, event.result.paragraphs.length);
          }
          if (event.type === "error") throw new Error(event.error || "stream-error");
        }
      }
    } catch {
      if (controller.signal.aborted) updateTurn(id, (turn) => ({ ...turn, pending: false, stopped: true }));
      else {
        const result = localSynthesis(records, normalized);
        updateTurn(id, (turn) => ({ ...turn, pending: false, result, error: "在线检索暂不可达，已切换到本地权限范围内的资料。" }));
        revealAnswer(id, result.paragraphs.length);
      }
    } finally { controllers.current.delete(id); }
  }

  function stop(id: number) {
    controllers.current.get(id)?.abort();
    const timer = timers.current.get(id); if (timer) window.clearInterval(timer);
    timers.current.delete(id);
  }

  async function feedback(turn: ResearchTurn, type: string) {
    await fetch("/api/workflows", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "feedback", feedbackType: type, question: turn.question, answer: turn.result?.answer, sourceIds: turn.result?.citations.map((item) => item.conversationId), modelVersion: turn.result?.modelVersion }) });
  }

  async function addGap(turn: ResearchTurn) {
    await fetch("/api/workflows", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "knowledge-gap", question: turn.question, suggestions: ["补充公司名", "扩大时间范围", "创建调研任务"] }) });
    updateTurn(turn.id, (current) => ({ ...current, error: "已加入知识缺口队列。" }));
  }

  return <section className="chat-shell research-chat-v2 surface" aria-live="polite">
    <header className="chat-header"><div><strong>研究检索</strong><span>答案、原文与权限范围同步可核验</span></div><div className="access-domains"><ShieldCheck size={13}/>{(accessDomains.length ? accessDomains : ["当前授权知识域"]).slice(0, 3).map((domain) => <span key={domain}>{domain}</span>)}</div><button className="quiet-button" onClick={() => setTurns([])} disabled={!turns.length}>新建检索</button></header>
    <div className={`chat-thread ${turns.length ? "has-turns" : ""}`}>
      {!turns.length && <div className="research-empty"><div className="research-empty-title"><FileText size={17}/><div><strong>从可验证的问题开始</strong><span>回答将逐段生成，并在结论旁同步显示引用。</span></div></div><div className="research-suggestions">{examples.map((example) => <button key={example} onClick={() => void ask(example)}><Search size={13}/><span>{example}</span><ChevronRight size={13}/></button>)}</div></div>}
      {turns.map((turn) => <article className="chat-turn" key={turn.id}>
        <div className="chat-user-row"><div className="chat-user-bubble">{turn.question}</div><span className="chat-user-avatar">研</span></div>
        <div className="chat-assistant-row"><span className="chat-assistant-avatar"><BrainCircuit size={15}/></span><div className="chat-response">
          <div className="work-trace"><div className="trace-head"><div><Activity size={14}/><strong>{turn.pending ? "正在生成可核验答案" : turn.stopped ? "生成已停止" : "工作轨迹"}</strong></div><span><Timer size={12}/>{turn.stages.at(-1)?.elapsedMs ?? turn.result?.trace.elapsedMs ?? 0} ms · {turn.stages.at(-1)?.sourceCount ?? turn.result?.trace.sourceCount ?? 0} 个来源</span></div><ol>{turn.stages.map((stage, index) => <li className={index < turn.stages.length - 1 || !turn.pending ? "done" : "current"} key={`${stage.label}-${index}`}><i>{index < turn.stages.length - 1 || !turn.pending ? <Check size={11}/> : <span className="loading-dot dark"/>}</i><div><strong>{stage.label}</strong><span>{stage.detail}</span></div></li>)}</ol>{turn.result && <details><summary>展开检索词、筛选与来源取舍 <ChevronDown size={13}/></summary><div className="trace-details"><p><b>检索词</b>{turn.result.trace.queryTerms.join("、") || "未识别"}</p><p><b>筛选条件</b>{Object.keys(turn.result.trace.filters).length ? JSON.stringify(turn.result.trace.filters) : "当前授权范围、相关度优先"}</p><p><b>采用来源</b>{turn.result.citations.length} 个片段</p><p><b>排除来源</b>{turn.result.excludedSources.length ? turn.result.excludedSources.map((item) => `${item.title}（${item.reason}）`).join("；") : "无"}</p></div></details>}</div>
          {turn.error && <div className="inline-alert"><AlertTriangle size={14}/>{turn.error}</div>}
          {turn.result && <>
            {turn.result.riskWarnings.map((warning) => <div className="risk-warning" key={warning}><AlertTriangle size={14}/><span>{warning}</span></div>)}
            <div className="stream-answer">{turn.result.paragraphs.slice(0, turn.revealed).map((paragraph, index) => <p key={index}>{paragraph.text} <CitationMarks ids={paragraph.citationIds} citations={turn.result!.citations} onOpen={onOpenCitation}/></p>)}{turn.pending && <span className="typing-cursor"/>}</div>
            <div className="evidence-triad"><section><h4>结论</h4>{turn.result.paragraphs.map((item, index) => <p key={index}>{item.text}<CitationMarks ids={item.citationIds} citations={turn.result!.citations} onOpen={onOpenCitation}/></p>)}</section><section><h4>支持证据</h4>{turn.result.supportingEvidence.length ? turn.result.supportingEvidence.map((item, index) => <p key={index}>{item.text}<CitationMarks ids={item.citationIds} citations={turn.result!.citations} onOpen={onOpenCitation}/></p>) : <p>暂无充分支持证据。</p>}</section><section><h4>反证与未决</h4>{turn.result.counterEvidence.map((item, index) => <p key={index}>{item.text}<CitationMarks ids={item.citationIds} citations={turn.result!.citations} onOpen={onOpenCitation}/></p>)}{turn.result.unresolvedQuestions.map((item) => <p key={item}>{item}</p>)}</section></div>
            {!turn.result.citations.length && <div className="no-result-actions"><strong>当前权限范围内没有找到证据</strong><span>可尝试同义词、扩大时间范围，或把问题纳入知识缺口。</span><div><button onClick={() => void ask(turn.question, { dateFrom: "2023-01-01" })}>扩大时间范围</button><button onClick={() => void addGap(turn)}>加入知识缺口</button><button onClick={() => void addGap(turn)}>创建调研任务</button></div></div>}
            <div className="answer-actions"><button onClick={() => void feedback(turn, "helpful")}><ThumbsUp size={13}/>有帮助</button><button onClick={() => void feedback(turn, "not-helpful")}><ThumbsDown size={13}/>无帮助</button><button onClick={() => void feedback(turn, "citation-error")}>引用错误</button><button onClick={() => void feedback(turn, "stale")}>内容过期</button><button onClick={() => void feedback(turn, "permission")}>权限异常</button><span>{turn.result.modelUsed ? `${turn.result.modelVersion} · 授权证据生成` : "本地证据合成"} · {turn.result.coverage} · 置信度 {turn.result.confidence}/100</span></div>
          </>}
          <div className="generation-actions">{turn.pending && <button onClick={() => stop(turn.id)}><Square size={12}/>停止生成</button>}<button onClick={() => void ask(turn.question)}><RefreshCw size={12}/>重新生成</button><button onClick={() => void ask(turn.question, { dateFrom: new Date(Date.now() - 180 * 86400000).toISOString().slice(0, 10) })}><Clock3 size={12}/>缩小时间范围</button></div>
        </div></div>
      </article>)}
    </div>
    <div className="chat-composer"><form onSubmit={(event) => { event.preventDefault(); void ask(); }}><Search size={17}/><textarea aria-label="输入研究问题" value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void ask(); } }} rows={1} placeholder="输入公司、行业、人物、指标或研究问题"/><button type="submit" aria-label="发送问题" disabled={asking || question.trim().length < 2}><ArrowUp size={16}/></button></form><div className="query-options"><span><ShieldCheck size={12}/>仅检索当前有权访问的内容，不泄露无权限标题</span><span>回答需要研究员复核</span></div></div>
  </section>;
}

function WikiInline({ text, pages, onSelect }: { text: string; pages: WikiPage[]; onSelect: (slug: string) => void }) {
  return <>{text.split(/(\[\[[^\]]+\]\])/g).map((part, index) => {
    const match = part.match(/^\[\[([^\]]+)\]\]$/);
    if (!match) return <span key={`${part}-${index}`}>{part}</span>;
    const target = pages.find((page) => page.title === match[1]);
    return <button className="wiki-link" key={`${part}-${index}`} onClick={() => target && onSelect(target.slug)} disabled={!target}>{match[1]}</button>;
  })}</>;
}

function WikiMarkdown({ page, pages, onSelect }: { page: WikiPage; pages: WikiPage[]; onSelect: (slug: string) => void }) {
  return <div className="wiki-markdown">{page.contentMd.split("\n").map((line, index) => {
    if (line.startsWith("# ")) return <h1 key={index}>{line.slice(2)}</h1>;
    if (line.startsWith("## ")) return <h2 key={index}>{line.slice(3)}</h2>;
    if (line.startsWith("> ")) return <blockquote key={index}>{line.slice(2)}</blockquote>;
    if (line.startsWith("- ")) return <div className="wiki-list-item" key={index}><i/><p><WikiInline text={line.slice(2)} pages={pages} onSelect={onSelect}/></p></div>;
    if (!line.trim()) return <span className="wiki-space" key={index}/>;
    return <p key={index}><WikiInline text={line} pages={pages} onSelect={onSelect}/></p>;
  })}</div>;
}

function WikiView({ records, onOpen }: { records: Conversation[]; onOpen: (record: Conversation) => void }) {
  const [snapshot, setSnapshot] = useState<WikiSnapshot | null>(null);
  const [selectedSlug, setSelectedSlug] = useState("index");
  const [compiling, setCompiling] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    const response = await fetch("/api/wiki");
    if (!response.ok) throw new Error("Wiki 暂时无法读取");
    const data = await response.json() as WikiSnapshot;
    setSnapshot(data);
    if (!data.pages.some((page) => page.slug === selectedSlug)) setSelectedSlug(data.pages[0]?.slug ?? "index");
  }

  // Initial remote synchronization intentionally owns the first Wiki snapshot.
  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => { void load().catch((caught) => setError(caught instanceof Error ? caught.message : "Wiki 暂时无法读取")); }, []);

  async function compile() {
    setCompiling(true);
    setError("");
    try {
      const response = await fetch("/api/wiki", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "compile" }) });
      if (!response.ok) throw new Error("编译失败");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "编译失败");
    } finally {
      setCompiling(false);
    }
  }

  if (!snapshot) return <section className="surface wiki-loading"><span className="loading-dot dark"/><span>{error || "正在读取编译后的研究 Wiki…"}</span></section>;
  const selected = snapshot.pages.find((page) => page.slug === selectedSlug) ?? snapshot.pages[0];
  const groups = [
    { label: "目录", pages: snapshot.pages.filter((page) => page.pageType === "index") },
    { label: "行业", pages: snapshot.pages.filter((page) => page.pageType === "industry") },
    { label: "公司", pages: snapshot.pages.filter((page) => page.pageType === "company") },
    { label: "研究输出", pages: snapshot.pages.filter((page) => page.pageType === "research-note") },
  ].filter((group) => group.pages.length);
  const sourceRecords = selected.sourceIds.map((id) => records.find((record) => record.id === id)).filter((record): record is Conversation => Boolean(record));

  return <div className="wiki-workspace">
    <section className="wiki-command surface"><div><span className="section-eyebrow">Incremental compiler</span><h2>原始资料 → 机构 Wiki</h2><p>{snapshot.persisted ? `上次编译 ${new Date(snapshot.compiledAt).toLocaleString("zh-CN")}` : "当前为实时预览，点击编译后持久化版本与双向链接。"}</p></div><div><a className="secondary-button" href={`/api/wiki?format=markdown&slug=${encodeURIComponent(selected.slug)}`}><Download size={14}/>导出当前 .md</a><button className="primary-button" onClick={() => void compile()} disabled={compiling}><Sparkles size={14}/>{compiling ? "正在增量编译…" : "增量编译 Wiki"}</button></div></section>
    <section className="wiki-metrics">{[["原始来源", snapshot.stats.rawSources], ["Wiki 页面", snapshot.stats.pages], ["双向链接", snapshot.stats.links], ["健康度", `${snapshot.stats.healthScore}%`]].map(([label, value]) => <div className="surface" key={label}><span>{label}</span><strong>{value}</strong></div>)}</section>
    {error && <div className="wiki-error"><ShieldCheck size={14}/>{error}</div>}
    <div className="wiki-grid">
      <aside className="surface wiki-tree"><div className="wiki-tree-title"><BookOpen size={15}/><strong>页面目录</strong></div>{groups.map((group) => <div className="wiki-tree-group" key={group.label}><span>{group.label}</span>{group.pages.map((page) => <button className={selected.slug === page.slug ? "active" : ""} key={page.id} onClick={() => setSelectedSlug(page.slug)}><FileText size={13}/><span>{page.title}</span><b>{page.sourceIds.length}</b></button>)}</div>)}</aside>
      <article className="surface wiki-article"><header><div><Badge tone={selected.pageType === "research-note" ? "blue" : "green"}>{selected.pageType === "research-note" ? "研究输出" : "自动编译"}</Badge><span>v{selected.version} · 健康度 {selected.healthScore} · 负责人 {sourceRecords[0]?.owner || "研究平台主管"} · 下次复核 {sourceRecords[0]?.nextReviewAt || "待设置"}</span></div><p>{selected.summary}</p></header><WikiMarkdown page={selected} pages={snapshot.pages} onSelect={setSelectedSlug}/></article>
      <aside className="wiki-context"><section className="surface"><span className="section-eyebrow">Backlinks</span><h3>反向链接</h3>{selected.backlinks.length ? selected.backlinks.map((title) => { const target = snapshot.pages.find((page) => page.title === title); return <button className="wiki-backlink" key={title} onClick={() => target && setSelectedSlug(target.slug)} disabled={!target}><Link2 size={13}/><span>{title}</span></button>; }) : <p className="wiki-empty-copy">当前没有反向链接</p>}</section><section className="surface"><span className="section-eyebrow">Raw sources</span><h3>原始来源</h3>{sourceRecords.slice(0, 5).map((record) => <button className="wiki-source" key={record.id} onClick={() => onOpen(record)}><span>{record.title}</span><small>{record.date} · {record.confidence}/100</small></button>)}</section><section className="surface wiki-health"><div><span className="section-eyebrow">Health check</span><Badge tone={snapshot.issues.some((issue) => issue.severity === "high") ? "amber" : "green"}>{snapshot.issues.length} 项</Badge></div><h3>知识健康检查</h3>{snapshot.issues.slice(0, 4).map((issue: WikiHealthIssue) => <button key={issue.id} onClick={() => { const record = records.find((item) => item.id === issue.conversationId); if (record) onOpen(record); }}><i className={`health-${issue.severity}`}/><span><strong>{issue.title}</strong><small>{issue.detail}</small></span></button>)}</section></aside>
    </div>
  </div>;
}

function KnowledgeView({ records, onOpen }: { records: Conversation[]; onOpen: (record: Conversation) => void }) {
  const [filter, setFilter] = useState("全部行业");
  const industries = ["全部行业", ...Array.from(new Set(records.map((record) => record.industry)))];
  const filtered = filter === "全部行业" ? records : records.filter((record) => record.industry === filter);
  return <div className="knowledge-layout">
    <aside className="filter-rail surface"><span className="rail-label">行业分类</span>{industries.map((industry) => <button className={filter === industry ? "active" : ""} key={industry} onClick={() => setFilter(industry)}><span>{industry}</span><b>{industry === "全部行业" ? records.length : records.filter((item) => item.industry === industry).length}</b></button>)}<div className="rail-divider"/><span className="rail-label">知识类型</span><button><span>产业信号</span><b>18</b></button><button><span>公司判断</span><b>11</b></button><button><span>人物口径</span><b>8</b></button></aside>
    <section className="knowledge-cards">{filtered.map((record) => { const expired = Boolean(record.validUntil && record.validUntil < new Date().toISOString().slice(0, 10)); return <button type="button" className="thesis-note" key={record.id} onClick={() => onOpen(record)}>
      <div className="knowledge-card-head"><span>{record.industry}</span><Badge tone={statusClass[record.status]}>{record.status}</Badge></div>
      <h3>{record.theses[0]}</h3><p>{record.summary}</p>
      <div className="knowledge-card-tags">{record.tickers.map((ticker) => <span key={ticker}>{ticker}</span>)}</div>
      <div className="knowledge-card-proof"><span><ShieldCheck size={13}/>{record.confidence}% 置信度</span><span><GitBranch size={13}/>{record.evidence.length} 条证据</span><span><UsersRound size={13}/>{record.participants.length} 个来源</span><span><UserRound size={13}/>{record.owner || "无负责人"}</span></div>
      <footer><span>{expired ? "可能失效" : `下次复核 ${formatDate(record.nextReviewAt)}`} · v{record.version}</span><ChevronRight size={14}/></footer>
    </button>; })}</section>
  </div>;
}

function VerifyView({ records, onOpen }: { records: Conversation[]; onOpen: (record: Conversation) => void }) {
  const pending = records.filter((record) => record.status === "已复核" || record.status === "跟踪中");
  return <div className="verify-layout">
    <section className="surface kanban-column"><div className="kanban-title"><span className="priority-dot hot"/><h3>即将到期</h3><b>{pending.slice(0, 2).length}</b></div>{pending.slice(0, 2).map((record) => <VerifyCard key={record.id} record={record} onOpen={onOpen} />)}</section>
    <section className="surface kanban-column"><div className="kanban-title"><span className="priority-dot"/><h3>跟踪中</h3><b>{pending.slice(2).length}</b></div>{pending.slice(2).map((record) => <VerifyCard key={record.id} record={record} onOpen={onOpen} />)}{pending.length < 4 && <div className="empty-card"><Clock3 size={17}/><span>没有更多跟踪任务</span></div>}</section>
    <aside className="surface verify-guide"><span className="section-eyebrow">Falsifiability</span><h3>一条好假设，必须知道如何被证伪。</h3><p>验证任务应包含明确时间窗、可观测指标、阈值与相反证据。</p><div className="guide-check"><Check size={14}/><span>描述具体变量，而不是笼统趋势</span></div><div className="guide-check"><Check size={14}/><span>预先写下反证条件，避免事后解释</span></div><div className="guide-check"><Check size={14}/><span>验证结果回写原始观点，保留版本</span></div></aside>
  </div>;
}

function VerifyCard({ record, onOpen }: { record: Conversation; onOpen: (record: Conversation) => void }) {
  return <button className="verify-card" onClick={() => onOpen(record)}><div><Badge tone={record.status === "已复核" ? "amber" : "blue"}>{record.status}</Badge><span>{formatDate(record.dueDate)} 截止</span></div><h4>{record.theses[0]}</h4><p>{record.nextAction}</p><footer><span className="mini-avatar">{record.owner.slice(0, 1)}</span><span>{record.owner}</span><i/>{record.tickers.slice(0, 1).map((ticker) => <em key={ticker}>{ticker}</em>)}</footer></button>;
}

type HealthData = {
  summary: Record<string, number>;
  expired: Array<{ entity_id: string; owner: string; valid_until: string }>;
  singleSource: Conversation[];
  noCounter: Conversation[];
  overdue: Conversation[];
  highFrequencyNoResults: Array<{ query: string; count: number }>;
};

function HealthView({ records, onOpen }: { records: Conversation[]; onOpen: (record: Conversation) => void }) {
  const [data, setData] = useState<HealthData | null>(null);
  useEffect(() => { fetch("/api/workflows?action=health").then((response) => response.ok ? response.json() : Promise.reject()).then(setData).catch(() => setData({ summary: {}, expired: [], singleSource: records.filter((item) => item.evidence.length < 2), noCounter: [], overdue: [], highFrequencyNoResults: [] })); }, [records]);
  if (!data) return <section className="surface wiki-loading"><span className="loading-dot dark"/><span>正在检查知识健康度…</span></section>;
  const metrics = [["可能失效", data.summary.expired || 0], ["无负责人", data.summary.noOwner || 0], ["单一来源", data.summary.singleSource || 0], ["缺少反证", data.summary.noCounter || 0], ["长期未验证", data.summary.overdue || 0], ["知识缺口", data.summary.knowledgeGaps || 0]];
  const issueGroups = [
    { title: "过期或即将失效", items: data.expired.map((item) => ({ id: item.entity_id, title: records.find((record) => record.id === item.entity_id)?.title || item.entity_id, detail: `${item.owner || "无负责人"} · 有效期 ${item.valid_until}` })) },
    { title: "单一来源观点", items: data.singleSource.map((item) => ({ id: item.id, title: item.theses[0], detail: `${item.owner} · ${item.evidence.length} 条证据` })) },
    { title: "缺少反证条件", items: data.noCounter.map((item) => ({ id: item.id, title: item.theses[0], detail: item.nextAction })) },
    { title: "长期未验证", items: data.overdue.map((item) => ({ id: item.id, title: item.title, detail: `截止 ${item.dueDate} · ${item.status}` })) },
  ];
  return <div className="health-dashboard"><section className="health-metrics">{metrics.map(([label, value]) => <article className="surface" key={String(label)}><span>{label}</span><strong>{value}</strong><small>需要治理</small></article>)}</section><section className="health-board">{issueGroups.map((group) => <article className="surface health-issue-group" key={group.title}><header><h3>{group.title}</h3><Badge tone={group.items.length ? "amber" : "green"}>{group.items.length}</Badge></header>{group.items.slice(0, 5).map((item) => <button key={item.id} onClick={() => { const record = records.find((candidate) => candidate.id === item.id); if (record) onOpen(record); }}><AlertTriangle size={14}/><span><strong>{item.title}</strong><small>{item.detail}</small></span><ChevronRight size={14}/></button>)}{!group.items.length && <p className="health-empty"><Check size={14}/>当前没有此类问题</p>}</article>)}</section><section className="surface no-result-queries"><header><div><span className="section-eyebrow">Knowledge gaps</span><h3>高频无结果搜索</h3></div><span>用于安排补充调研</span></header>{data.highFrequencyNoResults.length ? data.highFrequencyNoResults.map((item) => <div key={item.query}><strong>{item.query}</strong><span>{item.count} 次无结果</span><button>创建调研任务</button></div>) : <p>当前没有高频无结果搜索。</p>}</section></div>;
}

type SearchResponse = {
  hits: SearchHit[];
  groups: { bestAnswer: SearchHit[]; opinions: SearchHit[]; conversations: SearchHit[]; wiki: Array<{ id: string; title: string; summary: string; reason: string }>; people: Array<{ name: string; reason: string }>; subjects: Array<{ name: string; reason: string }>; verification: Conversation[] };
  knowledgeDomains: string[];
  elapsedMs: number;
};

function SearchDialog({ query, setQuery, records, onClose, onOpen }: { query: string; setQuery: (value: string) => void; records: Conversation[]; onClose: () => void; onOpen: (record: Conversation) => void }) {
  const [data, setData] = useState<SearchResponse | null>(null);
  const [searching, setSearching] = useState(false);
  const [filters, setFilters] = useState({ industry: "", ticker: "", owner: "", dateFrom: "", minConfidence: "", status: "", sensitivity: "", sort: "relevance" });
  const industries = Array.from(new Set(records.map((item) => item.industry)));

  useEffect(() => {
    const value = query.trim();
    if (value.length < 2) { const clear = window.setTimeout(() => setData(null), 0); return () => window.clearTimeout(clear); }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setSearching(true);
      const params = new URLSearchParams({ q: value });
      Object.entries(filters).forEach(([key, filterValue]) => { if (filterValue) params.set(key, filterValue); });
      fetch(`/api/search?${params}`, { signal: controller.signal }).then((response) => response.ok ? response.json() : Promise.reject()).then(setData).catch(() => setData(null)).finally(() => setSearching(false));
    }, 220);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [query, filters]);

  async function addGap() {
    await fetch("/api/workflows", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "knowledge-gap", question: query, suggestions: ["使用同义词", "扩大时间范围", "补充人物或标的"] }) });
  }

  const groupedHits = [
    ["最佳答案", data?.groups.bestAnswer || []],
    ["观点", data?.groups.opinions || []],
    ["原始谈话", data?.groups.conversations || []],
  ] as Array<[string, SearchHit[]]>;
  const hasResults = Boolean(data && (data.hits.length || data.groups.wiki.length || data.groups.people.length || data.groups.subjects.length));
  // eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/no-autofocus
  return <div className="modal-layer" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="search-dialog search-dialog-v2" role="dialog" aria-modal="true" aria-label="全局搜索"><div className="search-input-row"><Search size={19}/><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索观点、标的、人物、原话或标签…"/><kbd>ESC</kbd></div><div className="search-filter-grid"><select aria-label="行业" value={filters.industry} onChange={(event) => setFilters((current) => ({ ...current, industry: event.target.value }))}><option value="">全部行业</option>{industries.map((item) => <option key={item}>{item}</option>)}</select><input aria-label="标的" placeholder="标的" value={filters.ticker} onChange={(event) => setFilters((current) => ({ ...current, ticker: event.target.value }))}/><input aria-label="负责人" placeholder="负责人" value={filters.owner} onChange={(event) => setFilters((current) => ({ ...current, owner: event.target.value }))}/><input aria-label="起始日期" type="date" value={filters.dateFrom} onChange={(event) => setFilters((current) => ({ ...current, dateFrom: event.target.value }))}/><select aria-label="置信度" value={filters.minConfidence} onChange={(event) => setFilters((current) => ({ ...current, minConfidence: event.target.value }))}><option value="">全部置信度</option><option value="80">80 以上</option><option value="60">60 以上</option></select><select aria-label="状态" value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}><option value="">全部状态</option>{["草稿", "已复核", "跟踪中", "已证实", "已证伪", "已替代", "已归档"].map((item) => <option key={item}>{item}</option>)}</select><select aria-label="敏感等级" value={filters.sensitivity} onChange={(event) => setFilters((current) => ({ ...current, sensitivity: event.target.value }))}><option value="">全部敏感等级</option><option>内部</option><option>核心组</option></select><select aria-label="排序" value={filters.sort} onChange={(event) => setFilters((current) => ({ ...current, sort: event.target.value }))}><option value="relevance">相关度排序</option><option value="updated">更新时间排序</option><option value="confidence">置信度排序</option><option value="citations">引用次数排序</option></select></div>{data && <div className="search-coverage"><ShieldCheck size={13}/><span>本次覆盖：</span>{data.knowledgeDomains.map((domain) => <em key={domain}>{domain}</em>)}<b>{data.elapsedMs} ms</b></div>}<div className="search-results grouped-results"><span className="result-label">{searching ? "正在按权限检索…" : query.length < 2 ? "输入至少两个字符开始检索" : hasResults ? `分组展示 ${data?.hits.length || 0} 条相关内容` : "没有找到可访问的匹配内容"}</span>{data && groupedHits.map(([label, hits]) => hits.length ? <section className="result-group" key={label}><h3>{label}<span>{hits.length}</span></h3>{hits.slice(0, label === "原始谈话" ? 8 : 3).map((hit) => { const record = records.find((item) => item.id === hit.conversationId); return <button key={`${label}-${hit.conversationId}`} onClick={() => record && onOpen(record)}><span className="result-icon"><MessageSquareQuote size={16}/></span><div><strong>{hit.title}</strong><small>{hit.citations[0]?.excerpt}</small><em className="ranking-reasons">{hit.reasons.join(" · ")}</em></div><Badge tone="slate">{Math.round(hit.score * 100)}</Badge><ChevronRight size={15}/></button>; })}</section> : null)}{data && data.groups.wiki.length > 0 && <section className="result-group"><h3>Wiki<span>{data.groups.wiki.length}</span></h3>{data.groups.wiki.map((item) => <div className="nonrecord-result" key={item.id}><FileText size={15}/><span><strong>{item.title}</strong><small>{item.summary}</small><em>{item.reason}</em></span></div>)}</section>}{data && (data.groups.people.length > 0 || data.groups.subjects.length > 0) && <section className="entity-results"><div><h3>人物</h3>{data.groups.people.map((item) => <span key={item.name}><UserRound size={13}/>{item.name}<small>{item.reason}</small></span>)}</div><div><h3>标的</h3>{data.groups.subjects.map((item) => <span key={item.name}><Target size={13}/>{item.name}<small>{item.reason}</small></span>)}</div></section>}{!searching && query.length >= 2 && !hasResults && <div className="empty-result no-result-search"><Search size={20}/><strong>当前授权知识域内没有结果</strong><span>系统不会展示无权限内容的标题或摘要。</span><div><button onClick={() => setFilters((current) => ({ ...current, dateFrom: "" }))}>扩大时间范围</button><button onClick={() => setQuery(query.replace(/订单|景气/g, "需求"))}>尝试同义词</button><button onClick={() => void addGap()}>加入知识缺口</button></div></div>}</div><footer><span><b>D1</b> 权限感知索引</span><span><b>R2</b> 受控原始材料</span><span><b>esc</b> 关闭</span></footer></section></div>;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function SearchDialogLegacy({ query, setQuery, records, onClose, onOpen }: { query: string; setQuery: (value: string) => void; records: Conversation[]; onClose: () => void; onOpen: (record: Conversation) => void }) {
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [provider, setProvider] = useState("D1 轻量混合召回");
  const local = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return records.slice(0, 5);
    return records.filter((record) => [record.title, record.industry, record.summary, record.transcript, ...record.tickers, ...record.tags, ...record.theses, ...record.participants].join(" ").toLowerCase().includes(needle)).slice(0, 8);
  }, [query, records]);

  useEffect(() => {
    const value = query.trim();
    if (value.length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setSearching(true);
      fetch(`/api/search?q=${encodeURIComponent(value)}`, { signal: controller.signal })
        .then((response) => response.ok ? response.json() : Promise.reject())
        .then((data: { hits?: SearchHit[]; provider?: string }) => {
          setHits(Array.isArray(data.hits) ? data.hits : []);
          setProvider(data.provider === "d1-hybrid" ? "D1 轻量混合召回" : "托管混合召回");
        })
        .catch(() => setHits([]))
        .finally(() => setSearching(false));
    }, 220);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [query]);

  const remoteItems = hits.map((hit) => ({ hit, record: records.find((record) => record.id === hit.conversationId) })).filter((item): item is { hit: SearchHit; record: Conversation } => Boolean(item.record));
  const useRemote = query.trim().length >= 2 && (searching || remoteItems.length > 0);
  // The modal backdrop deliberately owns pointer dismissal; the dialog itself remains keyboard accessible.
  // eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/no-autofocus
  return <div className="modal-layer" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="search-dialog" role="dialog" aria-modal="true" aria-label="全局搜索"><div className="search-input-row"><Search size={19}/><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索观点、标的、人物、原话或标签…"/><kbd>ESC</kbd></div><div className="search-scope"><span>检索范围</span><button>全部内容</button><span className="retrieval-mode"><GitBranch size={12}/>{provider} · 原文级引用</span></div><div className="search-results"><span className="result-label">{searching ? "正在检索切片…" : query ? `找到 ${useRemote ? remoteItems.length : local.length} 条相关结果` : "最近访问"}</span>{useRemote ? remoteItems.map(({ record, hit }) => <button key={record.id} onClick={() => onOpen(record)}><span className="result-icon"><MessageSquareQuote size={16}/></span><div><strong>{record.title}</strong><small>{hit.citations[0]?.excerpt || record.summary}</small><em className="citation-label">引用 {hit.citations.length} 个原文切片 · 匹配度 {Math.round(hit.score * 100)}</em></div><Badge tone={statusClass[record.status]}>{record.status}</Badge><ChevronRight size={15}/></button>) : local.map((record) => <button key={record.id} onClick={() => onOpen(record)}><span className="result-icon"><MessageSquareQuote size={16}/></span><div><strong>{record.title}</strong><small>{record.industry} · {record.tickers.join(" / ")} · {record.summary.slice(0, 58)}…</small></div><Badge tone={statusClass[record.status]}>{record.status}</Badge><ChevronRight size={15}/></button>)}{!searching && (useRemote ? remoteItems.length === 0 : local.length === 0) && <div className="empty-result"><Search size={20}/><span>没有找到匹配内容</span></div>}</div><footer><span><b>D1</b> 结构化索引</span><span><b>R2</b> 原始材料</span><span><b>esc</b> 关闭</span></footer></section></div>;
}

function RecordDialog({ onClose, onSubmit }: { onClose: () => void; onSubmit: (record: Conversation, audio?: File) => void }) {
  const [audio, setAudio] = useState<File | undefined>();
  const [transcript, setTranscript] = useState("");
  const [consent, setConsent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [structuring, setStructuring] = useState(false);
  const [structureError, setStructureError] = useState("");
  const [suggestion, setSuggestion] = useState<StructureSuggestion | null>(null);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [location, setLocation] = useState("");
  const [scene, setScene] = useState("业绩交流会");
  const [participant, setParticipant] = useState("");
  const [industry, setIndustry] = useState("");
  const [tickers, setTickers] = useState("");
  const [sensitivity, setSensitivity] = useState<"内部" | "核心组">("内部");
  const fieldOrigin = (value: string, suggested: string | undefined) => !suggestion ? "研究员填写" : value === (suggested || "") ? "AI 建议" : "研究员已修改";

  async function smartFill() {
    if (transcript.trim().length < 20) {
      setStructureError("请先粘贴至少 20 个字符的谈话内容。请输入包含观点、人物或标的的完整片段。");
      return;
    }
    setStructuring(true);
    setStructureError("");
    try {
      const response = await fetch("/api/structure", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ transcript }) });
      const data = await response.json() as { suggestion?: StructureSuggestion; error?: string };
      if (!response.ok || !data.suggestion) throw new Error(data.error || "结构化失败");
      const result = data.suggestion;
      setSuggestion(result);
      setTitle(result.title);
      setLocation(result.location === "待确认" ? "" : result.location);
      setScene(result.scene);
      setParticipant(result.participant === "待确认信息源" ? "" : result.participant);
      setIndustry(result.industry === "待分类" ? "" : result.industry);
      setTickers(result.tickers.join("，"));
    } catch (error) {
      setStructureError(error instanceof Error ? error.message : "结构化失败，请稍后重试");
    } finally {
      setStructuring(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const ticker = tickers.split(/[,，/]/).map((item) => item.trim()).filter(Boolean);
    const record: Conversation = {
      id: `conv-${Date.now()}`,
      title: title || "未命名谈话", date, location: location || "未标注", scene, owner: "当前用户", participants: [participant || "未命名信息源"], industry: industry || "未分类",
      tickers: ticker, tags: suggestion?.tags ?? [industry, scene].filter(Boolean), summary: suggestion?.summary ?? (transcript ? transcript.slice(0, 110) : "等待研究员补充摘要与结构化判断。"), theses: suggestion?.theses ?? ["待研究员确认：从本次谈话中提炼可验证的核心假设"], confidence: suggestion?.confidence ?? 50, sourceReliability: 50, status: "草稿", sensitivity, transcript: transcript || "尚未录入逐字稿。", evidence: suggestion?.evidence ?? ["原始谈话待复核"], nextAction: suggestion?.nextAction ?? "研究员完成结构化并确认信息源层级", dueDate: date, validUntil: date, nextReviewAt: date, version: 1, department: "投研部", projectGroup: "二级市场",
    };
    setSaving(true);
    await onSubmit(record, audio);
  }
  // eslint-disable-next-line jsx-a11y/no-static-element-interactions
  return <div className="modal-layer" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="record-dialog record-dialog-wide" role="dialog" aria-modal="true" aria-label="记录新谈话">
    <header><div><span className="section-eyebrow">New capture</span><h2>粘贴谈话并智能填充</h2><p>先保留原文，再自动生成候选结构；所有结果仍需研究员确认。</p></div><button className="icon-button" onClick={onClose} aria-label="关闭"><X size={18}/></button></header>
    <form onSubmit={submit}>
      <div className="structure-review-grid"><div className="raw-review-column"><div className="review-column-title"><span>原始文本</span><small>点击右侧证据可回看此处原话</small></div>
      <section className="smart-paste-section"><div className="smart-paste-head"><div><Sparkles size={17}/><span><strong>第一步：粘贴原始谈话</strong><small>可粘贴逐字稿、微信速记或访谈纪要</small></span></div><button type="button" className="smart-fill-button" onClick={smartFill} disabled={structuring}>{structuring ? <><span className="loading-dot"/>正在提取…</> : <><Sparkles size={14}/>智能填充结构</>}</button></div><textarea value={transcript} onChange={(event) => { setTranscript(event.target.value); setStructureError(""); }} rows={7} placeholder="例如：阿里巴巴 2027 财年第一季度业绩交流会。管理层表示云外部收入同比增长 45%，AI 相关产品收入连续第 12 个季度实现三位数增长。"/><div className="paste-foot"><span>{transcript.length} 字</span><span className="mode-label"><BrainCircuit size={12}/>字段识别 + 陈述分类 + 证据句定位 · 未调用大模型</span></div>{structureError && <p className="structure-error">{structureError}</p>}</section>
      </div><div className="structured-review-column"><div className="review-column-title"><span>结构化结果</span><small><em>AI 建议</em><em>研究员已修改</em></small></div>
      {suggestion && <section className="structure-preview"><div className="structure-preview-head"><div><Check size={15}/><span><strong>已生成候选结构</strong><small>置信度 {suggestion.confidence}/100 · 时间窗 {suggestion.timeHorizon} · 请修改后保存</small></span></div><Badge tone="slate">可解释规则</Badge></div><div className="preview-summary"><span>自动摘要</span><p>{suggestion.summary}</p></div><div className="preview-statements"><span>陈述分层</span><div>{suggestion.statements.slice(0, 6).map((statement, index) => <article key={`${statement.content}-${index}`}><Badge tone={statement.type === "风险" ? "amber" : statement.type === "预测" ? "blue" : statement.type === "事实" ? "green" : "slate"}>{statement.type}</Badge><p>{statement.content}</p><small>证据句：{statement.evidence}</small></article>)}</div></div><div className="preview-theses"><span>候选观点</span>{suggestion.theses.map((thesis, index) => <p key={thesis}><b>{String(index + 1).padStart(2, "0")}</b>{thesis}</p>)}</div></section>}

      <div className="form-section-title"><span>第二步：确认结构化字段</span><i/></div>
      <div className="form-grid"><label className="full"><span>谈话主题 * <small className={fieldOrigin(title, suggestion?.title).includes("修改") ? "modified" : "ai"}>{fieldOrigin(title, suggestion?.title)}</small></span><input value={title} onChange={(event) => setTitle(event.target.value)} required placeholder="智能填充后仍可修改"/></label><label><span>日期 *</span><input type="date" value={date} onChange={(event) => setDate(event.target.value)} required/></label><label><span>地点 <small className={fieldOrigin(location, suggestion?.location === "待确认" ? "" : suggestion?.location).includes("修改") ? "modified" : "ai"}>{fieldOrigin(location, suggestion?.location === "待确认" ? "" : suggestion?.location)}</small></span><input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="线上电话会"/></label><label><span>交流场景</span><select value={scene} onChange={(event) => setScene(event.target.value)}><option>业绩交流会</option><option>产业链晚宴</option><option>闭门会</option><option>公司调研</option><option>专家交流</option><option>电话访谈</option><option>线下交流</option><option>其他</option></select></label><label><span>核心信息源 * <small className={fieldOrigin(participant, suggestion?.participant === "待确认信息源" ? "" : suggestion?.participant).includes("修改") ? "modified" : "ai"}>{fieldOrigin(participant, suggestion?.participant === "待确认信息源" ? "" : suggestion?.participant)}</small></span><input value={participant} onChange={(event) => setParticipant(event.target.value)} required placeholder="姓名或管理层角色"/></label><label><span>行业 <small className={fieldOrigin(industry, suggestion?.industry === "待分类" ? "" : suggestion?.industry).includes("修改") ? "modified" : "ai"}>{fieldOrigin(industry, suggestion?.industry === "待分类" ? "" : suggestion?.industry)}</small></span><input value={industry} onChange={(event) => setIndustry(event.target.value)} placeholder="互联网与云计算"/></label><label><span>关联标的</span><input value={tickers} onChange={(event) => setTickers(event.target.value)} placeholder="阿里巴巴，BABA.N"/></label><label><span>知悉范围</span><select value={sensitivity} onChange={(event) => setSensitivity(event.target.value as "内部" | "核心组")}><option>内部</option><option>核心组</option></select></label>
        <div className="full capture-box"><div><FileAudio size={20}/><strong>上传原始录音（可选）</strong><span>{audio ? `${audio.name} · ${(audio.size / 1024 / 1024).toFixed(1)}MB${audio.size <= 25 * 1024 * 1024 ? " · 保存后自动进入说话人转写" : " · 将留档，需切分至 25MB 内再转写"}` : "25MB 内音频保存后自动进入托管 ASR；原始录音、逐字稿与候选结构分层保存"}</span></div><label className="upload-button"><UploadCloud size={14}/>{audio ? "更换音频" : "选择音频"}<input type="file" accept="audio/mp3,audio/mp4,audio/mpeg,audio/mpga,audio/m4a,audio/wav,audio/webm,audio/*" onChange={(event) => setAudio(event.target.files?.[0])}/></label></div>
      </div>
      </div></div>
      {/* eslint-disable-next-line jsx-a11y/label-has-associated-control */}
      <label className="consent-row"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)}/><span><strong>我已确认记录与录音符合公司制度和在场人授权。</strong><small>如内容可能涉及内幕信息、个人敏感信息或禁止留存事项，请勿上传。</small></span></label>
      <footer><span><LockKeyhole size={13}/> 原始材料默认仅当前行业组可见</span><div><button type="button" className="quiet-button" onClick={onClose}>取消</button><button type="submit" className="primary-button" disabled={!consent || saving}>{saving ? "正在保存…" : "确认并保存"}</button></div></footer>
    </form>
  </section></div>;
}

type TranscriptionJob = {
  id: string;
  status: "queued" | "processing" | "completed" | "configuration_required" | "file_too_large" | "failed";
  provider: string;
  model: string;
  transcript: string;
  segments: { speaker?: string; text?: string; start?: number; end?: number }[];
  suggestion?: Partial<StructureSuggestion>;
  error?: string;
  filename?: string;
};

function TranscriptionPanel({ record }: { record: Conversation }) {
  const [job, setJob] = useState<TranscriptionJob | null | undefined>(undefined);
  const [starting, setStarting] = useState(false);
  const labels: Record<string, string> = {
    queued: "等待转写",
    processing: "正在转写",
    completed: "转写完成",
    configuration_required: "等待管理员配置 ASR",
    file_too_large: "需要先切分音频",
    failed: "转写失败",
  };

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    const load = () => fetch(`/api/transcriptions?conversationId=${encodeURIComponent(record.id)}`)
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((data: { job?: TranscriptionJob | null }) => {
        if (cancelled) return;
        setJob(data.job ?? null);
        if (data.job?.status === "queued" || data.job?.status === "processing") timer = window.setTimeout(load, 2200);
      })
      .catch(() => !cancelled && setJob(null));
    load();
    return () => { cancelled = true; if (timer) window.clearTimeout(timer); };
  }, [record.id]);

  async function start() {
    if (!job) return;
    setStarting(true);
    try {
      const response = await fetch("/api/transcriptions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jobId: job.id }) });
      const data = await response.json() as { job?: TranscriptionJob; error?: string };
      if (data.job) setJob(data.job);
      else if (data.error) setJob({ ...job, status: "failed", error: data.error });
    } finally {
      setStarting(false);
    }
  }

  if (job === undefined) return <div className="transcription-state"><span className="loading-dot"/><p>正在读取音频处理状态…</p></div>;
  if (!job) return <><div className="transcript-block"><span>00:00 — 原始速记</span><p>{record.transcript}</p></div><div className="participant-list">{record.participants.map((participant) => <span key={participant}><CircleUserRound size={14}/>{participant}</span>)}</div></>;
  return <div className="transcription-panel">
    <div className={`transcription-status status-${job.status}`}><AudioLines size={16}/><div><strong>{labels[job.status] || job.status}</strong><small>{job.filename} · {job.model}</small></div>{job.status !== "completed" && job.status !== "file_too_large" && <button className="secondary-button" onClick={start} disabled={starting || job.status === "processing"}>{starting || job.status === "processing" ? "处理中…" : job.status === "queued" ? "立即转写" : "重试转写"}</button>}</div>
    {job.error && <p className="transcription-error">{job.error}</p>}
    {(job.transcript || record.transcript) && <div className="transcript-block"><span>{job.status === "completed" ? "带说话人与时间码的逐字稿" : "原始速记"}</span><p>{job.transcript || record.transcript}</p></div>}
    {job.status === "completed" && job.suggestion?.summary && <div className="transcription-suggestion"><div><Sparkles size={15}/><strong>已生成候选结构，等待研究员确认</strong></div><p>{job.suggestion.summary}</p>{job.suggestion.theses?.slice(0, 3).map((thesis, index) => <span key={thesis}><b>{String(index + 1).padStart(2, "0")}</b>{thesis}</span>)}</div>}
  </div>;
}

function DetailDrawer({ record, onClose, onStatus }: { record: Conversation; onClose: () => void; onStatus: (record: Conversation, status: ConversationStatus) => void }) {
  const [tab, setTab] = useState<"claims" | "thesis" | "transcript">(record.claims?.length ? "claims" : "thesis");
  const expired = Boolean(record.validUntil && record.validUntil < new Date().toISOString().slice(0, 10));
  const facts = record.claims?.filter((item) => item.type === "financial_fact") ?? [];
  const judgments = record.claims?.filter((item) => item.type !== "financial_fact") ?? [];
  async function follow() {
    await fetch("/api/workflows", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "follow", entityType: "conversation", entityValue: record.id, cadence: "daily" }) });
  }
  // eslint-disable-next-line jsx-a11y/no-static-element-interactions
  return <div className="drawer-layer" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><aside className="detail-drawer" role="dialog" aria-modal="true" aria-label={record.title}><header><div><Badge tone={statusClass[record.status]}>{record.status}</Badge><Badge tone="slate">{record.sensitivity}</Badge>{expired && <Badge tone="amber">可能失效</Badge>}</div><button className="icon-button" onClick={onClose} aria-label="关闭"><X size={18}/></button></header><div className="detail-scroll"><span className="section-eyebrow">{record.industry} · {record.date} · v{record.version}</span><h2>{record.title}</h2><p className="detail-summary">{record.summary}</p><div className="detail-meta"><span><UserRound size={14}/>负责人 {record.owner || "待指定"}</span><span><UsersRound size={14}/>{record.participants.length} 位参与者</span><span><Target size={14}/>{record.tickers.join(" / ")}</span></div><div className="governance-strip"><span><b>验证状态</b>{record.status}</span><span><b>有效期</b>{record.validUntil || "待设置"}</span><span><b>下次复核</b>{record.nextReviewAt || "待设置"}</span><span><b>权限域</b>{record.department} / {record.projectGroup}</span></div>{record.source && <section className="source-provenance"><div><FileText size={16}/><span><b>原始来源已留存</b><small>{record.source.filename}</small></span></div><dl><div><dt>发布机构</dt><dd>{record.source.publisher}</dd></div><div><dt>发布日期</dt><dd>{record.source.publishedAt}</dd></div><div><dt>解析器</dt><dd>{record.source.parserVersion}</dd></div><div><dt>完整性</dt><dd>{record.source.sha256 ? `SHA-256 ${record.source.sha256.slice(0, 12)}…` : "待写入原文件"}</dd></div></dl>{record.source.objectKey && <a href={`/api/imports/earnings-call?conversationId=${encodeURIComponent(record.id)}&download=1`}><Download size={13}/>下载原始 HTML</a>}</section>}<div className="confidence-panel"><div><span>综合置信度</span><strong>{record.confidence}<small>/100</small></strong></div><Meter value={record.confidence}/><p>{record.claims?.length ? `公司一手来源 · ${facts.length} 条披露事实按 96 分计 · ${judgments.length} 条管理层判断/指引单独标注 · 尚待外部交叉验证` : `信息直接性 ${record.sourceReliability} · 尚待补充结构化评分依据`}</p></div><div className="detail-tabs">{record.claims?.length ? <button className={tab === "claims" ? "active" : ""} onClick={() => setTab("claims")}>事实与指引</button> : null}<button className={tab === "thesis" ? "active" : ""} onClick={() => setTab("thesis")}>研究观点</button><button className={tab === "transcript" ? "active" : ""} onClick={() => setTab("transcript")}>原始记录</button></div>{tab === "claims" && <div className="detail-section claims-panel"><span className="section-eyebrow">Structured statements</span><h3>披露事实</h3><div className="metric-table">{facts.map((item) => <article key={item.id}><div><strong>{item.statement}</strong><small>{item.period || "本期"} · {item.evidenceAnchor}</small></div><span>{item.valueText || "已披露"}</span><Badge tone="green">事实 {item.confidence}</Badge><details><summary>核对原文</summary><p>{item.evidenceExcerpt}</p></details></article>)}</div><span className="section-eyebrow sub">Management statements</span><h3>管理层指引与判断</h3>{judgments.map((item) => <article className="claim-card" key={item.id}><div><Badge tone={item.type === "management_guidance" ? "blue" : "amber"}>{item.type === "management_guidance" ? "前瞻指引" : "管理层判断"}</Badge><span>置信度 {item.confidence}</span></div><strong>{item.statement}</strong><p>{item.evidenceExcerpt}</p><small>{item.evidenceAnchor} · 需要后续财报或独立来源验证</small></article>)}</div>}{tab === "thesis" && <div className="detail-section"><span className="section-eyebrow">Research layer</span><h3>待验证研究观点</h3>{record.theses.map((thesis, index) => <article className="thesis-item" key={thesis}><span>{String(index + 1).padStart(2, "0")}</span><p>{thesis}</p></article>)}<div className="next-action"><ListChecks size={17}/><div><strong>下一步验证</strong><p>{record.nextAction}</p><span>截止 {record.dueDate}</span></div></div></div>}{tab === "transcript" && <div className="detail-section"><div className="transcript-warning"><LockKeyhole size={14}/>原始记录仅用于内部研究；每个片段保留说话人、章节与锚点。</div>{record.segments?.length ? <div className="structured-transcript-list">{record.segments.map((segment) => <article id={segment.anchor} key={segment.id}><header><span>{segment.section === "presentation" ? "管理层陈述" : "问答"} · {String(segment.ordinal).padStart(2, "0")}</span><Badge tone="slate">{segment.anchor}</Badge></header><strong>{segment.speaker}{segment.role ? ` · ${segment.role}` : ""}</strong><p>{segment.content}</p></article>)}</div> : <TranscriptionPanel record={record}/>}</div>}</div><footer className="lifecycle-footer"><button className="quiet-button" onClick={() => void follow()}><Activity size={14}/>关注</button><select aria-label="观点生命周期" value={record.status} onChange={(event) => void onStatus(record, event.target.value as ConversationStatus)}>{["草稿", "已复核", "跟踪中", "已证实", "已证伪", "已替代", "已归档"].map((status) => <option key={status}>{status}</option>)}</select><button className="primary-button" onClick={() => void onStatus(record, "跟踪中")}><ListChecks size={14}/>创建验证任务</button></footer></aside></div>;
}

function SourceDrawer({ citation, record, onClose }: { citation: ResearchCitation; record?: Conversation; onClose: () => void }) {
  const context = citation.context || record?.transcript || citation.excerpt;
  const excerpt = citation.excerpt.replace(/…$/, "");
  const position = context.indexOf(excerpt);
  const before = position >= 0 ? context.slice(Math.max(0, position - 180), position) : "";
  const after = position >= 0 ? context.slice(position + excerpt.length, position + excerpt.length + 240) : context;
  // eslint-disable-next-line jsx-a11y/no-static-element-interactions
  return <div className="drawer-layer source-layer" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><aside className="source-drawer" role="dialog" aria-modal="true" aria-label={`引用原文：${citation.title}`}><header><div><span className="section-eyebrow">Source verification</span><h2>引用原文定位</h2></div><button className="icon-button" onClick={onClose} aria-label="关闭"><X size={18}/></button></header><div className="source-scroll"><div className="source-title"><Badge tone="green">已采用</Badge><h3>{citation.title}</h3><p>{citation.date} · {citation.industry} · {citation.tickers.join(" / ")}</p></div><div className="source-anchor"><span><CircleUserRound size={14}/>{citation.speaker}</span><span><Clock3 size={14}/>{citation.timecode}</span><span><ShieldCheck size={14}/>{record?.sensitivity || "内部"}</span></div><article className="source-context"><span>原话及上下文</span><p>{before}{before && " … "}<mark>{excerpt}</mark>{after && ` ${after}`}</p></article><section className="source-decision"><h4>采用理由</h4><p>{citation.reason || "与问题直接相关，并通过当前权限过滤。"}</p><small>片段相关度 {Math.round(citation.score * 100)}% · {citation.kind === "transcript" ? "逐字稿" : citation.kind === "thesis" ? "结构化观点" : "摘要"}</small></section>{record && <section className="source-meta"><div><b>信息源</b><span>{record.participants.join("、")}</span></div><div><b>负责人</b><span>{record.owner}</span></div><div><b>验证状态</b><span>{record.status}</span></div><div><b>下次复核</b><span>{record.nextReviewAt}</span></div></section>}</div></aside></div>;
}
