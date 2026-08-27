/**
 * Kanban create-task modal: HTML + wiring.
 * Extracted from src/pages/kanban.ts (keeps that page under 350 lines).
 * Adds Board + Workflow fields (Board pre-filled with the current board;
 * Workflow options mirror the board modal's workflow select).
 */
import { apiGet } from "./api";
import { fetchBoards, populateBoardSelect, populateWorkflowSelect } from "./kanban-boards";
import { enhanceSelect, syncSelectDisplay } from "./dropdown";
import { formatApiError } from "./helpers";

// ── Channel / Profile / Template population helpers ──

export async function populateCreateChannelSelect(): Promise<void> {
  const select = document.getElementById("task-create-channel") as HTMLSelectElement | null;
  if (!select) return;
  try {
    const channels = (await apiGet("/channels")) as Record<string, unknown>[];
    const kanbanChannel = channels.find((ch: Record<string, unknown>) => ch.platform === "kanban");
    select.innerHTML = '<option value="">None</option>';
    for (const ch of channels) {
      const opt = document.createElement("option");
      const chAny = ch as Record<string, string>;
      opt.value = chAny.id || chAny.name || "";
      opt.textContent = chAny.name || chAny.id || "";
      if (
        kanbanChannel &&
        (opt.value === (kanbanChannel as Record<string, string>).id ||
          opt.value === (kanbanChannel as Record<string, string>).name ||
          opt.value === (kanbanChannel as Record<string, string>).channel)
      ) {
        opt.selected = true;
      }
      select.appendChild(opt);
    }
    refreshEnhancedSelect("task-create-channel");
  } catch {
    select.innerHTML = '<option value="">Error loading channels</option>';
  }
}

export async function populateProfileSelect(selectId: string): Promise<void> {
  const select = document.getElementById(selectId) as HTMLSelectElement | null;
  if (!select) return;
  try {
    const profiles = await apiGet<any[]>("/profiles");
    select.innerHTML = '<option value="">None</option>';
    for (const p of profiles) {
      const name = typeof p === "string" ? p : p.name || "";
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name;
      select.appendChild(opt);
    }
    refreshEnhancedSelect(selectId);
  } catch (e) {
    console.error("Failed to load profiles:", e);
    select.innerHTML = '<option value="">Error loading profiles</option>';
  }
}

export async function populateTemplatesSelect(selectId: string): Promise<void> {
  const select = document.getElementById(selectId) as HTMLSelectElement | null;
  if (!select) return;
  try {
    const templates = await apiGet<{ profile: string; name: string; label: string }[]>("/templates");
    select.innerHTML = '<option value="">None</option>';
    for (const t of templates) {
      const opt = document.createElement("option");
      opt.value = t.name;
      opt.textContent = `${t.name} (${t.profile})`;
      select.appendChild(opt);
    }
    refreshEnhancedSelect(selectId);
  } catch (e) {
    console.error("Failed to load templates:", e);
    select.innerHTML = '<option value="">Error loading templates</option>';
  }
}

function refreshEnhancedSelect(selectId: string): void {
  const select = document.getElementById(selectId) as HTMLSelectElement | null;
  if (!select) return;
  const wrapper = select.nextElementSibling as HTMLElement | null;
  if (wrapper && wrapper.classList.contains("custom-select")) {
    wrapper.remove();
  }
  (select as any).dataset._enhanced = "";
  select.style.display = "";
  enhanceSelect(selectId);
}

/** Populate every create-task select (channel/profile/template/board/workflow). */
export async function populateTaskCreateSelects(currentBoard: string | null): Promise<void> {
  await populateCreateChannelSelect();
  await populateProfileSelect("task-create-profile");
  await populateTemplatesSelect("task-create-template");
  await populateBoardSelect("task-create-board", currentBoard);
  let wf: string | null = null;
  if (currentBoard) {
    const boards = await fetchBoards();
    wf = boards.find((b) => b.key === currentBoard)?.board?.workflow ?? null;
  }
  await populateWorkflowSelect("task-create-workflow", wf);
}

