/**
 * Preserve models.yml fields the Models page inline editor does not render.
 *
 * The Models page editor (`src/pages/models.ts`) rebuilds a provider entry from
 * its form inputs (`collectEditor`) and PUTs the whole models.yml back through
 * `/api/models` (a full-file replace). Anything the form does not render would
 * be dropped silently: provider `auth_style`, `api_key_header_name`,
 * `api_version_header`, `thinking_param`.
 *
 * Custom `headers` (provider-level and per-model) ARE rendered by the editor
 * since the custom-headers feature, so the editor owns them: `collectEditor`
 * emits the edited block and can therefore also clear it. Every other key NOT
 * owned by the editor is copied from the stored entry by
 * `mergeEditorProvider`, so an edit that touches only one field cannot erase
 * the rest of the provider definition.
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
  "headers",
]);

/**
 * Merge the editor's payload for a provider on top of the entry currently
 * stored in models.yml.
 *
 * - Editor-managed keys (incl. `headers` and each model's `headers`) come from
 *   `edited` (an omitted key = cleared, which is how a header row is removed).
 * - Every other key is copied from `existing`.
 */
export function mergeEditorProvider<T extends object>(existing: T | undefined, edited: T): T {
  if (!existing) return edited;
  const merged = { ...edited } as Record<string, unknown>;
  for (const [key, value] of Object.entries(existing as Record<string, unknown>)) {
    if (!EDITOR_MANAGED_KEYS.has(key)) merged[key] = value;
  }
  return merged as T;
}
