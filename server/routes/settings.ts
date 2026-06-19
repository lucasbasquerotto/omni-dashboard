import { Router, Request, Response } from "express";

export const settingsRouter = Router();

const OMNIBASE = "http://omniagent-omniagent-1:8080";

// GET /api/settings — fetch all settings organized by category
settingsRouter.get("/", async (_req: Request, res: Response) => {
  try {
    const response = await fetch(`${OMNIBASE}/settings`);
    if (!response.ok) {
      res.status(response.status).json({ error: `OmniAgent returned ${response.status}` });
      return;
    }
    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error("[settings] GET error:", err);
    res
      .status(502)
      .json({ error: "Failed to reach OmniAgent: " + (err instanceof Error ? err.message : String(err)) });
  }
});

// PUT /api/settings — update settings
settingsRouter.put("/", async (req: Request, res: Response) => {
  try {
    const { updates } = req.body;
    if (!updates || !Array.isArray(updates)) {
      res.status(400).json({ error: "Body must contain {updates: [{name, value}]}" });
      return;
    }
    const response = await fetch(`${OMNIBASE}/settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ updates }),
    });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err) {
    console.error("[settings] PUT error:", err);
    res
      .status(502)
      .json({ error: "Failed to reach OmniAgent: " + (err instanceof Error ? err.message : String(err)) });
  }
});
