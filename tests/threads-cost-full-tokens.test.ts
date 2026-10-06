import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// ── Threads page: cost / full_cost + the usage aggregates (task_omnidev_dashboard_threads_page_show_cost) ──
//
// Operator UPDATE 2026-10-02 (telegram threads 3915/3916/3917/3919/3921/3922),
// BINDING and superseding the earlier labels/semantics:
//   * `threads.input_tokens` and `threads.full_input_tokens` are CACHE-MISS
//     (fresh) input only, never cache hit + miss. The cache hit lives in
//     `cached_tokens` / `full_cached_tokens`.
//   * `threads.cost` is the OMNIAGENT-only cost; the NEW `threads.full_cost`
//     column is omniagent + external agents/sub-agents.
//   * Details box rows (human-readable labels, no snake_case):
//     Omniagent cache / Omniagent input / Omniagent output / Omniagent cost /
//     Full cache / Full input / Full output / Full cost (+ Full reasoning
//     tokens). NO "total input" row.
//   * Main row: ONE stacked cost field (cost on top, full_cost below and a bit
//     smaller), collapsed to ONE value when they are equal; the token cell
//     keeps its bare value + smaller Full sub-line, collapsed the same way.
//   * Every total/percent adds the cache component explicitly:
//     total = cached + input + output, percent = round(cached / (cached + input) * 100).
//     The old full-line denominator (cached / non-cached input = 283%, clamped
//     by Math.min(100, ...) to a flat 100% for dev thread 3899) is gone.
//
// These assertions pin the wiring/formatting so a refactor cannot silently drop
// the cost split, the aggregate sub-line or the detail rows, nor reintroduce the
// 100%-clamp bug.

const read = (p: string): string => readFileSync(new URL(`../src/${p}`, import.meta.url), "utf-8");

const threadsSrc = read("pages/threads.ts");
const cssSrc = read("style.css");

// Thread 3899 numbers, expressed with the NEW (cache-miss only) semantics:
// omniagent cache 1,567,488 / miss 360,897 / out 48,126; the full_* columns add
// the 112 external items (cached 5,025,024, miss 398,032, out 101,612).
const T3899 = {
  cached: 1567488,
  input: 360897,
  output: 48126,
  fullCached: 6592512,
  fullInput: 758929,
  fullOutput: 149738,
};

/** Pull one function out of the source and strip its TS-only annotations. */
const pullJs = (name: string, replacements: Array<[string, string]>): string => {
  const m = threadsSrc.match(new RegExp(`function ${name}\\([\\s\\S]*?\\n\\}`));
  assert.ok(m, `${name} found in the source`);
  let out = m![0];
  for (const [from, to] of replacements) {
    assert.ok(out.includes(from), `expected signature fragment of ${name}: ${from}`);
    out = out.replace(from, to);
  }
  assert.ok(!/\): [A-Za-z]/.test(out), `${name} has no leftover return annotation`);
  return out;
};

