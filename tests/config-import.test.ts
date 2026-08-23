import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, "..", "src");
const cfg = readFileSync(join(src, "lib", "config-import.ts"), "utf-8");

// ── Item 9: Import buttons on workflows/schedules/hooks/channels/actions/settings ──
// Static source assertions (repo pattern: database.test.ts, models.test.ts) —
// the dynamic-import pattern is a no-op under node ESM (extensionless imports).

describe("Config import wiring (config-import.ts, item 9)", () => {
  const pages: { file: string; btnId: string; modalFn: string; reload: RegExp }[] = [
    {
      file: "workflows.ts",
      btnId: "wf-import-btn",
      modalFn: "showWorkflowsImportModal",
      reload: /showWorkflowsImportModal\(\(\) => void loadWorkflows\(\)\)/,
    },
    {
      file: "schedule.ts",
      btnId: "schedule-import-btn",
      modalFn: "showSchedulesImportModal",
      reload: /showSchedulesImportModal\(\(\) => void loadCronJobs\(_activeOnly, \(\) => \{\}\)\)/,
    },
    {
      file: "hooks.ts",
      btnId: "hooks-import-btn",
      modalFn: "showHooksImportModal",
      reload: /showHooksImportModal\(\(\) => void loadHooks\(\)\)/,
    },
    {
      file: "channels.ts",
      btnId: "channels-import-btn",
      modalFn: "showChannelsImportModal",
      reload: /showChannelsImportModal\(\(\) => void loadChannels\(\)\)/,
    },
    {
      file: "actions.ts",
      btnId: "actions-import-btn",
      modalFn: "showActionsImportModal",
      reload: /showActionsImportModal\(\(\) => void loadActions\(\)\)/,
    },
    {
      file: "settings.ts",
      btnId: "settings-import-btn",
      modalFn: "showSettingsImportModal",
      reload: /showSettingsImportModal\(\(\) => void loadSettings\(\)\)/,
    },
  ];

  for (const p of pages) {
    it(`${p.file}: Import button wired to ${p.modalFn}`, () => {
      const pageSrc = readFileSync(join(src, "pages", p.file), "utf-8");
      assert.match(
        pageSrc,
        new RegExp(
          `import\\s*\\{[^}]*${p.modalFn}[^}]*\\}\\s*from\\s*["']\\.\\./lib/config-import["']`,
        ),
        `${p.file} must import ${p.modalFn} from ../lib/config-import`,
      );
      assert.ok(pageSrc.includes(`id="${p.btnId}"`), `${p.file} must render ${p.btnId}`);
      assert.match(pageSrc, p.reload, `${p.file} must open the modal and reload on done`);
    });
  }

  it("parses each config file's expected section (workflows/schedules/hooks/channels/actions)", () => {
    for (const section of ["workflows", "schedules", "hooks", "channels", "actions"]) {
      assert.ok(
        cfg.includes(`entriesFromSection(parseGenericYaml(text), "${section}")`),
        `config-import must parse the "${section}" section`,
      );
    }
  });

  it("settings flow accepts a flat name→value map or a settings: section", () => {
    assert.ok(
      cfg.includes(
        'const section = yml.settings !== undefined && typeof yml.settings === "object" ? (yml.settings as Record<string, unknown>) : yml;',
      ),
      "settings flow must fall back to a flat map",
    );
  });

  it("routes imports to the right write paths", () => {
    // /workflows → workflows.yml via upsertWorkflow
    assert.match(cfg, /upsertWorkflow\(item\.name, item\.data as Workflow\)/);
    // /schedules → tasks.yml `schedules:` via POST /schedule
    assert.match(cfg, /apiPost\("\/schedule", body\)/);
    // /hooks → tasks.yml `hooks:` via POST /hooks, event required
    assert.match(cfg, /apiPost\("\/hooks", body\)/);
    assert.match(cfg, /Hook "\$\{item\.name\}" is missing "event"/);
    // /channels → channels.yml via PATCH /api/channels/{id}
    assert.match(cfg, /fetch\(`\/api\/channels\/\$\{encodeURIComponent\(item\.name\)\}`/);
    assert.match(cfg, /method: "PATCH"/);
    // /actions → actions.yml via POST /actions, tool_name required
    assert.match(cfg, /apiPost\("\/actions", body\)/);
    assert.match(cfg, /Action "\$\{item\.name\}" is missing "tool_name"/);
    // /settings → settings.yml via PUT /settings {updates}
    assert.match(cfg, /apiPut\("\/settings", \{ updates \}\)/);
  });

  it("reuses the shared import modal + planner for all six flows", () => {
    const uses = (cfg.match(/showImportFlow\(flow, onDone\)/g) || []).length;
    assert.equal(uses, 6, "each of the six flows must call showImportFlow");
    assert.equal((cfg.match(/planModelsImportActions\(/g) || []).length, 6);
    assert.ok(cfg.includes('import { apiGet, apiPost, apiPut, fetchWorkflows, upsertWorkflow'));
  });

  it("exports a generic YAML parser used by every flow", () => {
    assert.ok(cfg.includes("export function parseGenericYaml(text: string): Record<string, unknown>"));
    assert.ok(cfg.includes('throw new Error("Invalid YAML: empty document")'));
  });
});
