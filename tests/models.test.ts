import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, "..", "src");

// ── Static source assertions: /models page wiring (router + nav + API) ──

describe("Models page route (router.ts)", () => {
  const routerSrc = readFileSync(join(src, "lib", "router.ts"), "utf-8");

  it("imports renderModels from ../pages/models", () => {
    assert.match(routerSrc, /renderModels/);
    assert.match(routerSrc, /from\s+["']\.\.\/pages\/models["']/);
  });

  it("registers a 'models' route", () => {
    assert.match(routerSrc, /\{\s*name:\s*["']models["']/);
  });
});

describe("Models nav entry (index.html)", () => {
  const html = readFileSync(join(here, "..", "index.html"), "utf-8");

  it("adds a Models nav item with data-route=models", () => {
    assert.match(html, /data-route="models"/);
    const providersIdx = html.indexOf('data-route="providers"');
    const modelsIdx = html.indexOf('data-route="models"');
    assert.ok(providersIdx !== -1 && modelsIdx !== -1, "providers and models nav entries must exist");
    assert.ok(modelsIdx > providersIdx, "Models nav entry must come after Providers");
  });
});

describe("Models page API usage (pages/models.ts)", () => {
  const modelsSrc = readFileSync(join(src, "pages", "models.ts"), "utf-8");

  it("reads via GET /api/models", () => {
    assert.match(modelsSrc, /apiGet[^;]*\/models/);
  });

  it("writes via PUT /api/models", () => {
    assert.match(modelsSrc, /apiPut[^;]*\/models/);
  });

  it("renders provider + model config rows (channels-style page)", () => {
    assert.match(modelsSrc, /provider/);
    assert.match(modelsSrc, /model_config|modelConfig|models/);
  });
});
