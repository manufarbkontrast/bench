/**
 * Kontext API: the profile, rules, session state, per-project memory, repo docs, skills and mcp
 * server names - all read-only, none of it taking a client-supplied path or query parameter.
 * Mounted at /api/kontext.
 */
import type Database from "better-sqlite3";
import { Router } from "express";
import {
  readMcpServers,
  readMemory,
  readRepos,
  readRules,
  vaultNoteAt,
  vaultNotesUnder,
} from "./readers.js";
import { listSkills } from "./skills.js";

export interface KontextContext {
  claudeDir: string;
  vaultDb: Database.Database;
  projectPaths: () => { name: string; path: string }[];
}

const PROFIL_PREFIX = "10_Profile/";
const WORKFLOW_PREFIX = "50_Workflow/";
// Handoffs live under 50_Workflow/ so Aufgaben never counts their checkboxes, but they are not
// rules. Mirrored by hand from projekte/handoffs.ts's HANDOFF_FOLDER, as vault/routes/tasks.ts
// and aufgaben/routes.ts already do: the apps never import each other.
const HANDOFFS_PREFIX = "50_Workflow/Handoffs/";
const STAND_PATH = "00_Index/Session_Context.md";

export function kontextRouter(ctx: KontextContext): Router {
  const router = Router();

  router.get("/profil", (_req, res) => {
    res.json({ notes: vaultNotesUnder(ctx.vaultDb, PROFIL_PREFIX) });
  });

  router.get("/regeln", (_req, res) => {
    res.json({
      claude: readRules(ctx.claudeDir),
      vault: vaultNotesUnder(ctx.vaultDb, WORKFLOW_PREFIX).filter(
        (note) => !note.path.startsWith(HANDOFFS_PREFIX),
      ),
    });
  });

  router.get("/stand", (_req, res) => {
    res.json({ note: vaultNoteAt(ctx.vaultDb, STAND_PATH) });
  });

  router.get("/memory", (_req, res) => {
    res.json({ projects: readMemory(ctx.claudeDir) });
  });

  router.get("/repos", (_req, res) => {
    res.json({ repos: readRepos(ctx.projectPaths) });
  });

  router.get("/skills", (_req, res) => {
    res.json(listSkills(ctx.claudeDir));
  });

  router.get("/mcp", (_req, res) => {
    res.json({ servers: readMcpServers(ctx.claudeDir) });
  });

  return router;
}
