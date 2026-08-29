import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// ── Page render function smoke tests ──
// Verify that each page module exports a render function that exists

describe("Page modules exist and export render functions", () => {
  const pagesToCheck = [
    { name: "kanban", exports: ["renderKanban", "renderKanbanDetail"] },
    { name: "schedule", exports: ["renderSchedule", "renderScheduleDetail"] },
    { name: "channels", exports: ["renderChannels"] },
    { name: "database", exports: ["renderDatabase"] },
  ];

  for (const { name, exports: expected } of pagesToCheck) {
    it(`${name}.ts exports ${expected.join(", ")}`, () => {
      const content = readFileSync(new URL(`../src/pages/${name}.ts`, import.meta.url), "utf-8");
      for (const exp of expected) {
        const exportPattern = new RegExp(`export\\s+(function|const|async\\s+function)\\s+${exp}\\b`);
        const reExportPattern = new RegExp(`export\\s+\\{[^}]*\\b${exp}\\b[^}]*\\}\\s+from\\s+["']`);
        assert.ok(
          exportPattern.test(content) || reExportPattern.test(content),
          `${name}.ts should export ${exp}`,
        );
      }
    });
  }

  it("kanban.ts is under 350 lines", () => {
    const content = readFileSync(new URL("../src/pages/kanban.ts", import.meta.url), "utf-8");
    const lines = content.split("\n").length;
    assert.ok(lines <= 350, `kanban.ts has ${lines} lines (expected ≤ 350)`);
  });

  it("schedule.ts is under 350 lines", () => {
    const content = readFileSync(new URL("../src/pages/schedule.ts", import.meta.url), "utf-8");
    const lines = content.split("\n").length;
    assert.ok(lines <= 350, `schedule.ts has ${lines} lines (expected ≤ 350)`);
  });

  it("channels.ts is under 350 lines", () => {
    const content = readFileSync(new URL("../src/pages/channels.ts", import.meta.url), "utf-8");
    const lines = content.split("\n").length;
    assert.ok(lines <= 350, `channels.ts has ${lines} lines (expected ≤ 350)`);
  });
});

// ── Lib module smoke tests ──

describe("New kanban lib modules", () => {
  it("kanban-board.ts exports expected functions", () => {
    const content = readFileSync(new URL("../src/lib/kanban-board.ts", import.meta.url), "utf-8");
    const expectedExports = [
      "STATUS_LABELS",
      "statusBadge",
      "formatRelativeTime",
      "formatTaskDate",
      "renderColumn",
      "renderTaskCard",
      "moveTask",
      "loadBoard",
    ];
    for (const exp of expectedExports) {
      assert.ok(
        new RegExp(`export\\s+(const|function|async\\s+function)\\s+${exp}\\b`).test(content),
        `kanban-board.ts should export ${exp}`,
      );
    }
  });

  it("kanban-detail.ts exports expected functions", () => {
    const content = readFileSync(new URL("../src/lib/kanban-detail.ts", import.meta.url), "utf-8");
    const expectedExports = ["loadTaskDetail", "renderKanbanDetail"];
    for (const exp of expectedExports) {
      assert.ok(
        new RegExp(`export\\s+(function|async\\s+function)\\s+${exp}\\b`).test(content),
        `kanban-detail.ts should export ${exp}`,
      );
    }
  });

  it("kanban-subtasks.ts exports expected functions", () => {
    const content = readFileSync(new URL("../src/lib/kanban-subtasks.ts", import.meta.url), "utf-8");
    const expectedExports = ["subtaskStatusEmoji", "subtaskStatusBadge", "loadKanbanSubtasks"];
    for (const exp of expectedExports) {
      assert.ok(
        new RegExp(`export\\s+(function|async\\s+function)\\s+${exp}\\b`).test(content),
        `kanban-subtasks.ts should export ${exp}`,
      );
    }
  });
});

