import { Router, Request, Response } from "express";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const OMNIAGENT = process.env.OMNIAGENT_URL || "http://omniagent:8080";

// Fallback version: this package's own version, used only when the omniagent
// backend cannot be reached (e.g. dashboard running standalone).
function getPackageVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf-8"));
    return pkg.version || "1.0.0";
  } catch {
    return "1.0.0";
  }
}

// The release version's single source of truth is the omniagent Cargo.toml
// (baked into the binary at build time as CARGO_PKG_VERSION and exposed via
// GET /health). Consume it so the dashboard shows the real release version;
// fall back to this package's own version only when the agent is unreachable.
async function getReleaseVersion(): Promise<string> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2000);
    const res = await fetch(`${OMNIAGENT}/health`, { signal: controller.signal });
    clearTimeout(timer);
    if (res.ok) {
      const data = (await res.json()) as { version?: unknown };
      if (data && typeof data.version === "string" && data.version) {
        return data.version;
      }
    }
  } catch {
    // unreachable: fall back to package version below
  }
  return getPackageVersion();
}

const startTime = Date.now();

export const healthRouter = Router();

healthRouter.get("/", async (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    version: await getReleaseVersion(),
    uptime: Math.floor((Date.now() - startTime) / 1000),
    time: Date.now(),
  });
});
