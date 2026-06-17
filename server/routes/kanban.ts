import { Router, Request, Response } from "express";
import { queryDb } from "../db.js";

const KANBAN_COLUMNS = [
  { id: "backlog", title: "Backlog" },
  { id: "todo", title: "Todo" },
  { id: "ready", title: "Ready" },
  { id: "running", title: "In Progress" },
  { id: "review", title: "Review" },
  { id: "done", title: "Done" },
  { id: "blocked", title: "Blocked" },
];

const VALID_STATUSES = new Set(KANBAN_COLUMNS.map((c) => c.id));

export const kanbanRouter = Router();

// ── GET /api/kanban/board — Tasks grouped by status ──
kanbanRouter.get("/board", async (_req: Request, res: Response) => {
  try {
    const tasks = await queryDb(
      `SELECT id, title, body, assignee, status, priority,
              created_at, updated_at
       FROM kanban_tasks
       ORDER BY priority DESC, created_at DESC`,
    );

    const columns = KANBAN_COLUMNS.map((col) => ({
      id: col.id,
      title: col.title,
      tasks: tasks.filter((t: any) => t.status === col.id),
    }));

    res.json({ columns, total: tasks.length });
  } catch (e: any) {
    console.error("Kanban board error:", e?.message || e);
    res.status(500).json({ error: e.message || "Unknown error" });
  }
});

// ── GET /api/kanban/tasks/:id — Task detail ──
kanbanRouter.get("/tasks/:id", async (req: Request, res: Response) => {
  try {
    const taskId = req.params.id;
    if (!taskId) {
      res.status(400).json({ error: "Invalid task ID" });
      return;
    }

    const tasks = await queryDb(
      `SELECT id, title, body, assignee, status, priority,
              created_at, updated_at
       FROM kanban_tasks WHERE id = $1`,
      [taskId],
    );

    if (tasks.length === 0) {
      res.status(404).json({ error: "Task not found" });
      return;
    }

    res.json(tasks[0]);
  } catch (e: any) {
    console.error("Kanban task detail error:", e?.message || e);
    res.status(500).json({ error: e.message || "Unknown error" });
  }
});

// ── POST /api/kanban/tasks — Create task ──
kanbanRouter.post("/tasks", async (req: Request, res: Response) => {
  try {
    const { title, body, assignee, priority, status } = req.body;
    if (!title || typeof title !== "string" || title.trim().length === 0) {
      res.status(400).json({ error: "Title is required" });
      return;
    }

    const id =
      "task_" +
      Math.random().toString(36).substring(2, 10) +
      Date.now().toString(36);
    const taskStatus = status && VALID_STATUSES.has(status) ? status : "backlog";
    const taskPriority = priority != null ? priority : 0;

    await queryDb(
      `INSERT INTO kanban_tasks (id, title, body, status, priority, assignee)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, title.trim(), body || "", taskStatus, taskPriority, assignee || ""],
    );

    res.json({ success: true, id });
  } catch (e: any) {
    console.error("Kanban create task error:", e?.message || e);
    res.status(500).json({ error: e.message || "Unknown error" });
  }
});

// ── PATCH /api/kanban/tasks/:id/status — Move task between columns ──
kanbanRouter.patch("/tasks/:id/status", async (req: Request, res: Response) => {
  try {
    const taskId = req.params.id;
    if (!taskId) {
      res.status(400).json({ error: "Invalid task ID" });
      return;
    }

    const { status } = req.body;
    if (!VALID_STATUSES.has(status)) {
      res.status(400).json({
        error: `Status must be one of: ${Array.from(VALID_STATUSES).join(", ")}`,
      });
      return;
    }

    // Check task exists
    const tasks = await queryDb(
      `SELECT id FROM kanban_tasks WHERE id = $1`,
      [taskId],
    );
    if (tasks.length === 0) {
      res.status(404).json({ error: "Task not found" });
      return;
    }

    await queryDb(
      `UPDATE kanban_tasks SET status = $1, updated_at = NOW() WHERE id = $2`,
      [status, taskId],
    );

    res.json({ success: true });
  } catch (e: any) {
    console.error("Kanban update status error:", e?.message || e);
    res.status(500).json({ error: e.message || "Unknown error" });
  }
});

// ── PATCH /api/kanban/tasks/:id — Update task details ──
kanbanRouter.patch("/tasks/:id", async (req: Request, res: Response) => {
  try {
    const taskId = req.params.id;
    if (!taskId) {
      res.status(400).json({ error: "Invalid task ID" });
      return;
    }

    // Check task exists
    const tasks = await queryDb(
      `SELECT id FROM kanban_tasks WHERE id = $1`,
      [taskId],
    );
    if (tasks.length === 0) {
      res.status(404).json({ error: "Task not found" });
      return;
    }

    const { title, body, assignee, priority, status } = req.body;
    const setClauses: string[] = [];
    const params: any[] = [];
    let paramIdx = 2;

    if (title !== undefined) {
      if (typeof title !== "string" || title.trim().length === 0) {
        res.status(400).json({ error: "Title cannot be empty" });
        return;
      }
      setClauses.push(`title = $${paramIdx++}`);
      params.push(title.trim());
    }
    if (body !== undefined) {
      setClauses.push(`body = $${paramIdx++}`);
      params.push(body);
    }
    if (assignee !== undefined) {
      setClauses.push(`assignee = $${paramIdx++}`);
      params.push(assignee);
    }
    if (priority !== undefined) {
      setClauses.push(`priority = $${paramIdx++}`);
      params.push(priority);
    }
    if (status !== undefined) {
      if (!VALID_STATUSES.has(status)) {
        res.status(400).json({
          error: `Status must be one of: ${Array.from(VALID_STATUSES).join(", ")}`,
        });
        return;
      }
      setClauses.push(`status = $${paramIdx++}`);
      params.push(status);
    }

    if (setClauses.length === 0) {
      res.status(400).json({ error: "No fields to update" });
      return;
    }

    setClauses.push("updated_at = NOW()");

    const sql = `UPDATE kanban_tasks SET ${setClauses.join(", ")} WHERE id = $1`;
    await queryDb(sql, [taskId, ...params]);
    res.json({ success: true });
  } catch (e: any) {
    console.error("Kanban update task error:", e?.message || e);
    res.status(500).json({ error: e.message || "Unknown error" });
  }
});

// ── DELETE /api/kanban/tasks/:id — Delete task ──
kanbanRouter.delete("/tasks/:id", async (req: Request, res: Response) => {
  try {
    const taskId = req.params.id;
    if (!taskId) {
      res.status(400).json({ error: "Invalid task ID" });
      return;
    }

    const result = await queryDb(
      `DELETE FROM kanban_tasks WHERE id = $1 RETURNING id`,
      [taskId],
    );

    if (result.length === 0) {
      res.status(404).json({ error: "Task not found" });
      return;
    }

    res.json({ success: true });
  } catch (e: any) {
    console.error("Kanban delete task error:", e?.message || e);
    res.status(500).json({ error: e.message || "Unknown error" });
  }
});
