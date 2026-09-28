// Tree-walk planning for the Explorer page (src/pages/explorer.ts).
//
// Deliberately free of DOM/network code so the walk is unit-testable: the
// "returning to the Explorer leaves the content pane stuck on Loading file"
// bug (thread 3404) lived exactly in this walk.

import type { FsEntry } from "./api";

export interface ExplorerTreeNode {
  entry: FsEntry;
  expanded: boolean;
  children: ExplorerTreeNode[] | null; // null = children not loaded yet
}

export interface TreeWalkStep {
  /** Filesystem path of the directory node. */
  dir: string;
  node: ExplorerTreeNode;
}

export interface TreeWalkPlan {
  ok: boolean;
  /** Set when the path cannot be resolved (missing directory, no tree, ...). */
  reason?: string;
  /** Directory nodes whose children must be fetched before the walk can finish. */
  pending: TreeWalkStep[];
  /** Ancestor directories on the resolved path (root first), to expand/re-render. */
  ancestors: TreeWalkStep[];
}

/**
 * Plan the tree walk from the root entries down to a file path.
 *
 * `pending` names a directory whose children are still `null`: the caller
 * fetches them, attaches them to the node and re-plans, until `pending` is
 * empty and the path is resolved (or `ok` is false with a reason).
 *
 * A node whose children are missing is pending even when it is marked
 * `expanded`: every tree reload resets children to null while `expanded` is
 * restored from expandedPaths, so skipping the fetch for expanded nodes ran the
 * walk out of levels and left the content pane on the "Loading file"
 * placeholder forever.
 */
export function planTreeWalk(root: ExplorerTreeNode[] | null, fullPath: string): TreeWalkPlan {
  if (!root) {
    return { ok: false, reason: "The file tree could not be loaded", pending: [], ancestors: [] };
  }
  const parts = fullPath.split("/").filter(Boolean);
  if (parts.length === 0) {
    return { ok: false, reason: "Not a file path", pending: [], ancestors: [] };
  }

  const ancestors: TreeWalkStep[] = [];
  let dir = "";
  let level: ExplorerTreeNode[] | null = root;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    dir += "/" + part;
    const node: ExplorerTreeNode | undefined = level ? level.find((n) => n.entry.name === part) : undefined;
    if (!node) {
      return { ok: false, reason: `Directory not found: ${dir}`, pending: [], ancestors };
    }
    ancestors.push({ dir, node });
    if (node.children === null) {
      // The walk cannot continue until the caller loads this directory.
      return { ok: true, pending: [{ dir, node }], ancestors };
    }
    level = node.children;
  }

  return { ok: true, pending: [], ancestors };
}