describe("New schedule lib modules", () => {
  it("schedule-list.ts exports expected functions", () => {
    const content = readFileSync(new URL("../src/lib/schedule-list.ts", import.meta.url), "utf-8");
    const expectedExports = ["formatActionLabel", "loadCronJobs"];
    for (const exp of expectedExports) {
      assert.ok(
        new RegExp(`export\\s+(function|async\\s+function)\\s+${exp}\\b`).test(content),
        `schedule-list.ts should export ${exp}`,
      );
    }
  });

  it("schedule-detail.ts exports expected functions", () => {
    const content = readFileSync(new URL("../src/lib/schedule-detail.ts", import.meta.url), "utf-8");
    const expectedExports = [
      "formatDate",
      "loadScheduleDetail",
      "loadScheduleThreads",
      "showCronModal",
      "renderScheduleDetail",
    ];
    for (const exp of expectedExports) {
      assert.ok(
        new RegExp(`export\\s+(function|async\\s+function|const)\\s+${exp}\\b`).test(content),
        `schedule-detail.ts should export ${exp}`,
      );
    }
  });
});

describe("New channels lib modules", () => {
  it("channel-config.ts exports expected functions", () => {
    const content = readFileSync(new URL("../src/lib/channel-config.ts", import.meta.url), "utf-8");
    const expectedExports = [
      "planBadge",
      "getModelsForProvider",
      "renderNameInput",
      "renderProfileSelect",
      "renderProviderSelect",
      "renderModelSelect",
      "renderPlanSelect",
      "wireChannelConfigEditing",
    ];
    for (const exp of expectedExports) {
      assert.ok(
        new RegExp(`export\\s+(function|const|async\\s+function)\\s+${exp}\\b`).test(content),
        `channel-config.ts should export ${exp}`,
      );
    }
  });

  it("channel-status.ts exports expected functions", () => {
    const content = readFileSync(new URL("../src/lib/channel-status.ts", import.meta.url), "utf-8");
    const expectedExports = [
      "renderStatusControl",
      "renderChannelsPage",
      "wireChannelFilterControls",
      "wireChannelToggleButtons",
      "syncFiltersToUrl",
      "applyFiltersFromUrl",
    ];
    for (const exp of expectedExports) {
      assert.ok(
        new RegExp(`export\\s+(function|const|async\\s+function)\\s+${exp}\\b`).test(content),
        `channel-status.ts should export ${exp}`,
      );
    }
  });
});

// ── Smoke tests for plugin-config library ──

describe("plugin-config library functions", () => {
  it("plugin-config.ts exports renderConfigField", () => {
    const content = readFileSync(new URL("../src/lib/plugin-config.ts", import.meta.url), "utf-8");
    assert.ok(/export\s+function\s+renderConfigField\b/.test(content));
  });

  it("plugin-config.ts exports renderPluginConfig", () => {
    const content = readFileSync(new URL("../src/lib/plugin-config.ts", import.meta.url), "utf-8");
    assert.ok(/export\s+function\s+renderPluginConfig\b/.test(content));
  });

  it("plugin-config.ts exports getCurrentConfig", () => {
    const content = readFileSync(new URL("../src/lib/plugin-config.ts", import.meta.url), "utf-8");
    assert.ok(/export\s+function\s+getCurrentConfig\b/.test(content));
  });

  it("plugin-config.ts exports dirtyCheckSaveButton", () => {
    const content = readFileSync(new URL("../src/lib/plugin-config.ts", import.meta.url), "utf-8");
    assert.ok(/export\s+function\s+dirtyCheckSaveButton\b/.test(content));
  });

  it("plugin-config.ts exports renderBuiltinSection", () => {
    const content = readFileSync(new URL("../src/lib/plugin-config.ts", import.meta.url), "utf-8");
    assert.ok(/export\s+function\s+renderBuiltinSection\b/.test(content));
  });
});

// ── Hooks page + lib module smoke tests ──

