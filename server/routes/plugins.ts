import { Router, Request, Response, NextFunction } from "express";

export const pluginsRouter = Router();

// Proxy /api/plugins/* to the OmniAgent backend
const OMNIAGENT_URL = process.env.OMNIAGENT_URL || "http://omniagent:8080";

// Use a middleware approach instead of all("*") which fails in Express 5
pluginsRouter.use(async (req: Request, res: Response, _next: NextFunction) => {
  try {
    let path = req.path;
    // Strip trailing slash for root path to match omniagent backend routes
    if (path === "/") path = "";
    const queryString = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
    const targetUrl = `${OMNIAGENT_URL}/api/plugins${path}${queryString}`;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    const fetchOptions: RequestInit = {
      method: req.method,
      headers,
    };

    if (req.method !== "GET" && req.method !== "HEAD" && req.method !== "DELETE") {
      fetchOptions.body = JSON.stringify(req.body);
    }

    const response = await fetch(targetUrl, fetchOptions);

    // Handle non-JSON responses
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const data = await response.json();
      res.status(response.status).json(data);
    } else {
      const text = await response.text();
      res.status(response.status).send(text);
    }
  } catch (err) {
    console.error("[plugins] Proxy error:", err);
    res.status(502).json({
      error: "Failed to reach OmniAgent backend: " + (err instanceof Error ? err.message : String(err)),
    });
  }
});
