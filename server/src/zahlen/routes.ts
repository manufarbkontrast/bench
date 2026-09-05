/** Zahlen API: the last controlling run, its archive, and the myCrafton deep links. Mounted at /api/zahlen. */
import { Router } from "express";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import {
  bestellungenFor,
  isRunFolderName,
  lastRun,
  listRuns,
  type RunFolder,
} from "./runs.js";
import { parseSummary, type Kpi } from "./summary.js";

/**
 * `dir` is eingang's located controlling dir (see locate.ts) - null for a configured eingang
 * world that never set CONTROLLING_DIR. Every route below answers its empty shape on a null
 * `dir` rather than reading anything.
 */
export interface ZahlenContext {
  dir: string | null;
  mycraftonUrl: string | null;
}

interface RunDetail {
  run: RunFolder;
  kpis: Kpi[];
  breakEven: string[];
  zusammenfassung: string;
  bestellungen: number | null;
}

/** The three files GET /file may ever serve, and the content type each is served as. */
const FILE_ALLOWLIST = new Map<string, string>([
  ["bericht.html", "text/html; charset=utf-8"],
  ["rohdaten.json", "application/json; charset=utf-8"],
  ["zusammenfassung.md", "text/markdown; charset=utf-8"],
]);

const DEEP_LINK_PATHS = ["/", "/umlagerungen", "/nachbestellungen", "/marken"];

function queryString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function readZusammenfassung(dir: string, folder: string): string {
  try {
    return readFileSync(path.join(dir, folder, "zusammenfassung.md"), "utf8");
  } catch {
    return "";
  }
}

function runDetail(dir: string, run: RunFolder): RunDetail {
  const zusammenfassung = readZusammenfassung(dir, run.folder);
  const { kpis, breakEven } = parseSummary(zusammenfassung);
  return {
    run,
    kpis,
    breakEven,
    zusammenfassung,
    bestellungen: bestellungenFor(dir),
  };
}

export function zahlenRouter(ctx: ZahlenContext): Router {
  const router = Router();

  router.get("/last", (_req, res) => {
    if (ctx.dir === null) {
      res.json({ run: null });
      return;
    }
    const run = lastRun(ctx.dir);
    if (run === null) {
      res.json({ run: null });
      return;
    }
    res.json(runDetail(ctx.dir, run));
  });

  router.get("/runs", (_req, res) => {
    res.json({ runs: ctx.dir === null ? [] : listRuns(ctx.dir) });
  });

  router.get("/run", (req, res) => {
    const folder = queryString(req.query.folder);
    if (!isRunFolderName(folder)) {
      res.status(400).json({
        error: "folder must match YYYY-MM-DD-(zwischenstand|abschluss)",
      });
      return;
    }
    if (ctx.dir === null) {
      res.json({ run: null });
      return;
    }
    const found = listRuns(ctx.dir).find((run) => run.folder === folder);
    if (found === undefined) {
      res.status(404).json({ error: "not found" });
      return;
    }
    res.json(runDetail(ctx.dir, found));
  });

  router.get("/file", (req, res) => {
    const folder = queryString(req.query.folder);
    if (!isRunFolderName(folder)) {
      res.status(400).json({
        error: "folder must match YYYY-MM-DD-(zwischenstand|abschluss)",
      });
      return;
    }
    const name = queryString(req.query.name);
    const contentType = FILE_ALLOWLIST.get(name);
    if (contentType === undefined) {
      res.status(400).json({
        error: `name must be one of ${[...FILE_ALLOWLIST.keys()].join(", ")}`,
      });
      return;
    }
    if (ctx.dir === null) {
      res.status(404).json({ error: "not found" });
      return;
    }
    const target = path.join(ctx.dir, folder, name);
    if (!existsSync(target) || !statSync(target).isFile()) {
      res.status(404).json({ error: "not found" });
      return;
    }
    res.type(contentType).send(readFileSync(target, "utf8"));
  });

  router.get("/links", (_req, res) => {
    res.json({ base: ctx.mycraftonUrl, paths: DEEP_LINK_PATHS });
  });

  return router;
}
