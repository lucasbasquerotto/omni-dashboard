import { Router } from "express";
import { execSync } from "child_process";

export const gitRouter = Router();

const OMNI_DIR = process.env.OMNI_DIR;
// The omniagent backend. The git sync itself now runs inside the omniagent
// git plugin (the `git_sync` tool, configurable via the `git_sync_tool`
// setting) through the canonical POST /git/sync endpoint - see the /sync
// route below. Token minting/regeneration happens there, so the explorer
// never has to build its own credentials.
const OMNIAGENT = process.env.OMNIAGENT_URL || "http://omniagent:8080";

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

// POST /api/git/sync: run the canonical git sync through the omniagent HTTP
// API (POST /git/sync), which executes the configured sync tool (default:
// `git_sync` from the builtin git plugin) via the MCP registry. The plugin
// performs fetch → pull --rebase → push with a GitHub App installation token
// and automatically regenerates the token + retries when an expired/revoked
// token makes a fetch/pull/push fail with an auth error - so the explorer
// sync button no longer surfaces a stale-token 500. This is the SAME call
// the toolbox backup/restore hooks use (canonical sync entrypoint).
gitRouter.post("/sync", async (_req, res) => {
  try {
    const resp = await fetch(`${OMNIAGENT}/git/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    const text = await resp.text();
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
    if (!resp.ok) {
      const err = (body as { error?: string })?.error || text || "Sync failed";
      res.status(resp.status).json({ error: err });
      return;
    }
    res.json(body);
  } catch (e) {
    res.status(500).json({ error: `Sync failed: ${(e as Error).message}` });
  }
});
