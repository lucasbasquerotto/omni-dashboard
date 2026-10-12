/**
 * Custom (provider/model) headers on the Models page:
 * value-shape helpers (lib/models-headers.ts) + the page wiring that renders,
 * edits and persists them through PUT /api/models.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildHeaderValue,
  entriesToRecord,
  headerDisplay,
  headerFallback,
  headerKind,
  headerLiteral,
  headersDisplay,
  isValidHeaderName,
  recordToEntries,
} from "../src/lib/models-headers.ts";

const here = dirname(fileURLToPath(import.meta.url));
const srcDir = join(here, "..", "src");

describe("models-headers: value shapes", () => {
  it("classifies literal vs typed values", () => {
    assert.equal(headerKind("Bearer x"), "literal");
    assert.equal(headerKind({ type: "channel" }), "channel");
    assert.equal(headerKind({ type: "profile", fallback: "p" }), "profile");
  });

  it("exposes literal / fallback text", () => {
    assert.equal(headerLiteral("abc"), "abc");
    assert.equal(headerLiteral({ type: "channel" }), "");
    assert.equal(headerFallback({ type: "channel", fallback: "omniagent" }), "omniagent");
    assert.equal(headerFallback("abc"), "");
  });

  it("builds a literal value and rejects a blank one", () => {
    assert.equal(buildHeaderValue("literal", "  Bearer $secret:X  ", ""), "Bearer $secret:X");
    assert.equal(buildHeaderValue("literal", "   ", ""), undefined);
  });

  it("builds typed values with and without a fallback", () => {
    assert.deepEqual(buildHeaderValue("channel", "", "omniagent"), { type: "channel", fallback: "omniagent" });
    assert.deepEqual(buildHeaderValue("profile", "", ""), { type: "profile" });
    assert.deepEqual(buildHeaderValue("channel", "ignored", "  fb  "), { type: "channel", fallback: "fb" });
  });

  it("describes values for the read-only card", () => {
    assert.equal(headerDisplay("Bearer x"), '"Bearer x"');
    assert.equal(headerDisplay({ type: "channel" }), "channel");
    assert.equal(headerDisplay({ type: "channel", fallback: "omniagent" }), "channel (fallback: omniagent)");
  });

  it("renders a headers block one-liner (and empty for none)", () => {
    assert.equal(
      headersDisplay({ "x-opencode-session": { type: "channel", fallback: "omniagent" } }),
      "x-opencode-session: channel (fallback: omniagent)",
    );
    assert.equal(headersDisplay({}), "");
    assert.equal(headersDisplay(undefined), "");
  });

  it("round-trips stored headers to editor entries", () => {
    const headers = { "x-opencode-session": { type: "channel" as const } };
    assert.deepEqual(recordToEntries(headers), [{ name: "x-opencode-session", value: { type: "channel" } }]);
    assert.deepEqual(recordToEntries(undefined), []);
  });
});

describe("models-headers: validation + duplicate policy", () => {
  it("accepts an HTTP token name, rejects spaces/empty/illegal chars", () => {
    assert.ok(isValidHeaderName("x-opencode-session"));
    assert.ok(isValidHeaderName("X_Custom-Flag.1"));
    assert.ok(!isValidHeaderName(""));
    assert.ok(!isValidHeaderName("x opencode"));
    assert.ok(!isValidHeaderName("x-session:"));
  });

  it("builds a record from ordered entries", () => {
    const res = entriesToRecord([
      { name: "x-a", value: "1" },
      { name: "X-B", value: { type: "channel" } },
    ]);
    assert.equal(res.error, undefined);
    assert.deepEqual(res.record, { "x-a": "1", "X-B": { type: "channel" } });
  });

  it("returns no record when there is no header (clean empty block)", () => {
    assert.deepEqual(entriesToRecord([]), { record: undefined });
  });

  it("rejects an empty name", () => {
    assert.equal(entriesToRecord([{ name: "  ", value: "1" }]).error, "header name must not be empty");
  });

  it("rejects a non-token name", () => {
    assert.match(String(entriesToRecord([{ name: "bad name", value: "1" }]).error), /invalid HTTP header name/);
  });

  it("rejects duplicates case-insensitively (never a silent overwrite)", () => {
    const res = entriesToRecord([
      { name: "x-flag", value: "1" },
      { name: "X-Flag", value: "2" },
    ]);
    assert.equal(res.record, undefined);
    assert.match(String(res.error), /duplicate header "X-Flag"/);
  });
});

describe("Models page custom-headers wiring (pages/models.ts)", () => {
  const src = readFileSync(join(srcDir, "pages", "models.ts"), "utf-8");

  it("imports the header helpers", () => {
    assert.match(src, /from\s+["']\.\.\/lib\/models-headers["']/);
  });

  it("renders a headers editor for the provider and for each model config", () => {
    assert.match(src, /function\s+renderHeaderEditor\s*\(/);
    assert.match(src, /renderHeaderEditor\("provider",\s*null,\s*p\.headers\)/);
    assert.match(src, /renderHeaderEditor\("model",\s*model,\s*cfg\.headers\)/);
  });

  it("offers literal / channel / profile value types in the editor", () => {
    assert.match(src, /\[data-hfield="type"\]/);
    for (const kind of ['value="literal"', 'value="channel"', 'value="profile"']) {
      assert.ok(src.includes(kind), `editor must offer ${kind}`);
    }
  });

  it("shows headers in the read-only provider card and per-model inline", () => {
    assert.match(src, /renderHeadersInline\(p\.headers\)/);
    assert.match(src, /headersDisplay\(cfg\.headers\)/);
  });

  it("wires add / remove and collects the block on save", () => {
    assert.match(src, /\[data-hadd\]/);
    assert.match(src, /\[data-hremove\]/);
    assert.match(src, /function\s+collectHeaderEditor\s*\(/);
    assert.match(src, /p\.headers\s*=\s*col\.record/);
  });

  it("persists through the models API (PUT /api/models) unchanged", () => {
    assert.match(src, /apiPut\(\s*"\/models"/);
  });
});