describe("Hooks page and lib modules", () => {
  it("hooks.ts page exports renderHooks", () => {
    const content = readFileSync(new URL("../src/pages/hooks.ts", import.meta.url), "utf-8");
    assert.ok(/export\s+(function|const|async\s+function)\s+renderHooks\b/.test(content));
  });

  it("hooks.ts is under 350 lines", () => {
    const content = readFileSync(new URL("../src/pages/hooks.ts", import.meta.url), "utf-8");
    assert.ok(content.split("\n").length <= 350);
  });

  it("hooks.ts lib exports helpers", () => {
    const content = readFileSync(new URL("../src/lib/hooks.ts", import.meta.url), "utf-8");
    for (const exp of [
      "hookField",
      "hookName",
      "formatHookCounter",
      "formatHookCounterJson",
      "parseHookCounter",
      "eventBadgeClass",
      "scopeBadgeClass",
      "modeBadgeClass",
      "fetchHooks",
      "fetchHook",
    ]) {
      assert.ok(
        new RegExp(`export\\s+(const|function|async\\s+function)\\s+${exp}\\b`).test(content),
        `hooks.ts should export ${exp}`,
      );
    }
  });

  it("hooks-list.ts exports loadHooks", () => {
    const content = readFileSync(new URL("../src/lib/hooks-list.ts", import.meta.url), "utf-8");
    assert.ok(/export\s+async\s+function\s+loadHooks\b/.test(content));
  });

  it("hooks-detail.ts exports showHookModal", () => {
    const content = readFileSync(new URL("../src/lib/hooks-detail.ts", import.meta.url), "utf-8");
    assert.ok(/export\s+async\s+function\s+showHookModal\b/.test(content));
  });

  it("router.ts registers the hooks route", () => {
    const content = readFileSync(new URL("../src/lib/router.ts", import.meta.url), "utf-8");
    assert.ok(/name:\s*"hooks"/.test(content));
    assert.ok(/import\s*\{[^}]*renderHooks[^}]*\}\s*from\s*"\.\.\/pages\/hooks"/.test(content));
  });
});

// ── Kanban Boards (config/boards.yml) ──

describe("Kanban boards lib", () => {
  it("kanban-boards.ts exports expected helpers", () => {
    const content = readFileSync(new URL("../src/lib/kanban-boards.ts", import.meta.url), "utf-8");
    const expected = [
      "KANBAN_BOARD_LS_KEY",
      "getStoredBoard",
      "setStoredBoard",
      "nextBoardOptions",
      "boardMoveEnabled",
      "fetchBoards",
      "upsertBoard",
      "deleteBoard",
      "openBoardModal",
      "populateBoardSelect",
      "wireBoardControls",
    ];
    for (const exp of expected) {
      assert.ok(
        new RegExp(`export\\s+(const|async\\s+function|function)\\s+${exp}\\b`).test(content),
        `kanban-boards.ts should export ${exp}`,
      );
    }
  });

  it("kanban-board.ts loadBoard accepts a board filter", () => {
    const content = readFileSync(new URL("../src/lib/kanban-board.ts", import.meta.url), "utf-8");
    assert.ok(/loadBoard\(showArchived: boolean, boardKey: string \| null = null\)/.test(content));
    assert.ok(/\/kanban\/tasks\?board=/.test(content));
  });

  it("pages/kanban.ts wires board controls + localStorage", () => {
    const content = readFileSync(new URL("../src/pages/kanban.ts", import.meta.url), "utf-8");
    assert.ok(/kanban-board-controls/.test(content));
    assert.ok(/wireBoardControls/.test(content));
    assert.ok(/getStoredBoard/.test(content));
    assert.ok(/setStoredBoard/.test(content));
    assert.ok(/\?board=/.test(content));
  });

  it("kanban-detail.ts has move-to-another-board", () => {
    const content = readFileSync(new URL("../src/lib/kanban-detail.ts", import.meta.url), "utf-8");
    assert.ok(/task-move-board/.test(content));
    assert.ok(/boardMoveEnabled/.test(content));
    assert.ok(/nextBoardOptions/.test(content));
  });

  it("api.ts declares board types + task.board", () => {
    const content = readFileSync(new URL("../src/lib/api.ts", import.meta.url), "utf-8");
    assert.ok(/interface BoardConfig/.test(content));
    assert.ok(/interface BoardEntry/.test(content));
    assert.ok(/board\?: string;/.test(content));
  });
});

