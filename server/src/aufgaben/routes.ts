/** Aufgaben API: vault tasks, the Plaud import queue and GitHub issues. Mounted at /api/aufgaben. */
import { Router } from "express";
import { readFileSync } from "node:fs";
import path from "node:path";
import type Database from "better-sqlite3";
import { findExisting } from "./dedup.js";
import { findImport, recordImport, type ImportRow } from "./db.js";
import { fetchIssues, type GhRunner } from "./gh.js";
import { suggestTarget } from "./mapping.js";
import { listPlaudNotes, parsePlaudNote, type PlaudItem } from "./plaud.js";
import { listTasks } from "./tasks.js";
import { appendTask, TASK_INBOX } from "../vault/write.js";
import type { VaultContext } from "../vault/routes/index.js";

export interface AufgabenContext {
  ledger: Database.Database;
  plaud: { dir: string; source: "configured" | "sample" };
  gh: GhRunner | "off";
  githubLabels: () => string[];
}

/**
 * What index.ts builds: the ledger and the located Plaud home. app.ts completes it with the
 * githubLabels closure over the projekte database, which is what keeps this module - and
 * everything under aufgaben/ - free of any import from projekte/.
 */
export type AufgabenSources = Omit<AufgabenContext, "githubLabels">;

interface ImportedReply {
  targetPath: string;
  line: number;
}

interface ExistingReply {
  path: string;
  line: number;
  text: string;
}

interface PlaudItemReply extends PlaudItem {
  imported: ImportedReply | null;
  existing: ExistingReply | null;
}

interface PlaudNoteReply {
  file: string;
  title: string;
  date: string | null;
  source: string | null;
  items: PlaudItemReply[];
  openQuestions: string[];
  direct: string[];
  suggestedTarget: string;
}

function toImportedReply(row: ImportRow | null): ImportedReply | null {
  return row ? { targetPath: row.targetPath, line: row.line } : null;
}

function toPlaudNoteReply(
  ledger: Database.Database,
  vaultDb: Database.Database,
  plaudDir: string,
  file: string,
): PlaudNoteReply {
  const text = readFileSync(path.join(plaudDir, file), "utf8");
  const note = parsePlaudNote(file, text);
  const items = note.items.map((item) => {
    const imported = toImportedReply(findImport(ledger, file, item.rowHash));
    // Once imported, the item's own line now sits in the vault and would dedup-match itself -
    // the hint is pre-import advice, so there is nothing left for it to say afterwards.
    return {
      ...item,
      imported,
      existing: imported ? null : findExisting(vaultDb, item.was),
    };
  });
  return { ...note, items, suggestedTarget: suggestTarget(text, vaultDb) };
}

interface ImportBody {
  file?: unknown;
  rowHash?: unknown;
  targetPath?: unknown;
}

interface ImportFields {
  file: string;
  rowHash: string;
  targetPath: string;
}

function parseImportFields(body: ImportBody): ImportFields | { error: string } {
  const file = typeof body.file === "string" ? body.file : "";
  const rowHash = typeof body.rowHash === "string" ? body.rowHash : "";
  const targetPath = typeof body.targetPath === "string" ? body.targetPath : "";
  if (!file || !rowHash || !targetPath)
    return { error: "file, rowHash and targetPath are required" };
  // Real files come from readdirSync as bare basenames - a "/" or "\" here can only be an attempt
  // to read outside plaudDir, so reject it before findPlaudItem ever touches the filesystem.
  if (file.includes("/") || file.includes("\\"))
    return { error: "file must be a bare filename" };
  return { file, rowHash, targetPath };
}

const BIS_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** `- [ ] <was>`, the due date when `bis` is one, then the note this came from. */
function buildTaskLine(item: PlaudItem, file: string): string {
  const duePart = BIS_DATE.test(item.bis) ? ` 📅 ${item.bis}` : "";
  const basename = file.replace(/\.md$/, "");
  return `- [ ] ${item.was}${duePart} (aus [[${basename}]])`;
}

function findPlaudItem(
  plaudDir: string,
  file: string,
  rowHash: string,
): PlaudItem | null {
  let text: string;
  try {
    text = readFileSync(path.join(plaudDir, file), "utf8");
  } catch {
    return null;
  }
  const note = parsePlaudNote(file, text);
  return note.items.find((item) => item.rowHash === rowHash) ?? null;
}

function knownTarget(vaultDb: Database.Database, targetPath: string): boolean {
  if (targetPath === TASK_INBOX) return true;
  return (
    vaultDb.prepare("SELECT 1 FROM notes WHERE path = ?").get(targetPath) !==
    undefined
  );
}

export function aufgabenRouter(
  ctx: AufgabenContext,
  vault: VaultContext,
): Router {
  const { ledger, plaud, gh, githubLabels } = ctx;
  const router = Router();

  router.get("/tasks", (_req, res) => {
    res.json({ tasks: listTasks(vault.db) });
  });

  router.get("/plaud", (_req, res) => {
    const notes = listPlaudNotes(plaud.dir).map((file) =>
      toPlaudNoteReply(ledger, vault.db, plaud.dir, file),
    );
    res.json({ source: plaud.source, notes });
  });

  router.post("/import", (req, res) => {
    const fields = parseImportFields(req.body as ImportBody);
    if ("error" in fields) {
      res.status(400).json({ error: fields.error });
      return;
    }
    const { file, rowHash, targetPath } = fields;

    const item = findPlaudItem(plaud.dir, file, rowHash);
    if (!item) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (findImport(ledger, file, rowHash)) {
      res.status(409).json({ error: "already imported" });
      return;
    }
    if (!knownTarget(vault.db, targetPath)) {
      res
        .status(400)
        .json({ error: "targetPath must be an indexed note or the inbox" });
      return;
    }

    // Append first, record second: a failed write must never leave a ledger entry.
    const result = appendTask(
      vault.dir,
      vault.db,
      targetPath,
      buildTaskLine(item, file),
    );
    recordImport(ledger, {
      sourceFile: file,
      rowHash,
      targetPath,
      line: result.line,
      importedAt: Date.now(),
    });
    res.status(201).json({ targetPath, line: result.line, raw: result.raw });
  });

  router.get("/issues", async (_req, res) => {
    if (gh === "off") {
      res.json({ source: "off", repos: [] });
      return;
    }
    const labels = [...new Set(githubLabels())];
    const repos = await Promise.all(
      labels.map(async (label) => ({
        label,
        issues: await fetchIssues(gh, label),
      })),
    );
    res.json({ source: "gh", repos });
  });

  return router;
}