// ── Modal HTML ──

const inputStyle =
  "width:100%;padding:0.5rem;border-radius:6px;border:1px solid var(--glass-border);background:rgba(255,255,255,0.04);color:inherit;font-size:0.85rem;box-sizing:border-box;";
const labelStyle = "display:block;font-size:0.8rem;color:var(--text-muted);margin-bottom:0.25rem;";

export function createTaskModalHTML(): string {
  return `
    <div id="create-task-modal" style="display:none;position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.85);z-index:1000;align-items:flex-start;justify-content:center;padding-top:10vh;">
      <div style="background:#1a1a2e;border-radius:8px;padding:1.5rem;max-width:500px;width:90%;border:1px solid var(--glass-border,rgba(255,255,255,0.08));">
        <h2 style="margin:0 0 1rem 0;font-size:1.1rem;">Create Task</h2>
        <div style="display:grid;gap:0.75rem;">
          <div>
            <label style="${labelStyle}">Title *</label>
            <input type="text" id="task-create-title" style="${inputStyle}" />
          </div>
          <div>
            <label style="${labelStyle}">Body</label>
            <textarea id="task-create-body" rows="3" style="${inputStyle}resize:vertical;"></textarea>
          </div>
          <div>
            <label style="${labelStyle}">Priority</label>
            <select id="task-create-priority" style="${inputStyle}">
              <option value="0">Low</option>
              <option value="1">Med</option>
              <option value="3">High</option>
              <option value="5">Critical</option>
            </select>
          </div>
          <div>
            <label style="${labelStyle}">Status</label>
            <select id="task-create-status" style="${inputStyle}">
              <option value="backlog">Backlog</option>
              <option value="todo">Todo</option>
              <option value="running">In Progress</option>
              <option value="testing">Testing</option>
              <option value="review">Review</option>
              <option value="blocked">Blocked</option>
              <option value="done">Done</option>
            </select>
          </div>
          <div>
            <label style="${labelStyle}">Board</label>
            <select id="task-create-board" style="${inputStyle}">
              <option value="">None</option>
            </select>
          </div>
          <div>
            <label style="${labelStyle}">Workflow</label>
            <select id="task-create-workflow" style="${inputStyle}">
              <option value="">(none)</option>
            </select>
          </div>
          <div>
            <label style="${labelStyle}">Channel</label>
            <select id="task-create-channel" style="${inputStyle}">
              <option value="">Loading...</option>
            </select>
          </div>
          <div>
            <label style="${labelStyle}">Profile</label>
            <select id="task-create-profile" style="${inputStyle}">
              <option value="">None</option>
            </select>
          </div>
          <div>
            <label style="${labelStyle}">Template</label>
            <select id="task-create-template" style="${inputStyle}">
              <option value="">None</option>
            </select>
            <div style="font-size:0.7rem;color:var(--text-muted);margin-top:0.2rem;">Structured guidance injected into the agent's prompt. Create .md files in profiles/&lt;name&gt;/templates/</div>
          </div>
        </div>
        <div style="display:flex;gap:0.5rem;justify-content:flex-end;margin-top:1rem;">
          <button id="task-create-cancel" style="background:rgba(148,163,184,0.1);border:1px solid var(--glass-border);color:var(--text-secondary);border-radius:6px;padding:0.375rem 0.75rem;cursor:pointer;font-size:0.8rem;">Cancel</button>
          <button id="task-create-submit" style="background:rgba(139,92,246,0.2);border:1px solid rgba(139,92,246,0.4);color:var(--accent-purple);border-radius:6px;padding:0.375rem 0.75rem;cursor:pointer;font-size:0.8rem;font-weight:500;">Create</button>
        </div>
      </div>
    </div>
  `;
}

