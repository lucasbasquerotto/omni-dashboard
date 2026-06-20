import { Router } from "express";
import { queryDb } from "../db.js";

export const platformsRouter = Router();

// GET /api/platforms — list all platforms with resource identifiers and channel subscriptions
platformsRouter.get("/", async (_req, res) => {
  try {
    // Get distinct platforms from channels, plus their resource_identifiers and channels
    const rows = await queryDb(
      `SELECT DISTINCT platform FROM channels WHERE platform IS NOT NULL ORDER BY platform`,
    );

    const platforms = [];
    for (const row of rows) {
      const platform = row.platform;

      // Channels for this platform (each resource_identifier)
      const channelRows = await queryDb(
        `SELECT id, name, resource_identifier, closed, current_profile
         FROM channels WHERE platform = $1 ORDER BY name`,
        [platform],
      );

      // Check if any channel is not closed → platform is "active"
      const active = channelRows.some((c: any) => c.closed === false || c.closed === null);

      // Get subscriptions where this platform is the subscriber
      const subRows = await queryDb(
        `SELECT cs.id, cs.subscriber_resource, cs.channel_id, c.name as channel_name, c.platform as channel_platform, c.resource_identifier as channel_resource
         FROM channel_subscriptions cs
         JOIN channels c ON c.id = cs.channel_id
         WHERE cs.subscriber_platform = $1
         ORDER BY cs.subscriber_resource, c.name`,
        [platform],
      );

      // Group subscriptions by subscriber_resource
      const subscriptionsByResource: Record<
        string,
        {
          id: number;
          subscriber_resource: string;
          channels: { id: number; name: string; platform: string; resource_identifier: string }[];
        }
      > = {};
      for (const sub of subRows) {
        if (!subscriptionsByResource[sub.subscriber_resource]) {
          subscriptionsByResource[sub.subscriber_resource] = {
            id: sub.id,
            subscriber_resource: sub.subscriber_resource,
            channels: [],
          };
        }
        subscriptionsByResource[sub.subscriber_resource].channels.push({
          id: sub.channel_id,
          name: sub.channel_name,
          platform: sub.channel_platform,
          resource_identifier: sub.channel_resource,
        });
      }

      // All channels (not filtered by platform) — available to subscribe to
      const allChannels = await queryDb(
        `SELECT id, name, platform, resource_identifier FROM channels ORDER BY name`,
      );

      platforms.push({
        name: platform,
        active,
        resource_identifiers: channelRows.map((c: any) => ({
          id: c.id,
          channel_id: c.id,
          channel_name: c.name,
          resource_identifier: c.resource_identifier,
          closed: c.closed,
          profile: c.current_profile,
        })),
        subscriptions: Object.values(subscriptionsByResource),
        all_channels: allChannels,
      });
    }

    res.json(platforms);
  } catch (err) {
    console.error("[platforms] Error:", err);
    res.status(500).json({ error: "Failed to fetch platforms" });
  }
});

// POST /api/platforms/:platform/subscribe — add a channel subscription
platformsRouter.post("/:platform/subscribe", async (req, res) => {
  try {
    const { platform } = req.params;
    const { subscriber_resource, channel_id } = req.body;

    if (!subscriber_resource || !channel_id) {
      res.status(400).json({ error: "subscriber_resource and channel_id are required" });
      return;
    }

    await queryDb(
      `INSERT INTO channel_subscriptions (subscriber_platform, subscriber_resource, channel_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (channel_id, subscriber_platform, subscriber_resource) DO NOTHING`,
      [platform, subscriber_resource, channel_id],
    );

    res.json({ success: true });
  } catch (err) {
    console.error("[platforms] Subscribe error:", err);
    res.status(500).json({ error: "Failed to add subscription" });
  }
});

// DELETE /api/platforms/:platform/subscribe/:subId — remove a channel subscription
platformsRouter.delete("/:platform/subscribe/:subId", async (req, res) => {
  try {
    const { subId } = req.params;
    await queryDb(`DELETE FROM channel_subscriptions WHERE id = $1`, [subId]);
    res.json({ success: true });
  } catch (err) {
    console.error("[platforms] Unsubscribe error:", err);
    res.status(500).json({ error: "Failed to remove subscription" });
  }
});