// ── Threads page: merged-into badge for skipped threads (task_18cfafb9cf566e31) ──

describe("Threads page merged-into badge", () => {
  it("threads.ts declares merged_into_thread_id on ThreadRow", () => {
    const content = readFileSync(new URL("../src/pages/threads.ts", import.meta.url), "utf-8");
    assert.ok(/merged_into_thread_id:\s*number\s*\|\s*null;/.test(content));
  });

  it("mergedIntoBadge renders for skipped/merged threads with a recorded target (acceptance 3)", () => {
    const content = readFileSync(new URL("../src/pages/threads.ts", import.meta.url), "utf-8");
    // Early return when status is neither skipped nor merged, or no target is
    // recorded (the merged terminal state reuses the skipped badge + link).
    assert.ok(/row\.status\s*!==\s*"skipped"\s*&&\s*row\.status\s*!==\s*"merged"/.test(content));
    assert.ok(/function\s+mergedIntoBadge/.test(content));
  });

  it("badge links to the target thread on the Threads page (acceptance 1+2)", () => {
    const content = readFileSync(new URL("../src/pages/threads.ts", import.meta.url), "utf-8");
    assert.ok(/→ merged into thread #/.test(content));
    assert.ok(/\/threads\?thread_id=/.test(content));
    assert.ok(/merged-into-link/.test(content));
    assert.ok(/encodeURIComponent\(target\)/.test(content));
    assert.ok(/stopPropagation/.test(content));
  });
});

// ── Kanban task tags on the dashboard (task_18cfb485d7601e5e) ──

describe("Kanban task tags on the dashboard", () => {
  it("KanbanTask type carries an optional tags array (api.ts)", () => {
    const content = readFileSync(new URL("../src/lib/api.ts", import.meta.url), "utf-8");
    assert.ok(/tags\?:\s*string\[\];/.test(content));
  });

  it("board cards render colored tag badges derived from the tag name (kanban-board.ts)", () => {
    const content = readFileSync(new URL("../src/lib/kanban-board.ts", import.meta.url), "utf-8");
    assert.ok(/export function tagColor\(tag: string\): string/.test(content));
    assert.ok(/String\(Math\.abs\(h\) % 360\)/.test(content)); // deterministic hue per tag name
    assert.ok(/function renderTaskTags\(task: KanbanTask\): string/.test(content));
    assert.ok(/class="kanban-card-tags"/.test(content)); // badges container div
    assert.ok(/background:hsl\(\$\{hue\},55%,24%\)/.test(content)); // colored badge style
    assert.ok(/escapeHtml\(t\)/.test(content)); // XSS-safe tag label
    assert.ok(/renderTaskTags\(task\)/.test(content)); // embedded in every task card
  });
});

describe("Kanban history events for tags and dependencies", () => {
  it("tag add/remove render colored badges with 'was Tagged' / 'had Tag Removed' texts", () => {
    const content = readFileSync(new URL("../src/pages/kanban-history.ts", import.meta.url), "utf-8");
    assert.ok(/function tagBadge\(tag: string\): string/.test(content));
    assert.ok(/case "tag_added":\s*\{/.test(content));
    assert.ok(/was Tagged \$\{tag \? tagBadge\(tag\)/.test(content));
    assert.ok(/case "tag_removed":\s*\{/.test(content));
    assert.ok(/had Tag Removed/.test(content));
  });

  it("dependency add/remove render target id + title texts", () => {
    const content = readFileSync(new URL("../src/pages/kanban-history.ts", import.meta.url), "utf-8");
    assert.ok(/case "dependency_added":\s*\{/.test(content));
    assert.ok(/gained a dependency on/.test(content));
    assert.ok(/depends_on_id/.test(content));
    assert.ok(/case "dependency_removed":\s*\{/.test(content));
    assert.ok(/lost a dependency on/.test(content));
  });

  it("action filter dropdown exposes the four new actions", () => {
    const content = readFileSync(new URL("../src/pages/kanban-history.ts", import.meta.url), "utf-8");
    assert.ok(/value="tag_added">Tag Added<\/option>/.test(content));
    assert.ok(/value="tag_removed">Tag Removed<\/option>/.test(content));
    assert.ok(/value="dependency_added">Dependency Added<\/option>/.test(content));
    assert.ok(/value="dependency_removed">Dependency Removed<\/option>/.test(content));
  });
});

// ── Overview page widgets (task_18cfbf1ea5841a89) ──

describe("Overview page widgets", () => {
  it("api.ts declares the token-trend 3-series breakdown + kanban snapshot types", () => {
    const content = readFileSync(new URL("../src/lib/api.ts", import.meta.url), "utf-8");
    assert.ok(/input_cache_hit:\s*number;/.test(content));
    assert.ok(/input_cache_miss:\s*number;/.test(content));
    assert.ok(/output_tokens:\s*number;/.test(content));
    assert.ok(/interface KanbanSnapshotEntry/.test(content));
    assert.ok(/kanban_snapshot:\s*KanbanSnapshotEntry\[\];/.test(content));
  });

  it("Token Trend renders a stacked block chart with exactly 3 series (cache hit / cache miss / output)", () => {
    const content = readFileSync(new URL("../src/pages/overview.ts", import.meta.url), "utf-8");
    assert.ok(/function renderTokenTrendChart\(/.test(content));
    assert.ok(/id="chart-token"/.test(content));
    assert.ok(/Input \(cache hit\)/.test(content));
    assert.ok(/Input \(cache miss\)/.test(content));
    assert.ok(/name: "Output"/.test(content));
    // The old line chart must be gone
    assert.ok(!/renderLineChart/.test(content));
    assert.ok(!/chart-line/.test(content));
  });

  it("Token Trend x-axis renders real dates (Invalid Date guard)", () => {
    const content = readFileSync(new URL("../src/pages/overview.ts", import.meta.url), "utf-8");
    assert.ok(/T00:00:00Z/.test(content)); // dateStr normalization
    assert.ok(/isNaN\(d\.getTime\(\)\)/.test(content)); // fallback instead of "Invalid Date"
  });

  it("Kanban Snapshot rows link to the task detail page with board/task/status/tags/date columns", () => {
    const content = readFileSync(new URL("../src/pages/overview.ts", import.meta.url), "utf-8");
    assert.ok(/function renderKanbanSnapshotRow/.test(content));
    assert.ok(/\/kanban\/\$\{encodeURIComponent\(k\.task_id\)\}/.test(content));
    assert.ok(/role="columnheader">Board<\/div>/.test(content));
    assert.ok(/role="columnheader">Task<\/div>/.test(content));
    assert.ok(/role="columnheader">Status<\/div>/.test(content));
    assert.ok(/role="columnheader">Tags<\/div>/.test(content));
    assert.ok(/role="columnheader" style="text-align:right">Date<\/div>/.test(content));
  });

  it("Top Tools render real tool names with counts (no Unknown)", () => {
    const content = readFileSync(new URL("../src/pages/overview.ts", import.meta.url), "utf-8");
    assert.ok(/escapeHtml\(t\.tool\)/.test(content));
    assert.ok(/No tools used in 7 days/.test(content));
  });

  it("All 4 KPI stat cards have a short description instead of '-'", () => {
    const content = readFileSync(new URL("../src/pages/overview.ts", import.meta.url), "utf-8");
    assert.ok(/New threads created today/.test(content));
    assert.ok(/Average time to completion/.test(content));
    assert.ok(/Tokens consumed today/.test(content));
    assert.ok(/Channels with activity in 24h/.test(content));
  });
});
