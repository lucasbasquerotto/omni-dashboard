import { Router } from "express";
import { queryDb } from "../db.js";

export const profilesRouter = Router();

// GET /api/profiles — list all profiles with full details and channel associations
profilesRouter.get("/", async (_req, res) => {
  try {
    // Fetch from profiles table
    const profileRows = await queryDb(
      `SELECT id, name, provider, model, base_url, max_tokens, temperature, allowed_tools, created_at, updated_at
       FROM profiles ORDER BY name`,
    );

    // Fetch each profile's default channels
    const profiles = [];
    for (const row of profileRows) {
      const channelRows = await queryDb(
        `SELECT id, name, platform, resource_identifier FROM channels WHERE current_profile = $1 ORDER BY name`,
        [row.name],
      );
      profiles.push({
        id: row.id,
        name: row.name,
        provider: row.provider,
        model: row.model,
        base_url: row.base_url,
        max_tokens: row.max_tokens,
        temperature: row.temperature,
        allowed_tools: row.allowed_tools,
        created_at: row.created_at,
        updated_at: row.updated_at,
        default_channels: channelRows,
      });
    }

    res.json(profiles);
  } catch (err) {
    console.error("[profiles] Error:", err);
    res.status(500).json({ error: "Failed to fetch profiles" });
  }
});
