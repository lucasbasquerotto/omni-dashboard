import { Router } from "express";
import { queryDb } from "../db.js";

export const channelsRouter = Router();

// GET /api/channels — list all channels
channelsRouter.get("/", async (_req, res) => {
  try {
    const rows = await queryDb(
      "SELECT id, name, platform, current_profile, current_provider, current_model FROM channels ORDER BY name",
    );
    res.json(rows);
  } catch (err) {
    console.error("[channels] Error:", err);
    res.status(500).json({ error: "Failed to fetch channels" });
  }
});
