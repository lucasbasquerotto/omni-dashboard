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

// ── Item 3: server /api/models proxy must preserve the /api prefix ──
// omniagent serves models at /api/models (WITH the prefix); the generic
// proxy strips /api, which is what caused "Failed to load models.yml: 404".

describe("Models server proxy (server/index.ts, item 3)", () => {
  const serverSrc = readFileSync(join(here, "..", "server", "index.ts"), "utf-8");
  // NOTE: the Express regex literal in the source escapes the slashes, so the
  // file text is `app.all(/^\/api\/models(?:\/.*)?$/, ...)` — search for that
  // exact (backslash-containing) text, not a bare "api/models".
  const routeStart = "app.all(/^\\/api\\/models";

  it("registers the /api/models proxy before the generic proxy", () => {
    assert.ok(
      serverSrc.includes(routeStart + "(?:\\/.*)?$/, async (req, res) => {"),
      "a dedicated /api/models route must exist",
    );
    const modelsIdx = serverSrc.indexOf(routeStart);
    const genericIdx = serverSrc.indexOf("Generic proxy");
    assert.ok(
      modelsIdx !== -1 && genericIdx !== -1 && modelsIdx < genericIdx,
      "must be registered before the generic proxy",
    );
  });

  it("forwards the full /api/models path to omniagent (prefix preserved)", () => {
    assert.ok(
      serverSrc.includes("const targetUrl = `${OMNIAGENT}${req.path}${queryStr}`;"),
      "the proxy must forward req.path unchanged (keeps /api/models)",
    );
    assert.ok(
      serverSrc.includes("omniagent serves these WITH the /api prefix"),
      "comment documents why the prefix is preserved",
    );
  });
});

// ── Models page UI/styling + refresh behavior (9bce18c) ──
describe("Models page UI (pages/models.ts, 9bce18c)", () => {
  const mSrc = readFileSync(join(src, "pages", "models.ts"), "utf-8");

  it("editor selects use the app custom dropdown component (enhanceSelectElement), not native selects", () => {
    assert.ok(
      /import\s*\{[^}]*enhanceSelectElement[^}]*\}\s*from\s*["']\.\.\/lib\/dropdown["']/.test(mSrc),
      "must import enhanceSelectElement from ../lib/dropdown",
    );
    assert.ok(
      mSrc.includes('"#m-api_mode, #m-supports_reasoning"'),
      "must enhance the editor api_mode/supports_reasoning selects",
    );
  });

  it("Save/Cancel buttons use the app standard button classes", () => {
    assert.ok(/class="btn btn-primary"[^>]*id="m-save"/.test(mSrc), "Save must use .btn.btn-primary");
    assert.ok(/class="btn btn-secondary"[^>]*id="m-cancel"/.test(mSrc), "Cancel must use .btn.btn-secondary");
  });

  it("refresh wiring is scoped to .channel-refresh-btn and guards on refresh_url", () => {
    assert.ok(
      mSrc.includes(".channel-refresh-btn[data-provider]"),
      "refresh must be wired via .channel-refresh-btn[data-provider]",
    );
    assert.ok(mSrc.includes("refresh_url"), "refresh must check refresh_url before calling the API");
    assert.ok(
      !/id="m-add-mc"[^>]*data-provider=/.test(mSrc),
      '"+ model config" must NOT be wired as a refresh button (data-provider removed)',
    );
  });

  it("per-model config is rendered inline in each provider card (renderModelConfigInline)", () => {
    assert.ok(/function\s+renderModelConfigInline\s*\(/.test(mSrc), "must define renderModelConfigInline");
    assert.ok(mSrc.includes("renderModelConfigInline(p.model_config)"), "must render p.model_config inline");
  });
});