// ── Wiring ──

export function closeCreateModal(): void {
  const modal = document.getElementById("create-task-modal");
  if (modal) modal.style.display = "none";
  const title = document.getElementById("task-create-title") as HTMLInputElement | null;
  if (title) title.value = "";
  const body = document.getElementById("task-create-body") as HTMLTextAreaElement | null;
  if (body) body.value = "";
  const priority = document.getElementById("task-create-priority") as HTMLSelectElement | null;
  if (priority) priority.value = "0";
  syncSelectDisplay("task-create-priority");
  syncSelectDisplay("task-create-status");
  const channel = document.getElementById("task-create-channel") as HTMLSelectElement | null;
  if (channel) channel.value = "";
  syncSelectDisplay("task-create-channel");
  const profile = document.getElementById("task-create-profile") as HTMLSelectElement | null;
  if (profile) profile.value = "";
  syncSelectDisplay("task-create-profile");
  const planEl = document.getElementById("task-create-plan") as HTMLSelectElement | null;
  if (planEl) {
    planEl.value = "";
    syncSelectDisplay("task-create-plan");
  }
  const template = document.getElementById("task-create-template") as HTMLSelectElement | null;
  if (template) {
    template.value = "";
    syncSelectDisplay("task-create-template");
  }
  const board = document.getElementById("task-create-board") as HTMLSelectElement | null;
  if (board) {
    board.value = "";
    syncSelectDisplay("task-create-board");
  }
  const workflow = document.getElementById("task-create-workflow") as HTMLSelectElement | null;
  if (workflow) {
    workflow.value = "";
    syncSelectDisplay("task-create-workflow");
  }
}

/** Wire the Create Task button, modal cancel/submit, and enhanced selects. */
export function wireCreateTaskModal(opts: { getBoard: () => string | null; onCreated: () => void }): void {
  document.getElementById("create-task-btn")?.addEventListener("click", async () => {
    const modal = document.getElementById("create-task-modal");
    if (!modal) return;
    await populateTaskCreateSelects(opts.getBoard());
    modal.style.display = "flex";
  });

  document.getElementById("task-create-cancel")?.addEventListener("click", () => {
    closeCreateModal();
  });

  document.getElementById("task-create-submit")?.addEventListener("click", async () => {
    const titleInput = document.getElementById("task-create-title") as HTMLInputElement | null;
    if (!titleInput) return;
    const title = titleInput.value.trim();
    if (!title) return;

    const body =
      (document.getElementById("task-create-body") as HTMLTextAreaElement | null)?.value.trim() || undefined;
    const priority = parseInt(
      (document.getElementById("task-create-priority") as HTMLSelectElement | null)?.value || "0",
    );
    const channel =
      (document.getElementById("task-create-channel") as HTMLSelectElement | null)?.value || undefined;
    const profile =
      (document.getElementById("task-create-profile") as HTMLSelectElement | null)?.value || undefined;
    const status =
      (document.getElementById("task-create-status") as HTMLSelectElement | null)?.value || "backlog";
    const template =
      (document.getElementById("task-create-template") as HTMLSelectElement | null)?.value || undefined;
    const board =
      (document.getElementById("task-create-board") as HTMLSelectElement | null)?.value || undefined;
    const workflow =
      (document.getElementById("task-create-workflow") as HTMLSelectElement | null)?.value || undefined;

    try {
      const reqBody: Record<string, unknown> = {
        title,
        body,
        priority,
        channel,
        profile,
        status,
        template,
        board,
        workflow,
      };
      const res = await fetch("/api/kanban/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reqBody),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "Unknown error");
        throw new Error(`${res.status}: ${text}`);
      }
      closeCreateModal();
      opts.onCreated();
    } catch (e) {
      alert("Failed to create task: " + formatApiError(e));
    }
  });

  enhanceSelect("task-create-priority");
  enhanceSelect("task-create-status");
}
