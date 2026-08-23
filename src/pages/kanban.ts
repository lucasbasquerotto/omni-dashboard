/**
 * Main kanban page: rendering, wiring, and create-task modal.
 * Delegates to lib/kanban-board.ts, lib/kanban-detail.ts, lib/kanban-subtasks.ts
 * and lib/kanban-create.ts (create-task modal + board/workflow fields).
 */
import { loadBoard } from "../lib/kanban-board";
import { getStoredBoard, setStoredBoard, wireBoardControls, fetchBoards, boardMetaLabel } from "../lib/kanban-boards";
import { createTaskModalHTML, wireCreateTaskModal } from "../lib/kanban-create";

// ── State ──
let showArchived = false;
let currentBoard: string | null = null;

// ── URL sync ──

function updateKanbanUrl(): void {
  const params = new URLSearchParams(window.location.search);
  if (showArchived) {
    params.set("show_archived", "true");
  } else {
    params.delete("show_archived");
  }
  const qs = params.toString();
  const newUrl = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
  history.replaceState(null, "", newUrl);
}

function updateArchivedButton(): void {
  const btn = document.getElementById("toggle-archived-btn");
  if (!btn) return;
  if (showArchived) {
    btn.textContent = "Showing archived";
    btn.classList.add("showing-archived");
  } else {
    btn.textContent = "Show archived";
    btn.classList.remove("showing-archived");
  }
}

/**
 * Show the selected board's meta near the title, e.g.
 * "Task board (workflow: omniagent-dev · channel: mm-kanban)".
 */
async function updateBoardTitleMeta(boardKey: string | null): Promise<void> {
  const sub = document.getElementById("kanban-page-subtitle");
  if (!sub) return;
  if (!boardKey) {
    sub.textContent = "Task board";
    return;
  }
  const boards = await fetchBoards();
  const board = boards.find((b) => b.key === boardKey)?.board;
  const meta = board ? boardMetaLabel(board) : "";
  sub.textContent = meta ? `Task board (${meta})` : "Task board";
}

// ── Main render ──

export function renderKanban(container: HTMLElement): void {
  // Restore showArchived from URL on page load
  const p = new URLSearchParams(window.location.search);
  if (p.get("show_archived") === "true") {
    showArchived = true;
  }
  // Board selection: URL ?board= wins; else restore last visited (localStorage).
  const urlBoard = p.get("board");
  const storedBoard = getStoredBoard();
  if (urlBoard && urlBoard !== "") {
    currentBoard = urlBoard;
    setStoredBoard(urlBoard);
  } else if (storedBoard) {
    currentBoard = storedBoard;
    history.replaceState(null, "", `/kanban?board=${encodeURIComponent(storedBoard)}`);
  } else currentBoard = null;
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Kanban / Task board</h1>
        <p class="page-subtitle" id="kanban-page-subtitle">Task board</p>
      </div>
      <div class="kanban-summary" id="kanban-summary" style="display:flex;align-items:center;gap:0.75rem;">
        <span id="kanban-count" style="font-size:0.85rem;color:var(--text-muted);margin-right:auto;"></span>
        <span id="kanban-board-controls" style="display:inline-flex;align-items:center;gap:0.5rem;"></span>
        <button id="toggle-archived-btn" style="background:rgba(148,163,184,0.1);border:1px solid var(--glass-border);color:var(--text-secondary);border-radius:6px;padding:0.375rem 0.75rem;cursor:pointer;font-size:0.8rem;font-weight:500;white-space:nowrap;">Show archived</button>
        <button id="kanban-history-btn" style="background:rgba(59,130,246,0.15);border:1px solid rgba(59,130,246,0.3);color:var(--accent-blue);border-radius:6px;padding:0.375rem 0.75rem;cursor:pointer;font-size:0.8rem;font-weight:500;white-space:nowrap;">History</button>
        <button id="create-task-btn" style="background:rgba(139,92,246,0.15);border:1px solid rgba(139,92,246,0.3);color:var(--accent-purple);border-radius:6px;padding:0.375rem 0.75rem;cursor:pointer;font-size:0.8rem;font-weight:500;white-space:nowrap;">+ Create Task</button>
      </div>
    </div>
    <div class="kanban-board" id="kanban-board">
      <div class="loading">Loading board</div>
    </div>
    ${createTaskModalHTML()}
  `;

  // Wire the create-task modal (board/workflow fields live in kanban-create.ts)
  wireCreateTaskModal({
    getBoard: () => currentBoard,
    onCreated: () => {
      void loadBoard(showArchived, currentBoard);
    },
  });

  // Toggle archived button
  document.getElementById("toggle-archived-btn")!.addEventListener("click", () => {
    showArchived = !showArchived;
    updateKanbanUrl();
    updateArchivedButton();
    void loadBoard(showArchived, currentBoard);
  });

  // History button
  document.getElementById("kanban-history-btn")?.addEventListener("click", () => {
    history.pushState({}, "", "/kanban-history");
    void import("../lib/router").then(({ router }) => router.go("kanban-history"));
  });

  // Apply initial URL state to button and URL
  updateArchivedButton();
  updateKanbanUrl();

  // Board controls: re-render after every change so the select + action
  // buttons (e.g. Edit Board) stay in sync with the URL immediately.
  const setupBoardControls = (): void => {
    void wireBoardControls({
      currentBoard,
      onBoardChange: (board) => {
        currentBoard = board;
        setStoredBoard(board);
        const params = new URLSearchParams(window.location.search);
        if (board) params.set("board", board);
        else params.delete("board");
        const qs = params.toString();
        history.replaceState(null, "", qs ? `/kanban?${qs}` : "/kanban");
        updateArchivedButton();
        void updateBoardTitleMeta(board);
        setupBoardControls();
        void loadBoard(showArchived, board);
      },
      onBoardsChanged: () => {
        setupBoardControls();
        void loadBoard(showArchived, currentBoard);
      },
    });
  };
  setupBoardControls();
  void updateBoardTitleMeta(currentBoard);
  void loadBoard(showArchived, currentBoard);
}

// Re-export for router
export { renderKanbanDetail } from "../lib/kanban-detail";
