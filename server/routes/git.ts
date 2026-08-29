import { Router } from "express";
import { execSync, execFileSync } from "child_process";
import { readFileSync, existsSync, readdirSync } from "fs";
import { createSign } from "crypto";
import { join } from "path";

export const gitRouter = Router();

const OMNI_DIR = process.env.OMNI_DIR;
// The omniagent backend: source of the secrets the git plugin uses
// (GITHUB_APP_KEY / GITHUB_APP_ID / GITHUB_INSTALLATION_ID).
const OMNIAGENT = process.env.OMNIAGENT_URL || "http://omniagent:8080";

// ── GitHub App token generation ──

/** Read env var from /opt/data/.env (mounted :ro in the dashboard container) */
function readDotEnvVar(name: string): string | null {
  const envPath = "/opt/data/.env";
  if (!existsSync(envPath)) return null;
  const content = readFileSync(envPath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith(name + "=")) {
      return trimmed
        .slice(name.length + 1)
        .replace(/["']/g, "")
        .trim();
    }
  }
  return null;
}

/**
 * Fetch a secret from the omniagent secrets API (the same store the git
 * plugin's `$secret:GITHUB_APP_KEY` resolves from). Returns null when the
 * secret is not set or the backend is unreachable.
 */
async function getSecret(name: string): Promise<string | null> {
  try {
    const resp = await fetch(`${OMNIAGENT}/secrets/${encodeURIComponent(name)}`, {
      headers: { "Content-Type": "application/json" },
    });
    if (!resp.ok) return null;
    const body = (await resp.json()) as {
      success?: boolean;
      data?: { current_value?: string };
    };
    const value = body?.data?.current_value;
    return body?.success && value ? value : null;
  } catch {
    return null;
  }
}

/**
 * Read the git plugin's own config (github_app_id, github_installation_id)
 * from the omniagent plugins API - the same configuration the git plugin
 * runs with. These are non-secret scalar values; the private key itself is
 * fetched from the secrets API (`$secret:GITHUB_APP_KEY`).
 */
async function getGitPluginConfig(): Promise<{ appId: string | null; instId: string | null }> {
  try {
    const resp = await fetch(`${OMNIAGENT}/api/plugins`, {
      headers: { "Content-Type": "application/json" },
    });
    if (!resp.ok) return { appId: null, instId: null };
    const body = (await resp.json()) as {
      success?: boolean;
      data?: Array<{ name?: string; config?: Record<string, unknown> }>;
    };
    const git = body?.data?.find((p) => p?.name === "git");
    const cfg = git?.config;
    const str = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));
    return {
      appId: str(cfg?.github_app_id),
      instId: str(cfg?.github_installation_id),
    };
  } catch {
    return { appId: null, instId: null };
  }
}

/**
 * Generate a fresh GitHub App installation access token.
 *
 * Credentials are looked up in this order:
 *   1. /opt/data/.env (GITHUB_APP_ID, GITHUB_INSTALLATION_ID) +
 *      /opt/data/credentials/*.private-key.pem (legacy file layout).
 *   2. The omniagent secrets API (GITHUB_APP_KEY, GITHUB_APP_ID,
 *      GITHUB_INSTALLATION_ID) - the same source the git plugin uses.
 */
