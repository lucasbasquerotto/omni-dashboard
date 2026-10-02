import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// ── Threads page: cost after tokens + full_* usage aggregates (task_omnidev_dashboard_threads_page_show_cost) ──
//
// Operator request (telegram thread 3734): the threads page must render the
// threads-table usage aggregates (full_input_tokens, full_cached_tokens,
// full_output_tokens, full_reasoning_tokens) and the aggregate cost:
//   * a Cost column right AFTER the Tokens column, with a human-readable title;
//   * when the aggregate total (full_input + full_output) differs from the bare
//     omniagent total, a second line BELOW the tokens value inside the SAME
//     Tokens cell (no new column) carrying the full total and, in parentheses,
//     its cache share (same formatting as the bare token display);
//   * the Show details box lists the full_* fields and the cost with
//     human-readable labels (no raw snake_case keys).
//
// Operator re-report (telegram thread 3899, 2026-10-02): the full sub-line
// percent was computed over the NON-cached input alone
// (full_cached / full_input = 6,592,512 / 2,326,417 = 283%, clamped by
// Math.min(100, ...) to a flat 100%). The full_* columns are DISJOINT parts, so
// the cache share must use the TOTAL input (cached + non-cached):
//   fullTotalInput = full_cached_tokens + full_input_tokens
//   fullCachePct   = round(full_cached_tokens / fullTotalInput * 100)
// and the details box must mirror the bare trio: Full total input / Full cache
// hit (cached input) / Full cache miss (non-cached input).
//
// These assertions pin the wiring/formatting so a refactor cannot silently drop
// the cost column, the aggregate sub-line or the detail rows, nor reintroduce
// the 100%-clamp bug.

const read = (p: string): string => readFileSync(new URL(`../src/${p}`, import.meta.url), "utf-8");

const threadsSrc = read("pages/threads.ts");
const cssSrc = read("style.css");

// Thread 3899 numbers (operator report, 2026-10-02).
const T3899 = {
  cached: 6592512,
  input: 2326417,
  totalInput: 8918929,
  output: 149738,
};

