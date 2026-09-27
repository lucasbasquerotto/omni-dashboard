import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// ── Threads page: per-thread Stop button (task_omnidev_kanban_status_change_processing_todo) ──
//
// Operator bug (telegram 2026-09-27): "clicking Stop on one thread stopped BOTH
// threads". The dashboard end of that fix is that the per-thread Stop button must
// talk to the PER-THREAD endpoint (`/api/threads/:id/stop` -> core
// `/stop-thread/:id`) and report the PER-THREAD result; it must never fall back to
// the channel-scoped stop (`/api/channels/:id/stop`), which intentionally stops
// EVERY thread of the channel.
//
// These assertions pin the wiring so a refactor cannot silently re-point the button
// at the channel-scoped endpoint or drop the per-thread result reporting. The
// backend isolation itself is covered by the omniagent DB regressions
// (server::tests::per_thread_stop_recovery_never_touches_sibling_threads) and the
// live dev-stack API check.

const read = (p: string): string => readFileSync(new URL(`../${p}`, import.meta.url), "utf-8");

const threadsSrc = read("src/pages/threads.ts");
const serverSrc = read("server/index.ts");

const stopBlock = (): string => {
  const i = threadsSrc.indexOf('document.querySelectorAll(".thread-stop-btn")');
  assert.ok(i > 0, "the per-thread stop button wiring exists");
  return threadsSrc.slice(i, i + 2500);
};

describe("Threads page per-thread Stop", () => {
  it("POSTs the PER-THREAD endpoint and never the channel-scoped stop", () => {
    const block = stopBlock();
    assert.match(
      block,
      /fetch\(`\/api\/threads\/\$\{encodeURIComponent\(threadId\)\}\/stop`/,
      "single-thread stop hits /api/threads/:id/stop",
    );
    assert.match(block, /method: "POST"/, "stop is a POST");
    assert.ok(
      !/api\/channels\//.test(block),
      "a single-thread stop must not use the channel-scoped /api/channels/:id/stop",
    );
  });

  it("reports the per-thread result body (skipped / task_blocked / error)", () => {
    const block = stopBlock();
    assert.match(block, /await res\.json\(\)/, "reads the per-thread result body");
    assert.match(block, /payload\.skipped \?\? 0/, "uses the per-thread skipped count");
    assert.match(block, /payload\.task_blocked/, "reports whether the task moved to blocked");
    assert.match(block, /was not running/, "an already-terminal thread is reported as not running");
    assert.match(
      block,
      /payload\.status === "error" \|\| payload\.error/,
      "a per-thread error result is surfaced instead of a success toast",
    );
  });

  it("the dashboard proxy forwards the per-thread stop to core /stop-thread/:id", () => {
    const i = serverSrc.indexOf('app.post("/api/threads/:threadId/stop"');
    assert.ok(i > 0, "the per-thread proxy route exists as a POST route");
    const block = serverSrc.slice(i, i + 400);
    assert.match(
      block,
      /\/stop-thread\/\$\{encodeURIComponent\(threadId\)\}/,
      "forwarded to the core per-thread endpoint",
    );
  });
});
