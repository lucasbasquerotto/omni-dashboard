import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// ── Plugin status filter / discovery-only status vocabulary ──
// (task_omnidev_phantom_plugin_entries_cannot_be, reviewer follow-up)
//
// The plugin list reports a YAML-only entry (declared in plugins.yml, no source
// on disk) as status "missing_source"; "not_found" is the legacy label. The
// dashboard filter must accept BOTH labels for the SAME option, otherwise the
// "No source" filter silently matches nothing for exactly the stale entries
// (cron/kanban) the operator is trying to find and remove.

const listSrc = readFileSync(new URL("../src/lib/plugin-list.ts", import.meta.url), "utf-8");

describe("plugin status filter accepts missing_source", () => {
  it("normalises the legacy not_found label to missing_source", async () => {
    const { normalizePluginStatusFilter } = (await import("../src/lib/plugin-ui.ts")) as {
      normalizePluginStatusFilter: (v: string) => string;
    };
    assert.equal(normalizePluginStatusFilter("not_found"), "missing_source");
    assert.equal(normalizePluginStatusFilter("missing_source"), "missing_source");
    // Real lifecycle labels are untouched.
    for (const real of ["enabled", "disabled", "error", "all"]) {
      assert.equal(normalizePluginStatusFilter(real), real);
    }
  });

  it("isDiscoveryOnlyStatus covers the current and the legacy label", async () => {
    const { isDiscoveryOnlyStatus } = (await import("../src/lib/plugin-ui.ts")) as {
      isDiscoveryOnlyStatus: (s: string) => boolean;
    };
    assert.equal(isDiscoveryOnlyStatus("missing_source"), true);
    assert.equal(isDiscoveryOnlyStatus("not_found"), true);
    assert.equal(isDiscoveryOnlyStatus("enabled"), false);
    assert.equal(isDiscoveryOnlyStatus("disabled"), false);
    assert.equal(isDiscoveryOnlyStatus("error"), false);
  });

  it("offers a No source filter option bound to missing_source", () => {
    assert.ok(
      listSrc.includes('<option value="missing_source">No source</option>'),
      "the status filter must offer the current missing_source label",
    );
    assert.ok(
      !listSrc.includes('<option value="not_found">'),
      "the obsolete not_found option must be gone (it matched nothing)",
    );
  });

  it("the filter predicate compares normalised statuses", () => {
    assert.ok(
      /normalizePluginStatusFilter\(p\.status\) !== normalizePluginStatusFilter\(currentStatus\)/.test(
        listSrc,
      ),
      "filterPlugins must normalise both sides so both labels select the same rows",
    );
    assert.ok(
      /import \{[^}]*normalizePluginStatusFilter[^}]*\} from "\.\/plugin-ui"/.test(listSrc),
      "the filter must share the server-vocabulary helper instead of duplicating it",
    );
  });
});
