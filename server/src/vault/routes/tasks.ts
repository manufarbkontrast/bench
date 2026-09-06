import { Router } from "express";
import path from "node:path";
import type Database from "better-sqlite3";
import type { VaultContext } from "./index.js";
import { skipped } from "../index/scan.js";
import { TASK_INBOX, appendTask, toggleTask } from "../write.js";

interface PatchBody {
  path?: unknown;
  line?: unknown;
  raw?: unknown;
}

interface PostBody {
  path?: unknown;
  text?: unknown;
  due?: unknown;
  priority?: unknown;
}

interface NoteKey {
  path: string;
}

const DUE = /^\d{4}-\d{2}-\d{2}$/;

// The Tasks-plugin's own priority markers - see index/tasks.ts's PRIORITIES for the read side of
// the same grammar.
const PRIORITY_EMOJI: Record<string, string> = {
  highest: "🔺",
  high: "⏫",
  medium: "🔼",
  low: "🔽",
  lowest: "⏬",
};

/** `relPath` resolved inside the vault, posix-separated - the dot-segment guard from routes/files.ts. */
function insideVault(root: string, relPath: string): string | null {
  const abs = path.resolve(root, relPath);
  const rel = path.relative(root, abs);
  const hidden = rel.split(path.sep).some(skipped);
  if (
    !relPath ||
    !rel ||
    rel.startsWith("..") ||
    path.isAbsolute(rel) ||
    hidden
  )
    return null;
  return rel.split(path.sep).join("/");
}

function knownNote(db: Database.Database, relPath: string): boolean {
  return (
    (db.prepare("SELECT path FROM notes WHERE path = ?").get(relPath) as
      NoteKey | undefined) !== undefined
  );
}

// A handoff note is the /handoff skill's write surface, not this one - PROJECT.md's "Bench
// never writes a handoff" promise, enforced here rather than only documented. Declared locally
// rather than imported from projekte/handoffs.ts's HANDOFF_FOLDER: the two apps never import
// each other, the same rule EXCLUDED_FOLDERS follows elsewhere in this codebase.
const HANDOFF_FOLDER = "50_Workflow/Handoffs/";

function isHandoffNote(relPath: string): boolean {
  return relPath.startsWith(HANDOFF_FOLDER);
}

interface PostFields {
  text: string;
  due?: string;
  priority?: string;
  path: string;
}

/** Validate and narrow the POST body in one place, so the route handler only branches on the outcome. */
function parsePostFields(body: PostBody): PostFields | { error: string } {
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) return { error: "text is required" };
  if (/[\r\n]/.test(text)) return { error: "text must be a single line" };
  const due = typeof body.due === "string" ? body.due : undefined;
  if (due !== undefined && !DUE.test(due))
    return { error: "due must be YYYY-MM-DD" };
  const priority =
    typeof body.priority === "string" ? body.priority : undefined;
  if (priority !== undefined && !(priority in PRIORITY_EMOJI))
    return { error: "priority is invalid" };
  const targetPath =
    typeof body.path === "string" && body.path ? body.path : TASK_INBOX;
  return { text, due, priority, path: targetPath };
}

/** `- [ ] <text>`, then the priority emoji, then the due date - each only when present. */
function buildTaskLine(fields: PostFields): string {
  const priorityPart = fields.priority
    ? ` ${PRIORITY_EMOJI[fields.priority]}`
    : "";
  const duePart = fields.due ? ` 📅 ${fields.due}` : "";
  return `- [ ] ${fields.text}${priorityPart}${duePart}`;
}

/** Task writes: toggling a checkbox and appending a new task - the vault's only write path. */
export function tasksRouter({ db, dir }: VaultContext): Router {
  const root = path.resolve(dir);
  const router = Router();

  router.patch("/tasks", (req, res) => {
    const body = req.body as PatchBody;
    const relPath =
      typeof body.path === "string" ? insideVault(root, body.path) : null;
    const line = typeof body.line === "number" ? body.line : NaN;
    const raw = typeof body.raw === "string" ? body.raw : null;
    if (!relPath || !Number.isInteger(line) || line < 1 || raw === null) {
      res.status(400).json({ error: "path, line and raw are required" });
      return;
    }
    if (isHandoffNote(relPath)) {
      res.status(400).json({ error: "handoff notes are read-only" });
      return;
    }
    if (!knownNote(db, relPath)) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const result = toggleTask(dir, db, relPath, line, raw);
    if (!result.ok) {
      if (result.escapesVault) {
        res.status(400).json({ error: "path must stay inside the vault" });
        return;
      }
      res.status(409).json({ error: "conflict" });
      return;
    }
    res.json({ line: result.line, raw: result.raw });
  });

  router.post("/tasks", (req, res) => {
    const fields = parsePostFields(req.body as PostBody);
    if ("error" in fields) {
      res.status(400).json({ error: fields.error });
      return;
    }
    const relPath = insideVault(root, fields.path);
    if (!relPath) {
      res.status(400).json({ error: "path must stay inside the vault" });
      return;
    }
    if (isHandoffNote(relPath)) {
      res.status(400).json({ error: "handoff notes are read-only" });
      return;
    }
    if (relPath !== TASK_INBOX && !knownNote(db, relPath)) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const result = appendTask(dir, db, relPath, buildTaskLine(fields));
    if (!result.ok) {
      res.status(400).json({ error: "path must stay inside the vault" });
      return;
    }
    res.status(201).json({ path: relPath, line: result.line, raw: result.raw });
  });

  return router;
}
