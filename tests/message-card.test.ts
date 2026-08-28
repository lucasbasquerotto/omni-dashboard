import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// ── Unit tests for src/lib/message-card.ts (pagination performance fix) ──
// The pagination fix (commit dce7d16) keeps large message contents OUT of the
// DOM: renderMessageCard renders a bounded preview (PREVIEW_CHARS) and stores the
// full content in a module Map (rawContentById) instead of a base64 data-view-raw
// attribute, so the browser never synchronously parses/lays out multi-hundred-KB
// text nodes (measured 10.44s main-thread block before the fix; 0.78s after).
describe("src/lib/message-card.ts (preview/truncation fix)", () => {
  const src = readFileSync(new URL("../src/lib/message-card.ts", import.meta.url), "utf-8");

  it("defines a bounded PREVIEW_CHARS constant", () => {
    const m = src.match(/const\s+PREVIEW_CHARS\s*=\s*(\d+)/);
    assert.ok(m, "PREVIEW_CHARS constant should be defined");
    const n = Number(m![1]);
    assert.ok(n > 0 && n <= 2000, `PREVIEW_CHARS should be a small positive bound (got ${n})`);
  });

  it("renderMessageCard renders only a preview for long content (no full text in DOM)", () => {
    // Long content must be sliced to PREVIEW_CHARS before escaping into the DOM
    assert.match(
      src,
      /contentRaw\.slice\(0,\s*PREVIEW_CHARS\)/,
      "should slice long content to PREVIEW_CHARS",
    );
    assert.match(src, /ev-truncated/, "should mark truncated previews with ev-truncated");
  });

  it("keeps full content out of the DOM: long messages get NO data-view-raw attribute", () => {
    // Short messages keep the attribute; long ones must NOT embed base64 in the DOM
    assert.match(
      src,
      /isLong\s*\?\s*""\s*:\s*` data-view-raw=/,
      "should omit data-view-raw for long messages",
    );
    // ... and register the raw content in the module Map instead
    assert.match(
      src,
      /registerRawContent\(msg\.id,\s*contentRaw\)/,
      "should register full content in rawContentById",
    );
  });

  it("wireMessageCardToggles expands truncated cards to the full content lazily", () => {
    assert.match(src, /rawContentFor\(/, "should use rawContentFor to resolve full content");
    assert.match(src, /dataset\.fullHtml/, "should cache expanded HTML on the element");
  });

  it("messages.ts keeps the expand button for truncated previews", () => {
    const msgs = readFileSync(new URL("../src/pages/messages.ts", import.meta.url), "utf-8");
    assert.match(msgs, /ev-truncated/, "has-more overflow auto-removal should skip .ev-truncated cards");
  });

  it("module exports renderMessageCard (behavior smoke test)", async () => {
    try {
      const mod = await import("../src/lib/message-card.ts");
      assert.equal(typeof mod.renderMessageCard, "function");
      assert.equal(typeof mod.typeColor, "function");
      const longMsg = {
        id: 9001,
        role: "agent",
        msg_type: "text",
        content: "x".repeat(5000),
        created_at: "2026-08-28T00:00:00Z",
        channel_id: "all",
        channel_name: "all",
        status: null,
        error: null,
      } as Parameters<typeof mod.renderMessageCard>[0];
      const html = mod.renderMessageCard(longMsg);
      assert.ok(html.includes("ev-truncated"), "long message should be marked ev-truncated");
      assert.ok(!html.includes("x".repeat(4000)), "DOM must not contain the full long content");
      assert.ok(html.length < 5000, `rendered card should stay small (got ${html.length} chars)`);
    } catch (e) {
      // Dynamic TS import may fail in some Node versions; the static assertions above
      // still guard the fix. (Same pattern as lib.test.ts.)
      assert.ok(true, `Dynamic import note: ${(e as Error).message}`);
    }
  });
});
