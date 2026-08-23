import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// ── Database page (src/pages/database.ts + src/style.css) ──
// Regression tests for: hidden-override (Loading… always visible), pagination
// placement for 0-row results, and the Run button not looking like a button.

const page = readFileSync(new URL("../src/pages/database.ts", import.meta.url), "utf-8");
const css = readFileSync(new URL("../src/style.css", import.meta.url), "utf-8");

describe("Database page fixes", () => {
  it("Loading indicator is hidden by default and only shown during a query", () => {
    assert.ok(
      page.includes('<div id="db-loading" class="loading" hidden>Loading…</div>'),
      "db-loading starts with the hidden attribute",
    );
    assert.ok(page.includes('el("db-loading").hidden = false'), "loading is revealed when a query starts");
    assert.ok(
      page.includes('el("db-loading").hidden = true'),
      "loading is hidden again when the query finishes",
    );
    assert.ok(
      css.includes("[hidden] {\n  display: none !important;\n}"),
      "CSS makes the hidden attribute win over .loading's display:flex",
    );
  });

  it("pagination renders at the top and bottom even when a query returns 0 rows", () => {
    assert.ok(page.includes('id="db-pagination-top"'), "top pagination slot");
    assert.ok(page.includes('id="db-pagination-bottom"'), "bottom pagination slot");
    assert.ok(
      page.includes(
        "// renderPagination is only called after a query result (renderResult), so\n  // always show it",
      ),
      "pagination is always shown after a query, including 0-row results",
    );
    assert.ok(page.includes("const show = true;"), "pagination no longer hidden for 0-row results");
  });

  it("Run button has a visible purple background (--accent defined)", () => {
    assert.ok(page.includes('id="db-run-sql" class="btn btn-primary"'), "Run uses btn btn-primary");
    assert.ok(
      css.includes("--accent: #8b5cf6;"),
      "the --accent variable is defined so .btn-primary gets a real background",
    );
    assert.ok(
      css.includes(".btn-primary {\n  background: var(--accent);"),
      "btn-primary resolves its background from --accent",
    );
  });

  it("secondary / action buttons use the neutral slate tint, never a white background", () => {
    assert.ok(
      css.includes(".btn-secondary {\n  background: rgba(148, 163, 184, 0.1);"),
      "btn-secondary uses the neutral tint",
    );
    assert.ok(
      css.includes(".channel-action-btn {\n  display: inline-flex;"),
      "channel action buttons (Close/Stop) still styled as buttons",
    );
    assert.ok(
      css.includes("background: rgba(148, 163, 184, 0.1);"),
      "neutral tint present in the stylesheet",
    );
    assert.ok(
      !css.includes(".btn-secondary {\n  background: var(--glass-bg);"),
      "btn-secondary no longer uses the near-invisible glass background",
    );
  });
});

// ── Item 4: pinned paginators + centered loading/empty states ──
// Top paginator pinned at the top, bottom paginator pinned at the bottom,
// and the loading/empty content vertically centered between them.

describe("Database page layout (db-center-area, item 4)", () => {
  it("wraps loading/table/empty in a center area between the two paginators", () => {
    const topIdx = page.indexOf('id="db-pagination-top"');
    const centerIdx = page.indexOf('class="db-center-area" id="db-center-area"');
    const loadingIdx = page.indexOf('id="db-loading"');
    const emptyIdx = page.indexOf('id="db-empty"');
    const bottomIdx = page.indexOf('id="db-pagination-bottom"');
    assert.ok(
      [topIdx, centerIdx, loadingIdx, emptyIdx, bottomIdx].every((i) => i !== -1),
      "all five slots must exist",
    );
    assert.ok(
      topIdx < centerIdx && centerIdx < loadingIdx && loadingIdx < emptyIdx && emptyIdx < bottomIdx,
      "order must be: top paginator → center area (loading, empty) → bottom paginator",
    );
  });

  it("center area fills the box and centers its content; paginators pin top/bottom", () => {
    assert.ok(css.includes(".db-center-area {"), "db-center-area style block exists");
    assert.ok(css.includes("flex: 1;"), "center area expands to fill remaining height");
    assert.ok(css.includes("justify-content: center;"), "center area centers content vertically");
    assert.ok(
      css.includes(".db-center-area > .loading,\n.db-center-area > .empty-state {"),
      "loading and empty states share the centering rule",
    );
    assert.ok(css.includes("margin: auto;"), "centered between the top and bottom paginators");
  });
});