async function getGitHubToken(): Promise<string | null> {
  let appId = readDotEnvVar("GITHUB_APP_ID");
  let instId = readDotEnvVar("GITHUB_INSTALLATION_ID");
  let privateKey: string | null = null;

  // Find private key file (legacy layout)
  const credDir = "/opt/data/credentials";
  let keyPath = "";
  if (existsSync(credDir)) {
    const files = readdirSync(credDir);
    keyPath = files.find((f: string) => f.endsWith(".private-key.pem")) || "";
    if (keyPath) keyPath = join(credDir, keyPath);
  }
  if (keyPath && existsSync(keyPath)) {
    privateKey = readFileSync(keyPath, "utf-8");
  }

  // Fall back to the secrets API (git plugin credential configuration)
  if (!appId) appId = await getSecret("GITHUB_APP_ID");
  if (!instId) instId = await getSecret("GITHUB_INSTALLATION_ID");
  if (!privateKey) privateKey = await getSecret("GITHUB_APP_KEY");

  // App ID and installation ID are configured directly on the git plugin;
  // read them from the git plugin's config when not stored as secrets.
  if (!appId || !instId) {
    const pc = await getGitPluginConfig();
    if (!appId) appId = pc.appId;
    if (!instId) instId = pc.instId;
  }

  if (!appId || !instId || !privateKey) return null;

  const now = Math.floor(Date.now() / 1000);

  const header = { alg: "RS256", typ: "JWT" };
  const payload = { iat: now - 60, exp: now + 600, iss: appId };

  const base64url = (obj: unknown) =>
    Buffer.from(JSON.stringify(obj)).toString("base64url").replace(/=+$/, "");

  const signingInput = base64url(header) + "." + base64url(payload);

  const sign = createSign("RSA-SHA256");
  sign.update(signingInput);
  const sig = sign.sign(privateKey, "base64url");
  const jwt = signingInput + "." + sig;

  // Exchange JWT for installation token
  const url = `https://api.github.com/app/installations/${instId}/access_tokens`;
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "hermes-agent",
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    if (!resp.ok) {
      await resp.text();
      // console.error(`[git-token] HTTP ${resp.status}: ${text}`);
      return null;
    }
    const data = (await resp.json()) as { token: string };
    return data.token;
  } catch {
    // console.error("[git-token] Fetch error:", e);
    return null;
  }
}

interface GitFileEntry {
  path: string;
  status: "M" | "U" | "D" | "R";
}

interface GitStatusResponse {
  branch: string;
  ahead: number;
  behind: number;
  staged: GitFileEntry[];
  unstaged: GitFileEntry[];
}

function gitCmd(args: string, cwd?: string): string {
  const dir = cwd || OMNI_DIR;
  if (!dir) throw new Error("OMNI_DIR not set");
  // --git-dir and --work-tree ensure the command runs in OMNI_DIR regardless of cwd
  return execSync(`git ${args}`, {
    cwd: dir,
    timeout: 30000,
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"],
  });
}

/**
 * Run git with an argv array (no shell). Used for push URLs that embed the
 * GitHub App token so no shell quoting/interpretation is involved.
 */
function gitCmdArray(args: string[]): string {
  const dir = OMNI_DIR;
  if (!dir) throw new Error("OMNI_DIR not set");
  return execFileSync("git", args, {
    cwd: dir,
    timeout: 60000,
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"],
  });
}

/**
 * Resolve the remote to sync against: prefer origin, else the first
 * configured remote. Returns the remote's https URL (no hardcoded repo
 * names - works for any omni_dir repo, e.g. omni-root).
 */
function resolveRemote(): { remoteUrl: string } {
  const remotes = gitCmd("remote")
    .trim()
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  if (remotes.length === 0) {
    throw new Error("No git remotes configured: cannot push");
  }
  const remoteName = remotes.includes("origin") ? "origin" : remotes[0];
  const remoteUrl = gitCmd(`remote get-url ${remoteName}`).trim();
  if (!remoteUrl.startsWith("https://")) {
    throw new Error(`Remote '${remoteName}' is not https: ${remoteUrl}`);
  }
  return { remoteUrl };
}

/** Convert any SSH-style remotes (git@github.com:...) to HTTPS so they work
 *  without the ssh binary. Idempotent : safe to call on every request. */
function ensureHttpsRemotes(): void {
  const dir = OMNI_DIR;
  if (!dir) return;
  try {
    const remotes = execSync(`git remote`, { cwd: dir, encoding: "utf-8", timeout: 5000 })
      .trim()
      .split("\n")
      .filter(Boolean);
    for (const remote of remotes) {
      try {
        const url = execSync(`git remote get-url ${remote}`, {
          cwd: dir,
          encoding: "utf-8",
          timeout: 5000,
        }).trim();
        if (url.startsWith("git@github.com:")) {
          const httpsUrl = url.replace(/^git@github\.com:/, "https://github.com/");
          execSync(`git remote set-url ${remote} "${httpsUrl}"`, {
            cwd: dir,
            encoding: "utf-8",
            timeout: 5000,
          });
          // console.log(`[git] Converted SSH→HTTPS for remote '${remote}'`);
        }
      } catch {
        // skip remotes that fail to read/set
      }
    }
  } catch {
    // Not a git repo or no remotes
  }
}

