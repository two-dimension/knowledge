import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const templateRoot = new URL("../", import.meta.url);

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html", host: "localhost" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the research knowledge base", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /<title>砚知 · 买方投研知识库<\/title>/);
  assert.match(html, /今日投研总览/);
  assert.doesNotMatch(html, /林晓/);
  assert.match(html, /记录新谈话/);
  assert.match(html, /研究问答/);
  assert.match(html, /研究 Wiki/);
  assert.match(html, /重点变化/);
  assert.match(html, /阿里巴巴 2027 财年第一季度业绩交流会/);
  assert.match(html, /云外部收入同比增长 45%/);
  assert.match(html, /BABA\.N/);
  assert.doesNotMatch(html, /寰岳资产|当前用户|投研部 · 研究员|人物网络|知识治理|系统设置/);
  assert.match(html, /\/og\.png/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|SkeletonPreview/);
});

test("implements permission-aware retrieval, grounded MiniMax answers, and auditable workflows", async () => {
  const [schema, searchRoute, askRoute, streamRoute, workflowRoute, minimax, wikiRoute, wikiCompiler, migration, governanceMigration, transcriptionRoute, workspace] = await Promise.all([
    readFile(new URL("db/schema.ts", templateRoot), "utf8"),
    readFile(new URL("app/api/search/route.ts", templateRoot), "utf8"),
    readFile(new URL("app/api/ask/route.ts", templateRoot), "utf8"),
    readFile(new URL("app/api/ask/stream/route.ts", templateRoot), "utf8"),
    readFile(new URL("app/api/workflows/route.ts", templateRoot), "utf8"),
    readFile(new URL("lib/minimax.ts", templateRoot), "utf8"),
    readFile(new URL("app/api/wiki/route.ts", templateRoot), "utf8"),
    readFile(new URL("lib/wiki-compiler.ts", templateRoot), "utf8"),
    readFile(new URL("drizzle/0002_compiled_wiki.sql", templateRoot), "utf8"),
    readFile(new URL("drizzle/0003_governance_permissions.sql", templateRoot), "utf8"),
    readFile(new URL("app/api/transcriptions/route.ts", templateRoot), "utf8"),
    readFile(new URL("app/WorkspaceApp.tsx", templateRoot), "utf8"),
  ]);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS search_chunks/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS transcription_jobs/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS wiki_pages/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS conversation_access/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS knowledge_governance/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS research_feedback/);
  assert.match(searchRoute, /searchConversations/);
  assert.match(searchRoute, /authorizedConversationIds/);
  assert.match(searchRoute, /knowledgeDomains/);
  assert.match(askRoute, /buildResearchSynthesis/);
  assert.match(streamRoute, /理解问题/);
  assert.match(streamRoute, /检查访问权限/);
  assert.match(streamRoute, /交叉核验/);
  assert.match(streamRoute, /MiniMax M3/);
  assert.match(minimax, /MINIMAX_API_KEY/);
  assert.match(minimax, /MiniMax-M3/);
  assert.match(minimax, /不得暴露思维链/);
  assert.match(minimax, /text 字段中禁止书写/);
  assert.doesNotMatch(minimax, /sk-[A-Za-z0-9]/);
  assert.match(workflowRoute, /knowledge-gap/);
  assert.match(workflowRoute, /research_feedback/);
  assert.match(wikiRoute, /filed_from_research_assistant/);
  assert.match(wikiCompiler, /compileWiki/);
  assert.match(wikiCompiler, /auditWiki/);
  assert.match(wikiCompiler, /\[\[/);
  assert.match(migration, /PRAGMA optimize/);
  assert.match(governanceMigration, /conversation_access/);
  assert.match(governanceMigration, /knowledge_governance/);
  assert.match(transcriptionRoute, /gpt-4o-transcribe-diarize/);
  assert.match(transcriptionRoute, /chunking_strategy/);
  assert.match(transcriptionRoute, /configuration_required/);
  assert.match(workspace, /权限感知索引/);
  assert.match(workspace, /等待管理员配置 ASR/);
  assert.match(workspace, /研究检索/);
  assert.match(workspace, /增量编译 Wiki/);
  assert.match(workspace, /结论/);
  assert.match(workspace, /支持证据/);
  assert.match(workspace, /反证与未决/);
  assert.match(workspace, /停止生成/);
  assert.match(workspace, /引用原文定位/);
  assert.match(workspace, /buildLocalResearchAnswer/);
  assert.match(workspace, /知识健康/);
});

test("keeps the product metadata, persistence, and typography configured", async () => {
  const [page, layout, css, hosting, packageJson] = await Promise.all([
    readFile(new URL("app/page.tsx", templateRoot), "utf8"),
    readFile(new URL("app/layout.tsx", templateRoot), "utf8"),
    readFile(new URL("app/globals.css", templateRoot), "utf8"),
    readFile(new URL(".openai/hosting.json", templateRoot), "utf8"),
    readFile(new URL("package.json", templateRoot), "utf8"),
  ]);
  assert.match(page, /WorkspaceApp/);
  assert.match(layout, /砚知 · 买方投研知识库/);
  assert.match(layout, /og\.png/);
  assert.match(css, /Times New Roman/);
  assert.match(css, /SimSun/);
  assert.doesNotMatch(css, /linear-gradient|radial-gradient|#(?:7c3aed|8b5cf6|a855f7)/i);
  assert.match(hosting, /"d1": "DB"/);
  assert.match(hosting, /"r2": "AUDIO"/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
});

test("uses the provided Alibaba FY2027 Q1 transcript as the only seeded case", async () => {
  const [sourceHtml, knowledgeData, workspace, conversationsRoute, importRoute, schema, migration] = await Promise.all([
    readFile(new URL("../阿里巴巴[BABA.N]2027财年第一季度业绩交流会.html", import.meta.url), "utf8"),
    readFile(new URL("lib/knowledge-data.ts", templateRoot), "utf8"),
    readFile(new URL("app/WorkspaceApp.tsx", templateRoot), "utf8"),
    readFile(new URL("app/api/conversations/route.ts", templateRoot), "utf8"),
    readFile(new URL("app/api/imports/earnings-call/route.ts", templateRoot), "utf8"),
    readFile(new URL("db/schema.ts", templateRoot), "utf8"),
    readFile(new URL("drizzle/0004_earnings_call_knowledge.sql", templateRoot), "utf8"),
  ]);

  assert.match(sourceHtml, /Alibaba Group Holding Limited/);
  assert.match(sourceHtml, /Q1 2027 Earnings Call August 20, 2026/);
  assert.match(sourceHtml, /Alibaba Cloud's external revenue grew 45%/);
  assert.match(knowledgeData, /id: "baba-fy2027-q1-earnings-call"/);
  assert.match(knowledgeData, /date: "2026-08-20"/);
  assert.match(knowledgeData, /tickers: \["阿里巴巴", "BABA\.N"\]/);
  assert.doesNotMatch(`${knowledgeData}\n${workspace}`, /北方华创|科伦博泰|紫金矿业|万辰集团|海光信息|德赛西威/);
  assert.match(conversationsRoute, /loadStructuredKnowledge/);
  assert.doesNotMatch(conversationsRoute, /replaceLegacyDemoData|seedConversations/);
  assert.match(importRoute, /parseEarningsCallHtml/);
  assert.match(importRoute, /SHA-256/);
  assert.match(importRoute, /earnings_call_html_imported/);
  assert.match(importRoute, /access\.localPreview && !isLocalHost/);
  assert.match(importRoute, /请登录后再导入来源文件/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS source_documents/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS transcript_segments/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS knowledge_claims/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS knowledge_entities/);
  assert.match(migration, /idx_knowledge_claims_metric_period/);
  assert.match(workspace, /导入业绩会 HTML/);
  assert.match(workspace, /披露事实/);
  assert.match(workspace, /管理层指引与判断/);
});

test("structures a pasted investment conversation without an external model", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("structure-test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  const response = await worker.fetch(
    new Request("http://localhost/api/structure", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ transcript: "阿里巴巴[BABA.N] 2027财年第一季度业绩交流会。管理层表示云外部收入同比增长45%，AI相关产品收入连续第12个季度实现三位数增长。管理层预计云收入未来数季继续加速。" }),
    }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.modelUsed, false);
  assert.equal(body.suggestion.industry, "互联网与云计算");
  assert.deepEqual(body.suggestion.tickers, ["阿里巴巴", "BABA.N"]);
  assert.equal(body.suggestion.scene, "业绩交流会");
  assert.equal(body.suggestion.participant, "公司管理层人士");
  assert.match(body.suggestion.title, /^互联网与云计算：/);
  assert.ok(body.suggestion.statements.length >= 2);
  assert.ok(body.suggestion.statements.some((item) => item.type === "预测"));
  assert.ok(body.suggestion.statements.every((item) => item.evidence));
});
