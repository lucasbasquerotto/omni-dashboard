import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// ── Phantom (YAML-only) plugin removal ──
// (task_omnidev_phantom_plugin_entries_cannot_be)
//
// A plugins.yml entry whose code is gone from disk (cron/kanban after the
// tasks-plugin unification) is listed by the server as
// source=<declared source> + status "missing_source". The dashboard must:
//  - keep a Remove button on such a card even when it declares "built-in"
//    (before this, phantom built-in cards rendered NO buttons at all, so the
//    operator could never remove them);
//  - send the TRUE source from the plugin detail API;
//  - treat a response without deleted:true / uninstalled:true as a FAILURE so a
//    no-op removal is never reported as a green success.

const src = readFileSync(new URL("../src/lib/plugin-ui.ts", import.meta.url), "utf-8");

const plugin = (over: Record<string, unknown>): Record<string, unknown> => ({
  name: "cron",
  pluginType: "tool",
  source: "built-in",
  status: "missing_source",
  manifest: {},
  config: {},
  hasSourceCode: false,
  needsBuild: false,
  ...over,
});

const load = async () =>
  (await import("../src/lib/plugin-ui.ts")) as {
    renderActionButtons: (p: unknown) => string;
    getStatusBadgeClass: (status: string, needsBuild?: boolean) => string;
  };

describe("phantom (YAML-only) plugin removal", () => {
  it("a built-in phantom card still offers Remove", async () => {
    const { renderActionButtons } = await load();
    const html = renderActionButtons(plugin({}));
    assert.ok(
      html.includes("plugin-remove-btn"),
      "a YAML-only entry declared built-in must be removable (no code on disk)",
    );
  });

  it("a genuine on-disk built-in still renders no actions", async () => {
    const { renderActionButtons } = await load();
    const html = renderActionButtons(
      plugin({ status: "enabled", hasSourceCode: true, needsDownload: false }),
    );
    assert.equal(html, "", "a real built-in has no action buttons (disable only)");
  });

  it("missing_source uses the neutral badge class", async () => {
    const { getStatusBadgeClass } = await load();
    assert.equal(getStatusBadgeClass("missing_source"), "badge badge-neutral");
  });

  it("the card labels a missing source instead of inventing one", () => {
    assert.ok(src.includes("○ No source"), "the card must show a missing-source badge");
    assert.ok(
      /isMissingSource \? "○ No source"/.test(src),
      "the missing-source badge must be driven by the missing-source state",
    );
    assert.ok(
      /\(p\.source !== "built-in" \|\| isMissingSource\)/.test(src),
      "the No code badge must also show for a phantom built-in entry",
    );
  });

  it("Remove reads the true source from the detail API and rejects a no-op success", () => {
    assert.ok(
      /apiGet<PluginData>\(\s*`\/plugins\/\$\{typeDir\}/.test(src),
      "the remove handler must read the plugin source from the detail API",
    );
    assert.ok(
      /detail\.name === pluginName/.test(src),
      "the detail may only override the source when it describes the same plugin",
    );
    assert.ok(
      /result\?\.deleted !== true/.test(src),
      "a delete response without deleted:true must be treated as a failure",
    );
    assert.ok(
      /result\?\.uninstalled !== true/.test(src),
      "an uninstall response without uninstalled:true must be treated as a failure",
    );
  });
});
