import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parseEarningsCallHtml } from "../lib/earnings-call.ts";
import { compileWiki } from "../lib/wiki-compiler.ts";

const fixtures = [
  {
    filename: "阿里巴巴[BABA.N]2027财年第一季度业绩交流会.html",
    id: "baba-fy2027-q1-earnings-call",
    title: "阿里巴巴 2027 财年第一季度业绩交流会",
    company: "阿里巴巴",
    segments: 23,
    claims: 9,
    metric: "group_revenue",
    value: 2690,
  },
  {
    filename: "英伟达[NVDA.O]2027财年第二季度业绩交流会.html",
    id: "nvda-fy2027-q2-earnings-call",
    title: "英伟达 2027 财年第二季度业绩交流会",
    company: "英伟达",
    segments: 31,
    claims: 8,
    metric: "data_center_revenue",
    value: 89,
  },
  {
    filename: "厦门钨业[600549.SH]2026年半年度业绩说明会.html",
    id: "600549-2026-h1-results-briefing",
    title: "厦门钨业 2026 年半年度业绩说明会",
    company: "厦门钨业",
    segments: 8,
    claims: 9,
    metric: "net_profit_attributable",
    value: 22.01,
  },
  {
    filename: "MINIMAX-WP[0100.HK]2026年中期业绩交流会.html",
    id: "0100-2026-h1-earnings-call",
    title: "MiniMax 2026 年中期业绩交流会",
    company: "MiniMax",
    segments: 36,
    claims: 10,
    metric: "arr",
    value: 800,
  },
];

test("parses all earnings-call fixtures into traceable company knowledge", async () => {
  const parsedRecords = [];
  for (const fixture of fixtures) {
    const sourcePath = new URL(`../${fixture.filename}`, import.meta.url);
    const parsed = parseEarningsCallHtml(await readFile(sourcePath, "utf8"), fixture.filename);
    parsedRecords.push(parsed.record);

    assert.equal(parsed.record.id, fixture.id);
    assert.equal(parsed.record.title, fixture.title);
    assert.equal(parsed.entity.displayName, fixture.company);
    assert.equal(parsed.segments.length, fixture.segments);
    assert.equal(parsed.claims.length, fixture.claims);
    assert.equal(parsed.claims.find((claim) => claim.metricKey === fixture.metric)?.numericValue, fixture.value);
    assert.ok(parsed.segments.every((segment) => segment.anchor && segment.speaker && segment.content));
    assert.ok(parsed.claims.every((claim) => claim.evidenceAnchor && claim.evidenceExcerpt));
  }

  const wiki = compileWiki(parsedRecords);
  const companyPages = wiki.pages.filter((page) => page.pageType === "company");
  assert.deepEqual(companyPages.map((page) => page.title).sort(), ["MiniMax", "厦门钨业", "英伟达", "阿里巴巴"].sort());
  assert.doesNotMatch(wiki.pages.map((page) => `${page.title}\n${page.contentMd}`).join("\n"), /\[\[(?:BABA\.N|9988\.HK|NVDA\.O|600549\.SH|0100\.HK)\]\]/);
  assert.match(wiki.pages.find((page) => page.pageType === "index")?.summary ?? "", /4 个公司/);
});

test("rejects an unrelated HTML document", () => {
  assert.throws(() => parseEarningsCallHtml("<html><body>not a transcript</body></html>"), /未识别到业绩交流会标题/);
});
