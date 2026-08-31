/** Projekte API: scanned git checkouts and their vault coupling, read-only. Mounted at /api/projekte. */
import { Router } from "express";
import path from "node:path";
import type Database from "better-sqlite3";
import { queryText } from "../vault/routes/query.js";
import { listProjects, type ProjectRow } from "./db.js";
import type { GhRunner } from "./gh.js";
import { scanProjects, type ScanSummary } from "./pipeline.js";

export interface ProjekteContext {
  db: Database.Database;
  roots: string[];
  source: "configured" | "sample";
  gh: GhRunner | "off";
}

interface ListedProject extends ProjectRow {
  isDuplicate: boolean;
  sameName: boolean;
}

function withDerived(rows: ProjectRow[]): ListedProject[] {
  const groupSizes = new Map<string, number>();
  const groupsByName = new Map<string, Set<string>>();
  for (const row of rows) {
    groupSizes.set(row.groupKey, (groupSizes.get(row.groupKey) ?? 0) + 1);
    const name = row.name.toLowerCase();
    const groups = groupsByName.get(name) ?? new Set<string>();
    groups.add(row.groupKey);
    groupsByName.set(name, groups);
  }
  return rows.map((row) => ({
    ...row,
    isDuplicate: (groupSizes.get(row.groupKey) ?? 0) > 1,
    sameName: (groupsByName.get(row.name.toLowerCase())?.size ?? 0) > 1,
  }));
}

/**
 * A scan that is already running is shared rather than repeated - two GET /list calls racing on
 * an empty table must not scan twice, and POST /scan joins the same run rather than stacking a
 * second one against the same database.
 */
function scanQueue(
  db: Database.Database,
  vaultDb: Database.Database,
  roots: string[],
  gh: GhRunner | "off",
): () => Promise<ScanSummary> {
  let inFlight: Promise<ScanSummary> | null = null;
  return () => {
    inFlight ??= scanProjects(db, vaultDb, roots, gh).finally(() => {
      inFlight = null;
    });
    return inFlight;
  };
}

export function projekteRouter(
  ctx: ProjekteContext,
  vaultDb: Database.Database,
): Router {
  const { db, roots, gh } = ctx;
  const scanOnce = scanQueue(db, vaultDb, roots, gh);
  const router = Router();

  router.get("/list", async (_req, res) => {
    let rows = listProjects(db);
    let summary: ScanSummary | null = null;
    if (rows.length === 0) {
      summary = await scanOnce();
      rows = listProjects(db);
    }
    res.json({
      scannedAt: rows[0]?.scannedAt ?? null,
      summary,
      projects: withDerived(rows),
    });
  });

  router.post("/scan", async (_req, res) => {
    res.json({ summary: await scanOnce() });
  });

  router.get("/project", (req, res) => {
    const projectPath = queryText(req.query.path);
    if (!projectPath || !path.isAbsolute(projectPath)) {
      res.status(400).json({ error: "path must be an absolute path" });
      return;
    }
    const rows = listProjects(db);
    const project = rows.find((row) => row.path === projectPath);
    if (!project) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const duplicates = rows.filter(
      (row) => row.groupKey === project.groupKey && row.path !== project.path,
    );
    res.json({ project, duplicates });
  });

  return router;
}
