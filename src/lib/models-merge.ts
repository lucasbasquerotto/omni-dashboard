/**
 * Preserve models.yml fields the Models page inline editor does not render.
 *
 * The Models page editor (`src/pages/models.ts`) rebuilds a provider entry from
 * its form inputs (`collectEditor`) and PUTs the whole models.yml back through
 * `/api/models` (a full-file replace). Anything the form does not render used
 * to be dropped silently: provider `headers` (opencode-go's
 * `x-opencode-session`, required by the provider - without it OpenCode Go
 * answers HTTP 400 MissingSessionID), `auth_style`, `api_key_header_name`,
 * `api_version_header`, `thinking_param`, and per-model
 * `model_config.<model>.headers`.
 *
 * `mergeEditorProvider` keeps every key NOT owned by the editor (and per-model
 * `headers` for the model entries that survive the edit) from the stored entry,
 * so an edit that touches only one field cannot erase the rest of the provider
 * definition. Those fields stay editable by editing models.yml directly or via
 * the Import flow.
 */

/**
 * Keys the inline editor owns: `collectEditor` (re)builds them from the form
 * inputs, so an empty input intentionally clears the stored value. Every other
 * key belongs to models.yml and is preserved verbatim.
 */
export const EDITOR_MANAGED_KEYS: ReadonlySet<string> = new Set([
  "plugin",
  "models",
  "api_mode",
  "supports_reasoning",
  "default_base_url",
  "refresh_url",
  "default_model",
  "api_key",
  "token_budget_soft",
  "token_budget_hard",
  "max_tokens",
  "max_tokens_on_truncation",
  "model_config",
]);

/**
 * Merge the editor's payload for a provider on top of the entry currently
 * stored in models.yml.
 *
 * - Editor-managed keys come from `edited` (an omitted key = cleared).
 * - Every other key is copied from `existing`.
 * - `model_config` is editor-managed as a whole, but each surviving model
 *   entry keeps its stored `headers` (the editor has no header inputs).
 */
export function mergeEditorProvider<T extends object>(existing: T | undefined, edited: T): T {
  if (!existing) return edited;
  const merged = { ...edited } as Record<string, unknown>;
  for (const [key, value] of Object.entries(existing as Record<string, unknown>)) {
    if (!EDITOR_MANAGED_KEYS.has(key)) merged[key] = value;
  }

  const editedMc = (edited as Record<string, unknown>).model_config;
  const existingMc = (existing as Record<string, unknown>).model_config;
  if (isRecord(editedMc) && isRecord(existingMc)) {
    for (const model of Object.keys(editedMc)) {
      const prev = existingMc[model];
      const cur = editedMc[model];
      if (isRecord(prev) && isRecord(cur) && "headers" in prev) {
        cur.headers = prev.headers;
      }
    }
  }
  return merged as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