function parsePorcelainLine(
  line: string,
): { stagedStatus: string | null; unstagedStatus: string; path: string } | null {
  if (!line.trim()) return null;
  // Format: XY filename
  // X = staged status, Y = unstaged status
  const stagedStatus = line[0] === " " ? null : line[0];
  const unstagedStatus = line[1];
  const path = line.substring(3).trim();
  return { stagedStatus, unstagedStatus, path };
}

function porcelainStatusToEntry(status: string): GitFileEntry["status"] {
  switch (status) {
    case "M":
      return "M";
    case "?":
    case "U":
      return "U";
    case "D":
      return "D";
    case "R":
      return "R";
    default:
      return "M";
  }
}

// GET /api/git/status: returns branch, ahead/behind, staged and unstaged files
gitRouter.get("/status", (_req, res) => {
  try {
    if (!OMNI_DIR) {
      res.status(500).json({ error: "OMNI_DIR not set" });
      return;
    }

    ensureHttpsRemotes();

    // Get branch name
    let branch: string;
    try {
      branch = gitCmd("rev-parse --abbrev-ref HEAD").trim();
    } catch {
      res.json({ branch: "(no repo)", ahead: 0, behind: 0, staged: [], unstaged: [] });
      return;
    }

    // Get ahead/behind counts: fetch first to ensure tracking branch is current
    let ahead = 0;
    let behind = 0;
    try {
      gitCmd("fetch --all --no-tags 2>/dev/null || true");
      const upstream = gitCmd(
        "rev-parse --abbrev-ref --symbolic-full-name @{upstream} 2>/dev/null || true",
      ).trim();
      if (upstream) {
        const aheadOutput = gitCmd(`rev-list --count HEAD..${upstream} 2>/dev/null || echo 0`);
        behind = parseInt(aheadOutput, 10) || 0;
        const behindOutput = gitCmd(`rev-list --count ${upstream}..HEAD 2>/dev/null || echo 0`);
        ahead = parseInt(behindOutput, 10) || 0;
      }
    } catch {
      // No upstream
    }

    // Get staged and unstaged files via status --porcelain
    const porcelain = gitCmd("status --porcelain");
    const staged: GitFileEntry[] = [];
    const unstaged: GitFileEntry[] = [];

    for (const line of porcelain.split("\n")) {
      const parsed = parsePorcelainLine(line);
      if (!parsed) continue;

      if (parsed.stagedStatus) {
        staged.push({ path: parsed.path, status: porcelainStatusToEntry(parsed.stagedStatus) });
      }
      if (parsed.unstagedStatus && parsed.unstagedStatus !== " ") {
        unstaged.push({ path: parsed.path, status: porcelainStatusToEntry(parsed.unstagedStatus) });
      }
    }

    const result: GitStatusResponse = { branch, ahead, behind, staged, unstaged };
    res.json(result);
  } catch (e) {
    res.json({
      branch: "(error)",
      ahead: 0,
      behind: 0,
      staged: [],
      unstaged: [],
      error: (e as Error).message,
    });
  }
});

// POST /api/git/commit: commits all staged changes
gitRouter.post("/commit", (req, res) => {
  try {
    if (!OMNI_DIR) {
      res.status(500).json({ error: "OMNI_DIR not set" });
      return;
    }
    const message = req.body?.message;
    if (!message || typeof message !== "string" || !message.trim()) {
      res.status(400).json({ error: "Commit message is required" });
      return;
    }
    // If no staged changes, stage everything first; otherwise commit only staged
    const porcelain = gitCmd("status --porcelain");
    const hasStaged = porcelain.split("\n").some((l: string) => l.trim() && l[0] !== " ");
    if (!hasStaged) {
      gitCmd("add -A");
    }
    // Commit
    const safeMsg = message.replace(/'/g, "'\\''");
    gitCmd(`commit -m '${safeMsg}'`);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message || "Commit failed" });
  }
});

