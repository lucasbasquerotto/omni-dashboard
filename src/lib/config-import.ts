/**
 * Config-file Import flows for the non-plugin pages: workflows, schedules,
 * hooks, channels, actions, settings. Each flow reuses the shared import
 * modal (showImportFlow in plugin-import.ts) with a per-page YAML parser,
 * local-state fetch, plan (add/override/same) and write path.
 *
 * File → write path:
 *   /workflows → workflows.yml            → PUT /workflows/{key} per entry
 *   /schedules → tasks.yml `schedules:`   → POST /schedule per entry
 *   /hooks     → tasks.yml `hooks:`       → POST /hooks per entry
 *   /channels  → channels.yml             → PATCH /channels/{id} per entry
 *   /actions   → actions.yml              → POST /actions per entry
 *   /settings  → settings.yml             → PUT /settings {updates:[...]}
 */
import { apiGet, apiPost, apiPut, fetchWorkflows, upsertWorkflow, type Workflow } from "./api";
import {
  planModelsImportActions,
  showImportFlow,
  type BatchItem,
  type BatchResult,
  type ImportEntry,
  type ImportFlowConfig,
  type PlannedEntry,
} from "./plugin-import";

// ── Minimal indentation-based YAML parser ────────────────────────────────────
// Handles the config file shapes used by omniagent: top-level `section:` maps,
// nested key/value maps, inline lists `[a, b]`, quoted scalars, comments (#),
// CRLF, and "---"/"..." document markers. Returns a nested plain-object tree.

function stripComment(line: string): string {
  let quote: "'" | '"' | null = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quote) {
      if (ch === quote) quote = null;
    } else if (ch === "'" || ch === '"') {
      quote = ch;
    } else if (ch === "#") {
      return line.slice(0, i);
    }
  }
  return line;
}

function unquote(value: string): string {
  const v = value.trim();
  if (v.length >= 2) {
    const first = v[0];
    const last = v[v.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return v.slice(1, -1);
    }
  }
  return v;
}

function scalar(value: string): unknown {
  const v = unquote(value);
  if (v === "true") return true;
  if (v === "false") return false;
  if (v === "null" || v === "~") return null;
  if (/^-?\d+$/.test(v)) return Number(v);
  if (/^-?\d+\.\d+$/.test(v)) return Number(v);
  if (/^\[.*\]$/.test(v)) {
    return v
      .slice(1, -1)
      .split(",")
      .map((s) => unquote(s.trim()))
      .filter((s) => s !== "");
  }
  return v;
}

interface YamlLine {
  indent: number;
  content: string;
}

function tokenizeYaml(text: string): YamlLine[] {
  return text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((raw) => {
      const line = stripComment(raw).trimEnd();
      const content = line.trim();
      if (!content || content === "---" || content === "...") return null;
      return { indent: line.length - line.trimStart().length, content };
    })
    .filter((l): l is YamlLine => l !== null);
}

function parseMap(lines: YamlLine[], i: number, indent: number): { value: unknown; next: number } {
  const obj: Record<string, unknown> = {};
  while (i < lines.length) {
    const line = lines[i];
    if (line.indent < indent) break;
    if (line.indent > indent) {
      // Deeper than the current map level without a key: skip (defensive).
      i++;
      continue;
    }
    const kv = line.content.match(/^([A-Za-z0-9_.-]+):(?:\s*(.*))?$/);
    if (!kv) {
      i++;
      continue;
    }
    const key = kv[1];
    const rest = (kv[2] ?? "").trim();
    if (rest === "") {
      // Nested map or list (next line is deeper)
      if (i + 1 < lines.length && lines[i + 1].indent > line.indent) {
        const next = lines[i + 1];
        if (next.content.startsWith("- ")) {
          const list = parseList(lines, i + 1, next.indent);
          obj[key] = list.value;
          i = list.next;
        } else {
          const map = parseMap(lines, i + 1, next.indent);
          obj[key] = map.value;
          i = map.next;
        }
      } else {
        obj[key] = {};
        i++;
      }
    } else {
      obj[key] = scalar(rest);
      i++;
    }
  }
  return { value: obj, next: i };
}

