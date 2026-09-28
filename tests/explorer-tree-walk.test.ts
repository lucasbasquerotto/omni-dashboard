import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { planTreeWalk, type ExplorerTreeNode } from "../src/lib/explorer-tree.ts";

// ── Regression tests: returning to the Explorer must resolve the open file ──
//    (task_omnidev / "Explorer stuck on Loading file after visiting another page")
//
// The walk used to fetch a directory's children only when the node was NOT
// expanded. Every tree reload resets children to null while `expanded` is
// restored from expandedPaths (module state that survives SPA navigation), so
// after a SPA re-entry (browser back / sidebar return with ?file=) the walk ran
// out of levels, returned early and left the content pane on the "Loading file"
// placeholder forever. A hard refresh worked because expandedPaths is empty
// then.

const dir = (
  name: string,
  path: string,
  expanded: boolean,
  children: ExplorerTreeNode[] | null,
): ExplorerTreeNode => ({
  entry: { name, path, type: "directory", size: null },
  expanded,
  children,
});

const file = (name: string, path: string): ExplorerTreeNode => ({
  entry: { name, path, type: "file", size: 12 },
  expanded: false,
  children: null,
});

describe("Explorer tree walk", () => {
  it("asks for the children of an EXPANDED node whose children a tree reload reset", () => {
    // The exact post-SPA-remount shape: expandedPaths restored `expanded: true`
    // while loadTree() reset every children array to null.
    const root = [dir("omni", "/omni", true, null), dir("opt", "/opt", true, null)];
    const plan = planTreeWalk(root, "/omni/config/actions.yml");
    assert.equal(plan.ok, true);
    assert.equal(plan.pending.length, 1, "an expanded node with children === null is still pending");
    assert.equal(plan.pending[0].dir, "/omni");
    assert.deepEqual(
      plan.ancestors.map((a) => a.dir),
      ["/omni"],
    );
  });

  it("resolves a deep file with nothing pending once every level is loaded", () => {
    const config = dir("config", "/omni/config", true, [file("actions.yml", "/omni/config/actions.yml")]);
    const root = [dir("omni", "/omni", true, [config])];
    const plan = planTreeWalk(root, "/omni/config/actions.yml");
    assert.equal(plan.ok, true);
    assert.deepEqual(plan.pending, []);
    assert.deepEqual(
      plan.ancestors.map((a) => a.dir),
      ["/omni", "/omni/config"],
    );
  });

  it("walks level by level: loading the pending dir resolves the next level", () => {
    const levels: Record<string, ExplorerTreeNode[]> = {
      "/omni": [dir("config", "/omni/config", true, null)],
      "/omni/config": [file("actions.yml", "/omni/config/actions.yml")],
    };
    const root = [dir("omni", "/omni", true, null)];
    let plan = planTreeWalk(root, "/omni/config/actions.yml");
    let steps = 0;
    while (plan.ok && plan.pending.length > 0 && steps++ < 5) {
      for (const { dir: d, node } of plan.pending) node.children = levels[d] ?? [];
      plan = planTreeWalk(root, "/omni/config/actions.yml");
    }
    assert.equal(plan.ok, true, "the walk terminates ok once the pending dirs are loaded");
    assert.deepEqual(plan.pending, []);
    assert.deepEqual(
      plan.ancestors.map((a) => a.dir),
      ["/omni", "/omni/config"],
    );
  });

  it("reports a missing directory instead of silently giving up", () => {
    const root = [dir("omni", "/omni", true, [])];
    const plan = planTreeWalk(root, "/omni/config/actions.yml");
    assert.equal(plan.ok, false);
    assert.match(plan.reason ?? "", /Directory not found: \/omni\/config/);
  });

  it("reports an unloaded tree and an unusable path", () => {
    const noTree = planTreeWalk(null, "/omni/config/actions.yml");
    assert.equal(noTree.ok, false);
    assert.match(noTree.reason ?? "", /file tree could not be loaded/);
    const noPath = planTreeWalk([], "/");
    assert.equal(noPath.ok, false);
    assert.match(noPath.reason ?? "", /Not a file path/);
  });

  it("keeps the explorer walk terminal (no bare return with the loader on screen)", () => {
    const src = readFileSync(new URL("../src/pages/explorer.ts", import.meta.url), "utf-8");
    assert.match(src, /renderContentError\(/, "the content pane needs a terminal error state");
    assert.ok(
      !/if \(!currentLevel\) return;|if \(!node\) return;|if \(!data\) return;/.test(src),
      "the tree walk must not return silently while 'Loading file' is displayed",
    );
    assert.match(
      src,
      /new URLSearchParams\(location\.search\)\.get\("file"\) \|\| lastOpenedFile/,
      "the mount must restore the last opened file when the sidebar dropped ?file=",
    );
  });
});
