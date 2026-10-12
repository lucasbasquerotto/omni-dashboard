/**
 * Custom HTTP header helpers for the Models page (`src/pages/models.ts`).
 *
 * models.yml supports a per-provider `headers` block and a per-model
 * `model_config.<model>.headers` block (see omniagent `src/models_yaml.rs`,
 * `HeaderValue`). A header value is either a plain literal string or a typed
 * value core resolves at request time against the running thread:
 *
 *   headers:
 *     x-opencode-session: { type: channel, fallback: omniagent }
 *     x-custom-flag: "some literal"
 *
 * `type: channel` / `type: profile` resolve to the channel / profile name of
 * the request; the optional `fallback` is used only when that context is
 * absent or blank (it is how a provider that REQUIRES a header keeps it on
 * every request path). This module holds the value-shape + validation logic
 * the page uses, so it is unit-testable without a DOM.
 */

/** The three value shapes the Models page editor exposes. */
export type HeaderKind = "literal" | "channel" | "profile";

/** A typed header value as models.yml stores it. */
export interface TypedHeaderValue {
  type: "channel" | "profile";
  fallback?: string;
}

/** A models.yml header value: a literal string or a typed value. */
export type HeaderValue = string | TypedHeaderValue;

/** One editable header row, in editor order. */
export interface HeaderEntry {
  name: string;
  value: HeaderValue;
}

/**
 * HTTP header FIELD NAME grammar (RFC 7230 `token`). Anything else (spaces,
 * colons, newlines, empty) is rejected so an invalid name can never be
 * persisted into models.yml and break the request.
 */
const HEADER_NAME_RE = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

export function isValidHeaderName(name: string): boolean {
  return HEADER_NAME_RE.test(name);
}

/** Value shape of a stored header value. */
export function headerKind(value: HeaderValue): HeaderKind {
  if (typeof value === "string") return "literal";
  return value.type === "profile" ? "profile" : "channel";
}

/** Literal text of a header value ("" for typed values). */
export function headerLiteral(value: HeaderValue): string {
  return typeof value === "string" ? value : "";
}

/** Fallback text of a typed header value ("" for literals / no fallback). */
export function headerFallback(value: HeaderValue): string {
  return typeof value === "string" ? "" : (value.fallback ?? "");
}

/**
 * Build the stored value for one row. Returns undefined when the row carries
 * no usable value yet (literal with blank text), so the caller can report it
 * instead of writing an empty header (an empty value is indistinguishable from
 * a missing one upstream - OpenCode Go answers 400 MissingSessionID).
 */
export function buildHeaderValue(
  kind: HeaderKind,
  literal: string,
  fallback: string,
): HeaderValue | undefined {
  if (kind === "literal") {
    const v = literal.trim();
    return v ? v : undefined;
  }
  const fb = fallback.trim();
  return fb ? { type: kind, fallback: fb } : { type: kind };
}

/** One-line description of a header value for the read-only provider card. */
export function headerDisplay(value: HeaderValue): string {
  if (typeof value === "string") return JSON.stringify(value);
  return value.fallback ? `${value.type} (fallback: ${value.fallback})` : value.type;
}

/** `name: display, ...` for a headers block; "" when there is no header. */
export function headersDisplay(headers: Record<string, HeaderValue> | undefined | null): string {
  if (!headers) return "";
  const names = Object.keys(headers);
  if (names.length === 0) return "";
  return names.map((n) => `${n}: ${headerDisplay(headers[n])}`).join(", ");
}

/**
 * Turn ordered editor rows into the models.yml headers block.
 *
 * Duplicate policy (requirement 5): a duplicate header name (case-insensitive,
 * HTTP names are case-insensitive) is REJECTED with a message - never a silent
 * overwrite of an operator-provided value.
 *
 * Returns `{ record }` (record undefined when every row was empty, i.e. the
 * caller omits the whole block) or `{ error }` naming the offending row.
 */
export function entriesToRecord(entries: HeaderEntry[]): {
  record?: Record<string, HeaderValue>;
  error?: string;
} {
  const out: Record<string, HeaderValue> = {};
  for (const entry of entries) {
    const name = entry.name.trim();
    if (!name) return { error: "header name must not be empty" };
    if (!isValidHeaderName(name)) return { error: `invalid HTTP header name "${name}"` };
    const dup = Object.keys(out).find((k) => k.toLowerCase() === name.toLowerCase());
    if (dup !== undefined) return { error: `duplicate header "${name}" (already defined as "${dup}")` };
    out[name] = entry.value;
  }
  return { record: Object.keys(out).length > 0 ? out : undefined };
}

/** Stored headers block -> ordered editor entries (literal first, then typed). */
export function recordToEntries(headers: Record<string, HeaderValue> | undefined | null): HeaderEntry[] {
  if (!headers) return [];
  return Object.entries(headers).map(([name, value]) => ({ name, value }));
}
