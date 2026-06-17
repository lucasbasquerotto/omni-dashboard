import { Router, Request, Response } from "express";
import { queryDb } from "../db.js";

export const scheduleRouter = Router();

// ── GET /api/schedule — List all cron jobs ──
scheduleRouter.get("/", async (_req: Request, res: Response) => {
  try {
    const jobs = await queryDb(
      `SELECT id, name, schedule, prompt, skills, enabled,
              last_run_at, next_run_at, created_at
       FROM cron_jobs
       ORDER BY created_at DESC`,
    );

    const mapped = jobs.map((job: any) => ({
      id: job.id,
      name: job.name,
      schedule: job.schedule,
      prompt_preview: job.prompt
        ? job.prompt.length > 100
          ? job.prompt.slice(0, 100) + "..."
          : job.prompt
        : "",
      skills: job.skills || [],
      enabled: job.enabled,
      last_run: job.last_run_at,
      next_run: job.next_run_at,
      last_run_at: job.last_run_at,
      next_run_at: job.next_run_at,
      created_at: job.created_at,
      status: job.enabled ? "active" : "paused",
    }));

    res.json(mapped);
  } catch (e: any) {
    console.error("Schedule list error:", e?.message || e);
    res.status(500).json({ error: e.message || "Unknown error" });
  }
});
