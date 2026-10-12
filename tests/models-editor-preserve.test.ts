/**
 * Regression: editing ONLY the default model on the Models page must not drop
 * the rest of the provider definition in models.yml.
 *
 * Before the fix, `wireEditor` replaced the stored provider entry with the
 * object rebuilt from the form inputs (`collectEditor`), which silently erased
 * every field the editor does not render - notably the custom `headers` block
 * (opencode-go's `x-opencode-session`, without which the provider answers HTTP
 * 400 MissingSessionID) and per-model `headers`.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mergeEditorProvider } from "../src/lib/models-merge.ts";

const here = dirname(fileURLToPath(import.meta.url));
const srcDir = join(here, "..", "src");

/** A provider entry as stored in models.yml (opencode-go, headers required). */
const STORED = {
  plugin: false,
  api_mode: "chat_completions",
  supports_reasoning: true,
  default_base_url: "https://opencode.ai/zen/go/v1",
  refresh_url: "https://opencode.ai/zen/go/v1/models",
  default_model: "deepseek-v4-flash",
  api_key: "$secret:OPENCODE_API_KEY",
  headers: { "x-opencode-session": { type: "channel", fallback: "omniagent" } },
  auth_style: "bearer",
  api_key_header_name: "x-api-key",
  api_version_header: { name: "anthropic-version", value: "2023-06-01" },
  thinking_param: false,
  models: ["deepseek-v4-flash"],
  token_budget_soft: 90000,
  model_config: {
    "deepseek-v4-flash": { api_mode: "anthropic", headers: { "x-model-flag": "1" } },
  },
};

/** Exactly what collectEditor() emits when ONLY default_model was changed. */
const EDITOR_PAYLOAD = {
  plugin: false,
  models: ["deepseek-v4-flash"],
  api_mode: "chat_completions",
  supports_reasoning: true,
  default_base_url: "https://opencode.ai/zen/go/v1",
  refresh_url: "https://opencode.ai/zen/go/v1/models",
  default_model: "deepseek-v4-pro",
  api_key: "$secret:OPENCODE_API_KEY",
  token_budget_soft: 90000,
  model_config: { "deepseek-v4-flash": { api_mode: "anthropic" } },
};

describe("mergeEditorProvider: default-model-only edit keeps the rest", () => {
  const merged = mergeEditorProvider(STORED, EDITOR_PAYLOAD);

  it("applies the changed default_model", () => {
    assert.equal(merged.default_model, "deepseek-v4-pro");
  });

  it("keeps the provider custom headers block byte-identical", () => {
    assert.deepEqual(merged.headers, STORED.headers);
    assert.deepEqual(merged.headers, { "x-opencode-session": { type: "channel", fallback: "omniagent" } });
  });

  it("keeps every other field the editor does not render", () => {
    assert.deepEqual(merged.auth_style, STORED.auth_style);
    assert.deepEqual(merged.api_key_header_name, STORED.api_key_header_name);
    assert.deepEqual(merged.api_version_header, STORED.api_version_header);
    assert.deepEqual(merged.thinking_param, STORED.thinking_param);
  });

  it("keeps per-model headers for model entries that survive the edit", () => {
    assert.deepEqual(merged.model_config?.["deepseek-v4-flash"]?.headers, { "x-model-flag": "1" });
    assert.equal(merged.model_config?.["deepseek-v4-flash"]?.api_mode, "anthropic");
  });

  it("still lets the editor clear fields it owns", () => {
    // token_budget_soft absent from the payload => cleared; models re-set from the form.
    const cleared = mergeEditorProvider(STORED, { plugin: true, models: ["deepseek-v4-flash"], default_model: "x" });
    assert.equal(cleared.token_budget_soft, undefined);
    assert.equal(cleared.default_base_url, undefined);
    assert.equal(cleared.default_model, "x");
    // ... while the untouched header block still survives.
    assert.deepEqual(cleared.headers, STORED.headers);
  });

  it("adds a brand-new provider unchanged (no stored entry)", () => {
    const fresh = { plugin: true, models: ["m1"] };
    assert.deepEqual(mergeEditorProvider(undefined, fresh), fresh);
  });

  it("regression-fails if the entry is replaced wholesale instead of merged", () => {
    // The pre-fix save path did exactly this; the headers block vanished.
    const wholesale = { ...EDITOR_PAYLOAD };
    assert.equal((wholesale as Record<string, unknown>).headers, undefined);
    assert.ok((merged as Record<string, unknown>).headers !== undefined);
  });
});

describe("Models page save path uses the merge (pages/models.ts)", () => {
  const src = readFileSync(join(srcDir, "pages", "models.ts"), "utf-8");

  it("imports mergeEditorProvider from ../lib/models-merge", () => {
    assert.match(src, /import\s*\{[^}]*mergeEditorProvider[^}]*\}\s*from\s*["']\.\.\/lib\/models-merge["']/);
  });

  it("merges the editor payload onto the stored provider on Save", () => {
    assert.match(
      src,
      /currentFile\.providers\[name\]\s*=\s*mergeEditorProvider\(currentFile\.providers\[name\],\s*p\)/,
    );
    assert.ok(
      !/currentFile\.providers\[name\]\s*=\s*p;\s/.test(src),
      "the save path must not replace the provider entry wholesale",
    );
  });
});