function parseList(lines: YamlLine[], i: number, indent: number): { value: unknown[]; next: number } {
  const arr: unknown[] = [];
  while (i < lines.length) {
    const line = lines[i];
    if (line.indent < indent) break;
    if (line.indent > indent) {
      i++;
      continue;
    }
    const m = line.content.match(/^-\s*(.*)$/);
    if (!m) {
      i++;
      continue;
    }
    const rest = m[1].trim();
    if (rest === "" && i + 1 < lines.length && lines[i + 1].indent > line.indent) {
      const map = parseMap(lines, i + 1, lines[i + 1].indent);
      arr.push(map.value);
      i = map.next;
    } else if (rest.endsWith(":") && i + 1 < lines.length && lines[i + 1].indent > line.indent) {
      const next = lines[i + 1];
      const map = next.content.startsWith("- ")
        ? parseList(lines, i + 1, next.indent)
        : parseMap(lines, i + 1, next.indent);
      const item: Record<string, unknown> = {};
      item[rest.slice(0, -1)] = map.value;
      arr.push(item);
      i = map.next;
    } else {
      arr.push(scalar(rest));
      i++;
    }
  }
  return { value: arr, next: i };
}

/** Parse a YAML document into a nested plain object (best-effort). */
export function parseGenericYaml(text: string): Record<string, unknown> {
  if (!text || !text.trim()) {
    throw new Error("Invalid YAML: empty document");
  }
  const lines = tokenizeYaml(text);
  if (lines.length === 0) {
    throw new Error("Invalid YAML: empty document");
  }
  const root: Record<string, unknown> = {};
  let i = 0;
  const baseIndent = lines[0].indent;
  while (i < lines.length) {
    const line = lines[i];
    if (line.indent < baseIndent) {
      i++;
      continue;
    }
    const kv = line.content.match(/^([A-Za-z0-9_.-]+):(?:\s*(.*))?$/);
    if (!kv) {
      i++;
      continue;
    }
    const key = kv[1];
    const rest = (kv[2] ?? "").trim();
    if (rest === "" && i + 1 < lines.length && lines[i + 1].indent > line.indent) {
      const next = lines[i + 1];
      if (next.content.startsWith("- ")) {
        const list = parseList(lines, i + 1, next.indent);
        root[key] = list.value;
        i = list.next;
      } else {
        const map = parseMap(lines, i + 1, next.indent);
        root[key] = map.value;
        i = map.next;
      }
    } else {
      root[key] = rest === "" ? {} : scalar(rest);
      i++;
    }
  }
  return root;
}

// ── Shared entry helpers ──

function entriesFromSection(yml: Record<string, unknown>, section: string): ImportEntry[] {
  const sec = (yml[section] ?? {}) as Record<string, unknown>;
  return Object.entries(sec).map(([name, data]) => ({
    name,
    data: (data ?? {}) as Record<string, unknown>,
  }));
}

function describeScalarSummary(data: Record<string, unknown>): string {
  const bits: string[] = [];
  if (data.cron) bits.push(`cron: ${String(data.cron)}`);
  if (data.event) bits.push(`event: ${String(data.event)}`);
  if (data.tool_name) bits.push(`tool: ${String(data.tool_name)}`);
  if (data.profile) bits.push(`profile: ${String(data.profile)}`);
  if (data.channel) bits.push(`channel: ${String(data.channel)}`);
  if (data.workflow) bits.push(`workflow: ${String(data.workflow)}`);
  if (data.api_mode) bits.push(`api_mode: ${String(data.api_mode)}`);
  if (data.default_base_url) bits.push(String(data.default_base_url));
  return bits.join(" · ") || "definition";
}

function summaryLine(p: PlannedEntry): string {
  const data = p.data ?? {};
  const models = Array.isArray(data.models) ? (data.models as string[]).join(", ") : "";
  const roles =
    data.roles && typeof data.roles === "object" ? Object.keys(data.roles as object).join(", ") : "";
  if (roles) return `roles: ${roles}`;
  return describeScalarSummary(data) + (models ? ` · models: ${models}` : "");
}

// ── Workflows flow ──

