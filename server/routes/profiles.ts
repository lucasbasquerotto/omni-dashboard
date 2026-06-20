import { Router } from "express";
import { queryDb } from "../db.js";
import { readdirSync, existsSync } from "fs";
import { join } from "path";

const OMNI_DATA_DIR = process.env.OMNI_DATA_DIR || "/opt/data";

export const profilesRouter = Router();

// GET /api/profiles — list all profiles with full details, channel associations, and skills
profilesRouter.get("/", async (_req, res) => {
  try {
    // Fetch from profiles table
    const profileRows = await queryDb(
      `SELECT id, name, provider, model, base_url, max_tokens, temperature, allowed_tools, created_at, updated_at
       FROM profiles ORDER BY name`,
    );

    // Fetch each profile's default channels and skills
    const profiles = [];
    for (const row of profileRows) {
      const channelRows = await queryDb(
        `SELECT id, name, platform, resource_identifier FROM channels WHERE current_profile = $1 ORDER BY name`,
        [row.name],
      );

      // Read skill filenames from filesystem
      const skillsDir = join(OMNI_DATA_DIR, "profiles", row.name, "skills");
      let skills: string[] = [];
      if (existsSync(skillsDir)) {
        try {
          skills = readdirSync(skillsDir).filter(
            (f) => f.endsWith(".md") || f.endsWith(".yaml") || f.endsWith(".yml") || !f.includes("."),
          );
        } catch {
          // If directory can't be read, just return empty
        }
      }

      profiles.push({
        id: row.id,
        name: row.name,
        provider: row.provider,
        model: row.model,
        base_url: row.base_url,
        max_tokens: row.max_tokens,
        temperature: row.temperature,
        allowed_tools: row.allowed_tools,
        skills,
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

// PATCH /api/profiles/:name — update profile fields (provider, model, allowed_tools)
profilesRouter.patch("/:name", async (req, res) => {
  try {
    const { name } = req.params;
    const { provider, model, allowed_tools } = req.body;

    // Check if profile exists
    const existing = await queryDb(`SELECT name FROM profiles WHERE name = $1`, [name]);
    if (existing.length === 0) {
      res.status(404).json({ error: "Profile not found" });
      return;
    }

    // Build SET clause dynamically
    const sets: string[] = [];
    const params: any[] = [];
    let paramIdx = 1;

    if (provider !== undefined) {
      sets.push(`provider = $${paramIdx++}`);
      params.push(provider);
    }
    if (model !== undefined) {
      sets.push(`model = $${paramIdx++}`);
      params.push(model);
    }
    if (allowed_tools !== undefined) {
      sets.push(`allowed_tools = $${paramIdx++}`);
      params.push(allowed_tools);
    }

    if (sets.length === 0) {
      res.status(400).json({ error: "No fields to update" });
      return;
    }

    params.push(name);
    const sql = `UPDATE profiles SET ${sets.join(", ")} WHERE name = $${paramIdx}`;
    await queryDb(sql, params);
    res.json({ success: true });
  } catch (err) {
    console.error("[profiles] PATCH error:", err);
    res.status(500).json({ error: "Failed to update profile" });
  }
});