// POST /api/git/stage: stages all unstaged changes (git add -A)
gitRouter.post("/stage", (_req, res) => {
  try {
    if (!OMNI_DIR) {
      res.status(500).json({ error: "OMNI_DIR not set" });
      return;
    }
    gitCmd("add -A");
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message || "Stage failed" });
  }
});

// POST /api/git/discard: discards all unstaged changes
gitRouter.post("/discard", (_req, res) => {
  try {
    if (!OMNI_DIR) {
      res.status(500).json({ error: "OMNI_DIR not set" });
      return;
    }
    gitCmd("checkout -- .");
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message || "Discard failed" });
  }
});

// POST /api/git/unstage: unstages all staged changes (keeps file changes)
gitRouter.post("/unstage", (_req, res) => {
  try {
    if (!OMNI_DIR) {
      res.status(500).json({ error: "OMNI_DIR not set" });
      return;
    }
    gitCmd("reset HEAD -- .");
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message || "Unstage failed" });
  }
});

// POST /api/git/sync: fetch → pull (rebase) → push
// The push uses the git plugin's credential configuration: the GitHub App
// installation token is minted from the GITHUB_APP_KEY secret (via the
// omniagent secrets API or the legacy /opt/data files) and embedded in the
// repo's own remote URL - no hardcoded remotes, no credential failures.
gitRouter.post("/sync", async (_req, res) => {
  try {
    if (!OMNI_DIR) {
      res.status(500).json({ error: "OMNI_DIR not set" });
      return;
    }
    ensureHttpsRemotes();

    // Mint the token FIRST: fetch/pull/push all authenticate with it, using
    // the git plugin's credential configuration (GITHUB_APP_KEY secret plus
    // the git plugin config's app id / installation id).
    const token = await getGitHubToken();
    if (!token) {
      res.status(500).json({
        error:
          "Sync failed: GitHub credentials not found. Set the GITHUB_APP_KEY secret " +
          "(with GITHUB_APP_ID / GITHUB_INSTALLATION_ID) in the omniagent secrets table, " +
          "or place a private key in /opt/data/credentials.",
      });
      return;
    }

    // Build the tokenized URL for the repo's own remote (no config mutation,
    // no credential helper, no hardcoded repo names).
    let remoteUrl: string;
    try {
      remoteUrl = resolveRemote().remoteUrl;
    } catch (e) {
      res.status(500).json({ error: `Push failed: ${(e as Error).message}` });
      return;
    }
    // Strip any credentials already present in the remote URL (e.g. a token
    // left by a tokenized clone URL) before injecting a fresh token.
    const bareUrl = remoteUrl.replace(/^https:\/\/[^@]*@/, "https://");
    const tokenUrl = bareUrl.replace(/^https:\/\//, `https://x-access-token:${token}@`);

    // Fetch (private repos need credentials, so use the tokenized URL)
    try {
      gitCmdArray(["fetch", tokenUrl]);
    } catch (e) {
      res.status(500).json({ error: `Fetch failed: ${(e as Error).message}` });
      return;
    }

    // Pull with rebase (errors surface: e.g. unstaged local changes block a
    // rebase - better a clear message than a confusing rejected push)
    try {
      gitCmdArray(["pull", "--rebase", tokenUrl]);
    } catch (e) {
      res.status(500).json({ error: `Pull failed: ${(e as Error).message}` });
      return;
    }

    // Push
    try {
      const branch = gitCmd("rev-parse --abbrev-ref HEAD").trim();
      gitCmdArray(["push", tokenUrl, `HEAD:${branch}`]);
    } catch (e) {
      res.status(500).json({ error: `Push failed: ${(e as Error).message}` });
      return;
    }
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message || "Sync failed" });
  }
});