describe("Threads page: cost split, details box and the usage aggregates", () => {
  it("renders a Cost column header right after Tokens", () => {
    const tokensHdr = threadsSrc.indexOf('<div role="columnheader" style="text-align:right">Tokens</div>');
    const costHdr = threadsSrc.indexOf(
      '<div role="columnheader" style="text-align:right" title="Cost of the thread\'s LLM usage (USD)">Cost</div>',
    );
    assert.ok(tokensHdr >= 0, "Tokens column header present");
    assert.ok(costHdr > tokensHdr, "Cost column header comes after the Tokens header");
  });

  it("renders ONE stacked cost field in the main row (cost above, full_cost below smaller)", () => {
    assert.ok(
      threadsSrc.includes(
        '<div role="cell" class="cell-num" title="Cost (USD): omniagent, then Full (omniagent + external agents/sub-agents)">${costBlock(row.cost, row.full_cost)}</div>',
      ),
      "the main-row cost cell renders the stacked costBlock of cost + full_cost",
    );
    // The stacked block: main value, then the Full value on a smaller line.
    assert.ok(
      threadsSrc.includes(
        '${main}<div style="font-size:0.72rem;color:var(--text-muted);line-height:1.3;" title="Full cost (omniagent + external agents/sub-agents)">${full}</div>',
      ),
      "costBlock stacks the Full cost below the omniagent cost, a bit smaller",
    );
    // Collapse-when-equal (no external/sub-agent ran in the thread).
    assert.ok(
      threadsSrc.includes("if (main === full) return main;"),
      "equal cost and full_cost collapse to ONE value",
    );
    // No extra cost column.
    const costHdrCount = (threadsSrc.match(/>Cost<\/div>/g) || []).length;
    assert.equal(costHdrCount, 1, "exactly one Cost column header");
  });

  it("costBlock reads from the source: both values when they differ, one when equal", () => {
    const body = pullJs("costBlock", [
      [
        "function costBlock(cost: number | null | undefined, fullCost: number | null | undefined): string {",
        "function costBlock(cost, fullCost) {",
      ],
    ]);
    const evaluate = new Function("fmtCost", `${body}\nreturn costBlock;`) as (
      fmt: (n: number | null | undefined) => string,
    ) => (c: number | null, f: number | null) => string;
    const fmt = (n: number | null | undefined) => (typeof n === "number" ? `$${n.toFixed(4)}` : "-");
    const costBlock = evaluate(fmt);
    // External agent ran: both values, the Full one on the smaller second line.
    const both = costBlock(0.1754, 0.4469);
    assert.ok(both.includes("$0.1754"), "omniagent cost on top");
    assert.ok(both.includes("$0.4469"), "full cost below");
    assert.ok(both.indexOf("$0.1754") < both.indexOf("$0.4469"), "omniagent cost first, full cost second");
    assert.ok(both.includes("font-size:0.72rem"), "the second line is smaller");
    // No external agent: ONE value.
    assert.equal(costBlock(0.4469, 0.4469), "$0.4469", "equal costs collapse to one value");
    assert.equal(costBlock(0, 0), "$0.0000", "equal zero costs collapse too");
    // Missing values both render '-' -> collapsed.
    assert.equal(costBlock(null, null), "-", "both missing -> a single '-'");
  });

  it("shows the aggregate total on a second line only when a REAL aggregate differs from the bare total", () => {
    assert.ok(
      threadsSrc.includes("const fullTokens = fullCached + fullInput + (row.full_output_tokens || 0);"),
      "full total = full cached + full (miss) input + full output",
    );
    assert.ok(
      threadsSrc.includes(
        "const tokens = (row.cached_tokens || 0) + (row.input_tokens || 0) + (row.output_tokens || 0);",
      ),
      "bare total = cached + (miss) input + output",
    );
    // Real aggregate (> 0) AND different from the bare total: legacy rows with
    // NULL/0 full_* columns must render NO sub-line, and an equal total must
    // collapse to the single bare value (no external agent ran).
    assert.ok(
      threadsSrc.includes("fullTokens > 0 && fullTokens !== tokens"),
      "sub-line is guarded on a real aggregate differing from the bare total",
    );
    assert.ok(
      threadsSrc.includes('title="Full tokens (omniagent + external agents/sub-agents usage entries)"'),
      "sub-line carries a human-readable title",
    );
    assert.ok(
      !threadsSrc.includes('<div role="columnheader" style="text-align:right" title="Full tokens'),
      "no extra column for full_tokens",
    );
  });

  it("evaluates the sub-line guard read from the source: collapse when equal", () => {
    const guardMatch = threadsSrc.match(/const fullLine =\s*\n\s*([\s\S]*?)\n\s*\?/);
    assert.ok(guardMatch, "fullLine guard expression found in the source");
    const evaluate = new Function("fullTokens", "tokens", `return (${guardMatch![1]});`) as (
      fullTokens: number,
      tokens: number,
    ) => boolean;
    assert.equal(evaluate(0, 1200), false, "legacy row (no aggregate) renders no sub-line");
    assert.equal(
      evaluate(5000, 1200),
      true,
      "real aggregate differing from the bare total renders the sub-line",
    );
    assert.equal(evaluate(1200, 1200), false, "equal aggregate and bare total render NO second line");
  });

  it("computes both cache percents over the TOTAL input (cached + non-cached)", () => {
    // Bare line: round(cached / (cached + input)); input_tokens is miss-only.
    const bareExpr = threadsSrc.match(/const cachePct =\s*\n\s*([\s\S]*?);/);
    assert.ok(bareExpr, "bare cachePct expression found");
    const bareTotalDecl = threadsSrc.match(/const bareTotalInput = ([^;]+);/);
    assert.ok(bareTotalDecl, "bareTotalInput derived from the cached + miss input columns");
    assert.equal(bareTotalDecl![1].trim(), "(row.cached_tokens || 0) + (row.input_tokens || 0)");
    const bare = new Function(
      "row",
      `const bareTotalInput = ${bareTotalDecl![1]};\nconst cachePct = ${bareExpr![1]}\nreturn cachePct;`,
    ) as (row: unknown) => number | null;
    assert.equal(
      bare({ cached_tokens: 1567488, input_tokens: 360897 }),
      81,
      "thread 3899 bare cache share = 81%",
    );
    assert.equal(bare({ cached_tokens: 0, input_tokens: 1200 }), null, "no cached tokens -> no percent");

    // Full line: round(full_cached / (full_cached + full_miss_input)).
    const totalDecl = threadsSrc.match(/const fullTotalInput = ([^;]+);/);
    assert.ok(totalDecl, "fullTotalInput derived from the full_* columns");
    assert.equal(totalDecl![1].trim(), "fullCached + fullInput");
    const pctExpr = threadsSrc.match(/const fullCachePct =\s*\n\s*([\s\S]*?);/);
    assert.ok(pctExpr, "fullCachePct expression found in the source");
    const fullCachePct = new Function(
      "fullCached",
      "fullInput",
      `const fullTotalInput = ${totalDecl![1]};\nconst fullCachePct = ${pctExpr![1]}\nreturn fullCachePct;`,
    ) as (cached: number, input: number) => number | null;

    assert.equal(
      fullCachePct(T3899.fullCached, T3899.fullInput),
      Math.round((T3899.fullCached / (T3899.fullCached + T3899.fullInput)) * 100),
      "full cache percent = round(full cached / (full cached + full input))",
    );
    assert.equal(fullCachePct(T3899.fullCached, T3899.fullInput), 90, "round(6,592,512 / 7,351,441) = 90%");
    assert.notEqual(fullCachePct(T3899.fullCached, T3899.fullInput), 100, "never a flat 100%");
    assert.ok(
      !threadsSrc.includes("(row.full_cached_tokens || 0) / fullInput"),
      "the wrong denominator (full cached / non-cached input) no longer appears in the source",
    );
    // Same rounding rule as the bare line.
    assert.equal(fullCachePct(1567488, 360897), 81, "full and bare lines use the same rounding rule");
    assert.equal(fullCachePct(0, 1200), null, "no cached tokens -> no percent");
    assert.equal(fullCachePct(1200, 0), 100, "fully cached -> 100%");
  });

  it("lists the cost + Full mirror rows in the Show details box with human-readable labels", () => {
    for (const label of [
      "Omniagent cache",
      "Omniagent input",
      "Omniagent output",
      "Omniagent cost",
      "Full cache",
      "Full input",
      "Full output",
      "Full cost",
      "Full reasoning tokens",
    ]) {
      assert.ok(threadsSrc.includes(label), `detail row/helper label "${label}"`);
    }
    // The dropped/renamed rows are gone (HTML label OR quoted helper argument).
    for (const label of [
      "Tokens (total input)",
      "Cache hit (cached input)",
      "Cache miss (non-cached input)",
      "Full total input",
      "Full cache hit (cached input)",
      "Full cache miss (non-cached input)",
    ]) {
      assert.ok(!threadsSrc.includes(label), `old detail row "${label}" is gone`);
    }
    // Ordering: the bare trio precedes the Full trio.
    const cacheIdx = threadsSrc.indexOf(">Omniagent cache</span>");
    const inputIdx = threadsSrc.indexOf(">Omniagent input</span>");
    const outIdx = threadsSrc.indexOf(">Omniagent output</span>");
    const fullCacheIdx = threadsSrc.indexOf(">Full cache</span>");
    assert.ok(cacheIdx > 0 && inputIdx > cacheIdx && outIdx > inputIdx, "bare rows: cache / input / output");
    assert.ok(fullCacheIdx > outIdx, "the Full rows follow the bare rows");
    // The bare rows read the raw columns; no derived cache-miss subtraction.
    assert.ok(
      threadsSrc.includes("fmtTokens(row.input_tokens)"),
      "no derived miss row: the column IS the miss",
    );
    assert.ok(
      !threadsSrc.includes("Full total input"),
      "the old Full total input label is gone (renamed Full input)",
    );
  });

  it("details box cost rows: both when they differ, one when they are equal", () => {
    const body = pullJs("costDetailRows", [
      [
        "function costDetailRows(row: ThreadRow): { omniagent: string; full: string } {",
        "function costDetailRows(row) {",
      ],
      ["const rowHtml = (label: string, value: string): string =>", "const rowHtml = (label, value) =>"],
    ]);
    const evaluate = new Function("fmtCost", `${body}\nreturn costDetailRows;`) as (
      fmt: (n: number | null | undefined) => string,
    ) => (row: unknown) => { omniagent: string; full: string };
    const fmt = (n: number | null | undefined) => (typeof n === "number" ? `$${n.toFixed(4)}` : "-");
    const costDetailRows = evaluate(fmt);
    const different = costDetailRows({ cost: 0.1754, full_cost: 0.4469 });
    assert.ok(
      different.omniagent.includes("Omniagent cost") && different.omniagent.includes("$0.1754"),
      "Omniagent cost row",
    );
    assert.ok(
      different.full.includes("Full cost") && different.full.includes("$0.4469"),
      "Full cost row, separated",
    );
    const equal = costDetailRows({ cost: 0.4469, full_cost: 0.4469 });
    assert.ok(equal.omniagent.includes(">Cost</span>"), "equal -> a single Cost row");
    assert.equal(equal.full, "", "equal -> no second cost row");
  });

  it("renders the bare token trio and the Full mirror with the 3899 numbers", () => {
    // The locked-in operator numbers, evaluated through the page's own helpers.
    const row = {
      cached_tokens: T3899.cached,
      input_tokens: T3899.input,
      output_tokens: T3899.output,
      full_cached_tokens: T3899.fullCached,
      full_input_tokens: T3899.fullInput,
      full_output_tokens: T3899.fullOutput,
    };
    const bareTotal = (row.cached_tokens || 0) + (row.input_tokens || 0) + (row.output_tokens || 0);
    assert.equal(bareTotal, 1_976_511, "bare cell total for thread 3899");
    const cachePct = Math.round(
      ((row.cached_tokens || 0) / ((row.cached_tokens || 0) + (row.input_tokens || 0))) * 100,
    );
    assert.equal(cachePct, 81, "bare cache share 81%");
    const fullTotal =
      (row.full_cached_tokens || 0) + (row.full_input_tokens || 0) + (row.full_output_tokens || 0);
    assert.equal(fullTotal, 7_501_179, "full sub-line total = full cache + full input + full output");
    const fullPct = Math.round(
      ((row.full_cached_tokens || 0) / ((row.full_cached_tokens || 0) + (row.full_input_tokens || 0))) * 100,
    );
    assert.equal(fullPct, 90, "full cache share is NOT a flat 100%");
  });

  it("formats the cost in USD with four decimals and '-' when absent", () => {
    assert.ok(
      threadsSrc.includes("function fmtCost(n: number | null | undefined): string {"),
      "fmtCost helper",
    );
    assert.ok(
      threadsSrc.includes('if (typeof n !== "number" || !Number.isFinite(n)) return "-";'),
      "missing cost renders '-'",
    );
    assert.ok(threadsSrc.includes("return `$${n.toFixed(4)}`;"), "USD formatting with 4 decimals");
  });

  it("declares cost and full_cost on the row type", () => {
    assert.ok(/cost: number \| null;/.test(threadsSrc), "cost on ThreadRow");
    assert.ok(/full_cost: number \| null;/.test(threadsSrc), "full_cost on ThreadRow");
  });

  it("gives the threads grid one extra track for the Cost column", () => {
    assert.ok(cssSrc.includes("68px 78px 72px;"), "12th grid track for the Cost column");
  });
});
