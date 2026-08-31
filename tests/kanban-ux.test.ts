import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// ── Regression tests: kanban UX fixes (archived filter, shared task modal,
//    custom board/workflow selects, modal latency) ──

describe("Kanban archived filter (show_archived)", () => {
  const src = readFileSync(new URL("../src/lib/kanban-board.ts", import.meta.url), "utf-8");

  it("loadBoard filters tasks on the archived flag (not just the URL)", () => {
    assert.ok(
      /const visibleTasks = tasks\s*\.filter\(\(t: KanbanTask\) =>/.test(src),
      "loadBoard should build a visibleTasks filter from the fetched list",
    );
    assert.ok(
      /showArchived \? t\.archived === true : !t\.archived/.test(src),
      "default (Unarchived) must show ONLY non-archived; Show archived ONLY archived",
    );
  });
  it("loadBoard asks the API for archived tasks when showArchived is on", () => {
    assert.ok(
      /showArchived \? "&show_archived=true" : ""/.test(src),
      "board fetch must request archived tasks from the API",
    );
    assert.ok(
      /showArchived \? "\?show_archived=true" : ""/.test(src),
      "no-board fetch must request archived tasks too",
    );
  });

  it("columns and totals are computed from the filtered list", () => {
    assert.ok(
      /tasks:\s*visibleTasks\.filter\(\(t: KanbanTask\) => t\.status === col\.id\)/.test(src),
      "columns must be built from visibleTasks",
    );
    assert.ok(/total:\s*visibleTasks\.length/.test(src), "board total must reflect the filtered count");
    assert.ok(
      /showArchived \? "No archived tasks" :\s*"No tasks yet"/.test(src),
      "empty state should be mode-aware",
    );
  });
});

describe("Shared create/edit task modal (kanban-create.ts)", () => {
  const src = readFileSync(new URL("../src/lib/kanban-create.ts", import.meta.url), "utf-8");

  it("exports one taskModalHTML(mode) used for both Create and Edit", () => {
    assert.ok(/export function taskModalHTML\(mode: TaskModalMode\)/.test(src), "taskModalHTML(mode)");
    assert.ok(/isEdit \? "Edit Task" : "Create Task"/.test(src), "same component, mode-driven title");
  });

  it("Board and Workflow selects exist in BOTH modes (custom select, not native)", () => {
    assert.ok(/id="\$\{p\}-board"/.test(src), "board select id is prefix-based (both modes)");
    assert.ok(/id="\$\{p\}-workflow"/.test(src), "workflow select id is prefix-based (both modes)");
    assert.ok(
      /populateBoardSelectCached\(`\$\{p\}-board`/.test(src),
      "board select must be populated via the custom-select path (dropdown re-enhanced)",
    );
    assert.ok(
      /populateWorkflowSelectCached\(`\$\{p\}-workflow`/.test(src),
      "workflow select must be populated via the custom-select path (dropdown re-enhanced)",
    );
    // The cached populators must re-enhance the select they just filled.
    assert.ok(
      /refreshEnhancedSelect\(selectId\)/.test(src),
      "populators re-enhance the select after filling options",
    );
  });

  it("openTaskModal shows the modal BEFORE populating selects (latency fix)", () => {
    assert.ok(/modal\.style\.display = "flex";/.test(src), "modal shown synchronously");
    // The show must come before the async populate call in the same function body.
    const showIdx = src.indexOf('modal.style.display = "flex";');
    const popIdx = src.indexOf("void populateTaskModalSelects");
    assert.ok(showIdx >= 0 && popIdx > showIdx, "show first, then populate in background");
  });

  it("wireTaskModal wires cancel + submit for both modes; submit differs by mode", () => {
    assert.ok(/export function wireTaskModal/.test(src), "wireTaskModal exported");
    assert.ok(/submitTaskModal\(mode\)/.test(src), "submit dispatches on the mode");
    assert.ok(/_editTaskId/.test(src), "edit mode PATCHes the task id");
  });
});

describe("Kanban detail reuses the shared task modal", () => {
  const src = readFileSync(new URL("../src/lib/kanban-detail.ts", import.meta.url), "utf-8");

  it('renders taskModalHTML("edit") instead of a bespoke edit modal', () => {
    assert.ok(/taskModalHTML\("edit"\)/.test(src), "edit modal comes from the shared component");
    assert.ok(/openTaskModal\(\{/.test(src), "Edit button opens the shared modal");
    assert.ok(/wireTaskModal\(\{ mode: "edit" \}\)/.test(src), "shared wiring used for edit");
  });

  it("no longer defines its own edit-modal field HTML", () => {
    assert.ok(!/<div id="edit-task-modal"/.test(src), "inline edit-task-modal container must be gone");
    assert.ok(!/task-edit-title/.test(src), "inline edit title input must be gone");
  });
});

describe("Reusable message box used by message-rendering pages", () => {
  it("Messages page, kanban detail and schedule detail all use renderMessageCard", () => {
    for (const f of ["pages/messages.ts", "lib/kanban-detail.ts", "lib/schedule-detail.ts"]) {
      const src = readFileSync(new URL(`../src/${f}`, import.meta.url), "utf-8");
      assert.ok(/renderMessageCard/.test(src), `${f} must use the shared renderMessageCard message box`);
    }
  });
});

describe("Modal latency: refcache prefetch", () => {
  it("refcache.ts exports cachedGet + prefetch", () => {
    const src = readFileSync(new URL("../src/lib/refcache.ts", import.meta.url), "utf-8");
    assert.ok(/export function cachedGet/.test(src), "cachedGet");
    assert.ok(/export function prefetch/.test(src), "prefetch");
  });

  it("pages prefetch modal option lists on load", () => {
    const kanban = readFileSync(new URL("../src/pages/kanban.ts", import.meta.url), "utf-8");
    assert.ok(
      /prefetch\(\["\/channels", "\/profiles", "\/templates", "\/boards", "\/workflows"\]\)/.test(kanban),
      "kanban prefetches task-modal refs",
    );
    const schedule = readFileSync(new URL("../src/pages/schedule.ts", import.meta.url), "utf-8");
    assert.ok(/prefetch\(/.test(schedule), "schedule prefetches cron-modal refs");
    const hooks = readFileSync(new URL("../src/pages/hooks.ts", import.meta.url), "utf-8");
    assert.ok(/prefetch\(/.test(hooks), "hooks prefetch hook-modal refs");
  });

  it("cron and hook modals load their option lists from the cache in parallel", () => {
    const cron = readFileSync(new URL("../src/lib/schedule-detail.ts", import.meta.url), "utf-8");
    assert.ok(
      /Promise\.all\(\[/.test(cron) && /cachedGet\("\/channels"\)/.test(cron),
      "cron modal parallel cachedGet",
    );
    const hook = readFileSync(new URL("../src/lib/hooks-detail.ts", import.meta.url), "utf-8");
    assert.ok(
      /Promise\.all\(\[/.test(hook) && /cachedGet\("\/channels"\)/.test(hook),
      "hook modal parallel cachedGet",
    );
  });
});

describe("Kanban tag filter (tag=)", () => {
  const src = readFileSync(new URL("../src/lib/kanban-board.ts", import.meta.url), "utf-8");
  const page = readFileSync(new URL("../src/pages/kanban.ts", import.meta.url), "utf-8");

  it("loadBoard AND-combines the tag filter with the archived filter", () => {
    assert.ok(
      /\.filter\(\(t: KanbanTask\) => !tag \|\| \(Array\.isArray\(t\.tags\) && t\.tags\.includes\(tag\)\)\)/.test(
        src,
      ),
      "visibleTasks must also filter by exact tag match",
    );
    assert.ok(
      /\.filter\(\(t: KanbanTask\) => \(showArchived \? t\.archived === true : !t\.archived\)\)/.test(src),
      "archived filter must stay in the chain (AND semantics)",
    );
  });

  it("loadBoard restores the tag filter from the URL so it survives navigation", () => {
    assert.ok(
      /new URLSearchParams\(window\.location\.search\)\.get\("tag"\)/.test(src),
      "tag filter is read back from the ?tag= URL param",
    );
    assert.ok(/const tag = tagFilter\.trim\(\)/.test(src), "tag is trimmed before matching");
  });

  it("kanban.ts exposes a tag input and a clear control wired to the URL", () => {
    assert.ok(/kanban-tag-filter/.test(page), "tag filter input must exist");
    assert.ok(/kanban-tag-clear/.test(page), "tag filter clear button must exist");
    assert.ok(/params\.set\("tag", filterTag\)/.test(page), "tag state is written to the URL");
    assert.ok(/params\.delete\("tag"\)/.test(page), "clearing the tag removes the URL param");
    assert.ok(/filterTag = ""/.test(page), "clear control resets the page state");
  });
});