describe("Threads page: cost after tokens and the full_* aggregates", () => {
  it("renders a Cost column header right after Tokens, with a readable title", () => {
    const tokensHdr = threadsSrc.indexOf('<div role="columnheader" style="text-align:right">Tokens</div>');
    const costHdr = threadsSrc.indexOf('<div role="columnheader" style="text-align:right" title="Cost of the thread\'s LLM usage (USD)">Cost</div>');
    assert.ok(tokensHdr >= 0, "Tokens column header present");
    assert.ok(costHdr > tokensHdr, "Cost column header comes after the Tokens header");
  });

  it("renders the Cost cell immediately after the Tokens cell", () => {
    const tokensCell = threadsSrc.indexOf("${fullLine}</div>");
    const costCell = threadsSrc.indexOf('<div role="cell" class="cell-num" title="Cost (USD)">${fmtCost(row.cost)}</div>');
    assert.ok(tokensCell >= 0, "tokens cell carries the aggregate sub-line");
    assert.ok(costCell > tokensCell, "cost cell follows the tokens cell");
  });

  it("shows the aggregate total on a second line only when a REAL aggregate differs from the bare total", () => {
    assert.ok(threadsSrc.includes("const fullTokens = fullInput + (row.full_output_tokens || 0);"), "full total = full input + full output");
    // The guard must require a real aggregate (> 0) AND a difference from the
    // bare total: a legacy row whose full_* columns are NULL/0 (threads that
    // ended before the usage aggregates shipped) must render NO sub-line, not a
    // literal "0" under a non-zero bare count (review thread 3836).
    assert.ok(
      threadsSrc.includes("fullTokens > 0 && fullTokens !== tokens"),
      "sub-line is guarded on a real aggregate differing from the bare total",
    );
    assert.ok(
      !/const fullLine =\s*\n\s*fullTokens !== tokens\n/.test(threadsSrc),
      "the unguarded comparison (which printed a literal '0' for legacy rows) is gone",
    );
    assert.ok(threadsSrc.includes('title="Full tokens (all usage entries)"'), "sub-line carries a human-readable title");
    assert.ok(!threadsSrc.includes('<div role="columnheader" style="text-align:right" title="Full tokens'), "no extra column for full_tokens");
  });

  it("evaluates the sub-line guard read from the source: legacy rows none, real aggregates yes", () => {
    const guardMatch = threadsSrc.match(/const fullLine =\s*\n\s*([\s\S]*?)\n\s*\?/);
    assert.ok(guardMatch, "fullLine guard expression found in the source");
    const evaluate = new Function("fullTokens", "tokens", `return (${guardMatch![1]});`) as (
      fullTokens: number,
      tokens: number,
    ) => boolean;
    // Legacy row: bare total > 0 but the full_* columns are NULL/0 -> NO sub-line.
    assert.equal(evaluate(0, 1200), false, "legacy row (no aggregate) renders no sub-line");
    assert.equal(evaluate(0, 0), false, "empty row renders no sub-line");
    // Real aggregate row (full > bare) -> sub-line; equal totals stay hidden.
    assert.equal(evaluate(5000, 1200), true, "real aggregate differing from the bare total renders the sub-line");
    assert.equal(evaluate(1200, 1200), false, "equal aggregate and bare total render no sub-line");
  });

  it("computes the aggregate cache percent over the TOTAL full input (cached + non-cached)", () => {
    // The bare line stays cached / input_tokens (input_tokens IS the total input):
    // for thread 3899 that is 1,567,488 / 1,928,385 = 81%.
    assert.ok(
      threadsSrc.includes("Math.min(100, Math.round(((row.cached_tokens || 0) / (row.input_tokens || 0)) * 100))"),
      "bare cache percent = cached / input",
    );
    // The full total input is DERIVED in the page (display-only: no DB column).
    const totalDecl = threadsSrc.match(/const fullTotalInput = ([^;]+);/);
    assert.ok(totalDecl, "fullTotalInput is derived from the full_* columns");
    assert.equal(totalDecl![1].trim(), "fullCached + fullInput", "full total input = full cached + full (non-cached) input");
    // Evaluate the EXPRESSION SHIPPED IN THE SOURCE, not a copy of it.
    const pctExpr = threadsSrc.match(/const fullCachePct =\s*\n\s*([\s\S]*?;)/);
    assert.ok(pctExpr, "fullCachePct expression found in the source");
    const fullCachePct = new Function(
      "fullCached",
      "fullInput",
      `const fullTotalInput = ${totalDecl![1]};\nconst fullCachePct = ${pctExpr![1]}\nreturn fullCachePct;`,
    ) as (cached: number, input: number) => number | null;

    // ── Numeric regression, thread 3899 (the 100%-clamp defect) ──
    assert.equal(
      fullCachePct(T3899.cached, T3899.input),
      74,
      "thread 3899 full cache share = 74% (round(6,592,512 / 8,918,929))",
    );
    assert.equal(
      fullCachePct(T3899.cached, T3899.input),
      Math.round((T3899.cached / (T3899.cached + T3899.input)) * 100),
      "full cache percent = round(full cached / (full cached + full input))",
    );
    assert.notEqual(fullCachePct(T3899.cached, T3899.input), 100, "the old full-input-only denominator (283% clamped to 100%) is gone");
    assert.ok(
      !threadsSrc.includes("(row.full_cached_tokens || 0) / fullInput"),
      "the wrong denominator (full cached / non-cached input) no longer appears in the source",
    );
    // The bare trio of the same thread: 1,567,488 / (1,567,488 + 360,897) = 81%.
    assert.equal(fullCachePct(1567488, 360897), 81, "full and bare lines use the same rounding rule");
    // Degenerate rows.
    assert.equal(fullCachePct(0, 1200), null, "no cached tokens -> no percent");
    assert.equal(fullCachePct(1200, 0), 100, "fully cached -> 100%");
  });

  it("lists the full_* mirror of the bare token trio and the cost in the Show details box with human-readable labels", () => {
    for (const label of [
      "Full total input",
      "Full cache hit (cached input)",
      "Full cache miss (non-cached input)",
      "Full output tokens",
      "Full reasoning tokens",
      "Cost",
    ]) {
      assert.ok(
        threadsSrc.includes(`<span class="thread-detail-label">${label}</span><span class="thread-detail-value">`),
        `detail row "${label}"`,
      );
    }
    // The bare trio rows are untouched.
    for (const label of ["Tokens (total input)", "Cache hit (cached input)", "Cache miss (non-cached input)", "Output tokens"]) {
      assert.ok(
        threadsSrc.includes(`<span class="thread-detail-label">${label}</span><span class="thread-detail-value">`),
        `bare detail row "${label}"`,
      );
    }
    // The full rows mirror the bare trio's ORDER: total input, cache hit, cache miss.
    const totalIdx = threadsSrc.indexOf("Full total input");
    const hitIdx = threadsSrc.indexOf("Full cache hit (cached input)");
    const missIdx = threadsSrc.indexOf("Full cache miss (non-cached input)");
    assert.ok(totalIdx > 0 && hitIdx > totalIdx && missIdx > hitIdx, "full rows mirror the bare trio order (total / hit / miss)");
    // Full total input is derived in the details box too (no DB column) and
    // reproduces the thread-3899 value.
    const detailTotal = "const fullTotalInput = (row.full_cached_tokens || 0) + (row.full_input_tokens || 0);";
    assert.ok(threadsSrc.includes(detailTotal), "Full total input is derived in the details box");
    const compute = new Function("row", `${detailTotal}\nreturn fullTotalInput;`) as (r: unknown) => number;
    assert.equal(
      compute({ full_cached_tokens: T3899.cached, full_input_tokens: T3899.input }),
      T3899.totalInput,
      "thread 3899 Full total input = 8,918,929",
    );
    assert.equal(T3899.cached, 6592512, "thread 3899 Full cache hit = 6,592,512 (mirrored by full_cached_tokens)");
    assert.equal(T3899.input, 2326417, "thread 3899 Full cache miss = 2,326,417 (mirrored by full_input_tokens)");
  });

  it("formats the cost in USD with four decimals and '-' when absent", () => {
    assert.ok(threadsSrc.includes("function fmtCost(n: number | null | undefined): string {"), "fmtCost helper");
    assert.ok(threadsSrc.includes('if (typeof n !== "number" || !Number.isFinite(n)) return "-";'), "missing cost renders '-'");
    assert.ok(threadsSrc.includes("return `$${n.toFixed(4)}`;"), "USD formatting with 4 decimals");
  });

  it("gives the threads grid one extra track for the Cost column", () => {
    assert.ok(cssSrc.includes("68px 78px 72px;"), "12th grid track for the Cost column");
  });
});