export function showWorkflowsImportModal(onDone?: () => void): void {
  const flow: ImportFlowConfig = {
    title: "Import workflows from a workflows.yml-like file",
    urlLabel: "workflows.yml URL",
    urlPlaceholder: "https://raw.githubusercontent.com/user/repo/main/config/workflows.yml",
    entryNoun: "workflow",

    parse(text: string): ImportEntry[] {
      return entriesFromSection(parseGenericYaml(text), "workflows");
    },

    async fetchLocal() {
      const local: Record<string, Record<string, unknown>> = {};
      const workflows = await fetchWorkflows();
      for (const w of workflows) {
        local[w.key] = (w.workflow ?? {}) as Record<string, unknown>;
      }
      return local;
    },

    plan(entries: ImportEntry[], local: unknown) {
      return planModelsImportActions(entries, local as Record<string, Record<string, unknown>> | null);
    },

    describe(p: PlannedEntry) {
      const data = p.data ?? {};
      const extraBits: string[] = [];
      if (data.profile) extraBits.push(`profile: ${String(data.profile)}`);
      if (data.provider) extraBits.push(`provider: ${String(data.provider)}`);
      if (data.model) extraBits.push(`model: ${String(data.model)}`);
      return {
        subtitle: summaryLine(p),
        extra: extraBits.join(" · ") || undefined,
      };
    },

    async execute(items: BatchItem[]): Promise<BatchResult[]> {
      const results: BatchResult[] = [];
      for (const item of items) {
        if (item.action !== "add" && item.action !== "override") continue;
        try {
          if (!item.data) throw new Error(`No definition for workflow "${item.name}"`);
          await upsertWorkflow(item.name, item.data as Workflow);
          results.push({ name: item.name, action: item.action, ok: true });
        } catch (e: unknown) {
          results.push({
            name: item.name,
            action: item.action,
            ok: false,
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }
      return results;
    },
  };

  showImportFlow(flow, onDone);
}

// ── Schedules flow (tasks.yml `schedules:`) ──

export function showSchedulesImportModal(onDone?: () => void): void {
  const flow: ImportFlowConfig = {
    title: "Import schedules from a tasks.yml-like file",
    urlLabel: "tasks.yml URL",
    urlPlaceholder: "https://raw.githubusercontent.com/user/repo/main/config/tasks.yml",
    entryNoun: "schedule",

    parse(text: string): ImportEntry[] {
      return entriesFromSection(parseGenericYaml(text), "schedules");
    },

    async fetchLocal() {
      const local: Record<string, Record<string, unknown>> = {};
      try {
        const jobs = (await apiGet<Record<string, unknown>[]>("/schedule")) ?? [];
        for (const j of jobs) {
          local[String(j.id || j.name || "")] = j as Record<string, unknown>;
        }
      } catch {
        // local state unavailable: treat as empty
      }
      return local;
    },

    plan(entries: ImportEntry[], local: unknown) {
      return planModelsImportActions(entries, local as Record<string, Record<string, unknown>> | null);
    },

    describe(p: PlannedEntry) {
      const data = p.data ?? {};
      return {
        subtitle: `cron: ${String(data.cron ?? "-")}`,
        extra:
          [
            data.channel ? `channel: ${String(data.channel)}` : "",
            data.profile ? `profile: ${String(data.profile)}` : "",
          ]
            .filter(Boolean)
            .join(" · ") || undefined,
      };
    },

    async execute(items: BatchItem[]): Promise<BatchResult[]> {
      const results: BatchResult[] = [];
      for (const item of items) {
        if (item.action !== "add" && item.action !== "override") continue;
        try {
          const body = { name: item.name, ...(item.data ?? {}) };
          await apiPost("/schedule", body);
          results.push({ name: item.name, action: item.action, ok: true });
        } catch (e: unknown) {
          results.push({
            name: item.name,
            action: item.action,
            ok: false,
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }
      return results;
    },
  };

  showImportFlow(flow, onDone);
}

// ── Hooks flow (tasks.yml `hooks:`) ──

export function showHooksImportModal(onDone?: () => void): void {
  const flow: ImportFlowConfig = {
    title: "Import hooks from a tasks.yml-like file",
    urlLabel: "tasks.yml URL",
    urlPlaceholder: "https://raw.githubusercontent.com/user/repo/main/config/tasks.yml",
    entryNoun: "hook",

    parse(text: string): ImportEntry[] {
      return entriesFromSection(parseGenericYaml(text), "hooks");
    },

    async fetchLocal() {
      const local: Record<string, Record<string, unknown>> = {};
      try {
        const hooks = (await apiGet<Record<string, unknown>[]>("/hooks")) ?? [];
        for (const h of hooks) {
          local[String(h.id || h.name || "")] = h as Record<string, unknown>;
        }
      } catch {
        // local state unavailable: treat as empty
      }
      return local;
    },

    plan(entries: ImportEntry[], local: unknown) {
      return planModelsImportActions(entries, local as Record<string, Record<string, unknown>> | null);
    },

    describe(p: PlannedEntry) {
      const data = p.data ?? {};
      return {
        subtitle: `event: ${String(data.event ?? "-")}`,
        extra:
          [
            data.scope ? `scope: ${String(data.scope)}` : "",
            data.target ? `target: ${String(data.target)}` : "",
          ]
            .filter(Boolean)
            .join(" · ") || undefined,
      };
    },

    async execute(items: BatchItem[]): Promise<BatchResult[]> {
      const results: BatchResult[] = [];
      for (const item of items) {
        if (item.action !== "add" && item.action !== "override") continue;
        try {
          const data = item.data ?? {};
          if (!data.event) {
            throw new Error(`Hook "${item.name}" is missing "event"`);
          }
          const body = { name: item.name, ...data };
          await apiPost("/hooks", body);
          results.push({ name: item.name, action: item.action, ok: true });
        } catch (e: unknown) {
          results.push({
            name: item.name,
            action: item.action,
            ok: false,
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }
      return results;
    },
  };

  showImportFlow(flow, onDone);
}

// ── Channels flow (channels.yml `channels:`) ──

const CHANNEL_RUNTIME_FIELDS = [
  "profile",
  "provider",
  "model",
  "closed",
  "readonly",
  "plan",
  "template",
] as const;

export function showChannelsImportModal(onDone?: () => void): void {
  const flow: ImportFlowConfig = {
    title: "Import channels from a channels.yml-like file",
    urlLabel: "channels.yml URL",
    urlPlaceholder: "https://raw.githubusercontent.com/user/repo/main/config/channels.yml",
    entryNoun: "channel",

    parse(text: string): ImportEntry[] {
      return entriesFromSection(parseGenericYaml(text), "channels");
    },

    async fetchLocal() {
      const local: Record<string, Record<string, unknown>> = {};
      try {
        const channels = (await apiGet<Record<string, unknown>[]>("/channels")) ?? [];
        for (const c of channels) {
          local[String(c.id || c.name || "")] = c as Record<string, unknown>;
        }
      } catch {
        // local state unavailable: treat as empty
      }
      return local;
    },

    plan(entries: ImportEntry[], local: unknown) {
      return planModelsImportActions(entries, local as Record<string, Record<string, unknown>> | null);
    },

    describe(p: PlannedEntry) {
      const data = p.data ?? {};
      return {
        subtitle: data.platform ? `platform: ${String(data.platform)}` : "channel definition",
        extra: data.resource_identifier ? `resource: ${String(data.resource_identifier)}` : undefined,
      };
    },

    async execute(items: BatchItem[]): Promise<BatchResult[]> {
      const results: BatchResult[] = [];
      for (const item of items) {
        if (item.action !== "add" && item.action !== "override") continue;
        try {
          const data = item.data ?? {};
          const body: Record<string, unknown> = {};
          for (const f of CHANNEL_RUNTIME_FIELDS) {
            if (data[f] !== undefined) body[f] = data[f];
          }
          const res = await fetch(`/api/channels/${encodeURIComponent(item.name)}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
          if (!res.ok) {
            const text = await res.text().catch(() => "");
            throw new Error(`${res.status}: ${text}`);
          }
          results.push({ name: item.name, action: item.action, ok: true });
        } catch (e: unknown) {
          results.push({
            name: item.name,
            action: item.action,
            ok: false,
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }
      return results;
    },
  };

  showImportFlow(flow, onDone);
}

// ── Actions flow (actions.yml `actions:`) ──

export function showActionsImportModal(onDone?: () => void): void {
  const flow: ImportFlowConfig = {
    title: "Import actions from an actions.yml-like file",
    urlLabel: "actions.yml URL",
    urlPlaceholder: "https://raw.githubusercontent.com/user/repo/main/config/actions.yml",
    entryNoun: "action",

    parse(text: string): ImportEntry[] {
      return entriesFromSection(parseGenericYaml(text), "actions");
    },

    async fetchLocal() {
      const local: Record<string, Record<string, unknown>> = {};
      try {
        const actions = (await apiGet<Record<string, unknown>[]>("/actions")) ?? [];
        for (const a of actions) {
          local[String(a.id || a.name || "")] = a as Record<string, unknown>;
        }
      } catch {
        // local state unavailable: treat as empty
      }
      return local;
    },

    plan(entries: ImportEntry[], local: unknown) {
      return planModelsImportActions(entries, local as Record<string, Record<string, unknown>> | null);
    },

    describe(p: PlannedEntry) {
      const data = p.data ?? {};
      return {
        subtitle: data.tool_name ? `tool: ${String(data.tool_name)}` : "action definition",
        extra:
          data.description && String(data.description) !== "undefined"
            ? String(data.description).slice(0, 120)
            : undefined,
      };
    },

    async execute(items: BatchItem[]): Promise<BatchResult[]> {
      const results: BatchResult[] = [];
      for (const item of items) {
        if (item.action !== "add" && item.action !== "override") continue;
        try {
          const data = item.data ?? {};
          if (!data.tool_name) {
            throw new Error(`Action "${item.name}" is missing "tool_name"`);
          }
          const body: Record<string, unknown> = {
            name: item.name,
            tool_name: data.tool_name,
          };
          if (data.params !== undefined) body.params = data.params;
          if (data.description !== undefined) body.description = data.description;
          await apiPost("/actions", body);
          results.push({ name: item.name, action: item.action, ok: true });
        } catch (e: unknown) {
          results.push({
            name: item.name,
            action: item.action,
            ok: false,
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }
      return results;
    },
  };

  showImportFlow(flow, onDone);
}

// ── Settings flow (settings.yml) ──

export function showSettingsImportModal(onDone?: () => void): void {
  const flow: ImportFlowConfig = {
    title: "Import settings from a settings.yml-like file",
    urlLabel: "settings.yml URL",
    urlPlaceholder: "https://raw.githubusercontent.com/user/repo/main/config/settings.yml",
    entryNoun: "setting",

    parse(text: string): ImportEntry[] {
      const yml = parseGenericYaml(text);
      // Accept either a `settings:` section or a flat name→value map.
      const section =
        yml.settings !== undefined && typeof yml.settings === "object"
          ? (yml.settings as Record<string, unknown>)
          : yml;
      return Object.entries(section).map(([name, value]) => ({
        name,
        data: { value },
      }));
    },

    async fetchLocal() {
      const local: Record<string, Record<string, unknown>> = {};
      try {
        const resp = (await apiGet<{
          categories?: { name: string; settings: { name: string; value: string }[] }[];
        }>("/settings")) ?? { categories: [] };
        for (const cat of resp.categories ?? []) {
          for (const s of cat.settings ?? []) {
            local[s.name] = { value: s.value };
          }
        }
      } catch {
        // local state unavailable: treat as empty
      }
      return local;
    },

    plan(entries: ImportEntry[], local: unknown) {
      return planModelsImportActions(entries, local as Record<string, Record<string, unknown>> | null);
    },

    describe(p: PlannedEntry) {
      const data = p.data ?? {};
      return {
        subtitle: data.value !== undefined ? `value: ${String(data.value).slice(0, 80)}` : "setting",
      };
    },

    async execute(items: BatchItem[]): Promise<BatchResult[]> {
      const results: BatchResult[] = [];
      const updates: { name: string; value: string }[] = [];
      for (const item of items) {
        if (item.action !== "add" && item.action !== "override") continue;
        const value = (item.data ?? {}).value;
        if (value === undefined || value === null) {
          results.push({ name: item.name, action: item.action, ok: false, error: "missing value" });
          continue;
        }
        updates.push({ name: item.name, value: String(value) });
      }
      if (updates.length > 0) {
        try {
          await apiPut("/settings", { updates });
          for (const u of updates) {
            results.push({ name: u.name, action: "override", ok: true });
          }
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          for (const u of updates) {
            results.push({ name: u.name, action: "override", ok: false, error: msg });
          }
        }
      }
      return results;
    },
  };

  showImportFlow(flow, onDone);
}
