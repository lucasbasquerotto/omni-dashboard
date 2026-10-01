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
// These assertions pin the wiring/formatting so a refactor cannot silently drop
// the cost column, the aggregate sub-line or the detail rows.

const read = (p: string): string => readFileSync(new URL(`../src/${p}`, import.meta.url), "utf-8");

const threadsSrc = read("pages/threads.ts");
const cssSrc = read("style.css");

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

  it("formats the aggregate cache percent like the omniagent token display (cached / input)", () => {
    const bare = threadsSrc.indexOf('Math.min(100, Math.round(((row.cached_tokens || 0) / (row.input_tokens || 0)) * 100))');
    const full = threadsSrc.indexOf("Math.min(100, Math.round(((row.full_cached_tokens || 0) / fullInput) * 100))");
    assert.ok(bare >= 0, "bare cache percent = cached / input");
    assert.ok(full >= 0, "aggregate cache percent = full cached / full input");
  });

  it("lists every full_* field and the cost in the Show details box with human-readable labels", () => {
    for (const label of ["Full input tokens", "Full cached tokens", "Full output tokens", "Full reasoning tokens", "Cost"]) {
      assert.ok(
        threadsSrc.includes(`<span class="thread-detail-label">${label}</span><span class="thread-detail-value">`),
        `detail row "${label}"`,
      );
    }
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
