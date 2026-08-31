import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// ── Regression tests: kanban Task Details dependencies display ──
// Task: Dashboard shows task dependencies in the kanban Task Details page.
// Root cause: the task detail endpoint does NOT inline the dependency list
// (the old Node server did; the Rust kanban API never did), so the page must
// fetch /kanban/tasks/{id}/dependencies separately and render depends_on +
// dependents as clickable rows, with the empty state only for tasks with none.

describe("Kanban detail dependencies (kanban-detail.ts)", () => {
  const src = readFileSync(new URL("../src/lib/kanban-detail.ts", import.meta.url), "utf-8");

  it("fetches the dependency list from /kanban/tasks/{id}/dependencies, not task.dependencies", () => {
    assert.ok(
      /renderDepsTable\(await fetchTaskDeps\(taskId\)\)/.test(src),
      "detail must render deps fetched from the separate dependencies endpoint",
    );
    assert.ok(
      /"\/kanban\/tasks\/" \+ encodeURIComponent\(taskId\) \+ "\/dependencies"/.test(src),
      "fetchTaskDeps must call the dependencies endpoint",
    );
    assert.ok(
      !/task\.dependencies/.test(src),
      "must NOT rely on task.dependencies (the detail endpoint never inlines it)",
    );
  });

  it("renders dependency rows that open the linked task (clickable dep-row)", () => {
    assert.ok(/class="dep-row"/.test(src), "dependency rows carry the dep-row class");
    assert.ok(/function wireDepRows\(\)/.test(src), "wireDepRows wires row clicks");
    assert.ok(
      /\/kanban\/\$\{encodeURIComponent\(depId\)\}/.test(src),
      "clicking a dependency navigates to that task's detail (kanban/<id> route)",
    );
  });

  it("renders dependents (tasks that depend on this one) and their empty state", () => {
    assert.ok(/async function loadDependents\(taskId: string\)/.test(src), "loadDependents exists");
    assert.ok(/dependents-tbody/.test(src), "dependents table body exists");
    assert.ok(/Depended on by/.test(src), "dependents section label");
    assert.ok(/No dependents/.test(src), "empty state text for tasks with no dependents");
  });

  it("keeps the empty state for tasks with no dependencies", () => {
    assert.ok(/No dependencies/.test(src), "empty state text for tasks with no dependencies");
  });
});
