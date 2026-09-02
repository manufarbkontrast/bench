/** Eingang API: the watched inbox, fenced jobs and the externally scheduled runs. Mounted at /api/eingang. */
import { Router } from "express";
import { readFileSync } from "node:fs";
import path from "node:path";
import type Database from "better-sqlite3";
import { getJob, listJobs, runningJobs, type JobRow } from "./db.js";
import { listInbox } from "./inbox.js";
import {
  JOB_TIMEOUTS_MS,
  planJob,
  type JobKind,
  type JobPaths,
} from "./jobs.js";
import type { LocatedEingang } from "./locate.js";
import type { Runner } from "./runner.js";
import { listScheduledRuns } from "./schedule.js";

export interface EingangContext {
  db: Database.Database;
  located: LocatedEingang;
  plaud: { dir: string; source: "configured" | "sample" };
  runner: Runner;
  paths: JobPaths;
}

const JOB_LIST_LIMIT = 50;

// The UI polls this endpoint while a job runs; capping the reply keeps a long or noisy job's log
// from growing the response without bound.
const LOG_TAIL_BYTES = 64 * 1024;

function tailLog(logPath: string): string {
  const buffer = readFileSync(logPath);
  return buffer.length > LOG_TAIL_BYTES
    ? buffer.subarray(buffer.length - LOG_TAIL_BYTES).toString("utf8")
    : buffer.toString("utf8");
}

/**
 * The Plaud archive sits beside notizen at <PLAUD_HOME>/archiv, but only for a configured
 * install - the bundled sample fixture carries no archiv sibling, so reconciliation there rests
 * on notes (quelle) alone. A path that can never exist keeps listInbox's check a plain
 * existsSync, with nothing sample-specific in the check itself.
 */
function archivDirOf(plaud: EingangContext["plaud"]): string {
  return plaud.source === "configured"
    ? path.join(plaud.dir, "..", "archiv")
    : path.join(plaud.dir, "..", "no-archiv-in-sample");
}

/**
 * The file names a running plaud-process job is already working on, read back from the args
 * every start() recorded. listInbox stays pure and takes this as data, so the composition lives
 * here rather than in that module.
 */
function inFlightFiles(db: Database.Database): Set<string> {
  const files = new Set<string>();
  for (const job of runningJobs(db)) {
    const args = JSON.parse(job.argsJson) as Record<string, unknown>;
    if (typeof args.file === "string") files.add(args.file);
  }
  return files;
}

interface JobBody {
  kind?: unknown;
  args?: unknown;
}

function bodyArgs(body: JobBody): Record<string, unknown> {
  return typeof body.args === "object" &&
    body.args !== null &&
    !Array.isArray(body.args)
    ? (body.args as Record<string, unknown>)
    : {};
}

function findJob(db: Database.Database, rawId: string): JobRow | null {
  const id = Number(rawId);
  return Number.isInteger(id) ? getJob(db, id) : null;
}

export function eingangRouter(ctx: EingangContext): Router {
  const { db, located, plaud, runner, paths } = ctx;
  const router = Router();

  router.get("/inbox", (_req, res) => {
    const files = listInbox(
      located.watchDirs,
      { notizenDir: plaud.dir, archivDir: archivDirOf(plaud) },
      inFlightFiles(db),
    );
    res.json({ source: located.source, files });
  });

  router.get("/jobs", (_req, res) => {
    res.json({ jobs: listJobs(db, JOB_LIST_LIMIT) });
  });

  router.get("/jobs/:id", (req, res) => {
    const job = findJob(db, req.params.id);
    if (!job) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json({ job, log: tailLog(job.logPath) });
  });

  router.post("/jobs", (req, res) => {
    const body = req.body as JobBody;
    const kind = typeof body.kind === "string" ? body.kind : "";
    const args = bodyArgs(body);

    const plan = planJob(kind, args, paths);
    if ("error" in plan) {
      res.status(400).json({ error: plan.error });
      return;
    }
    // planJob only returns a plan (never an error) for a kind the JobKind union actually
    // contains - the cast just names what the fence above already proved.
    const jobKind = kind as JobKind;
    if (runner.isRunning(jobKind)) {
      res.status(409).json({ error: "already running" });
      return;
    }

    const env = { ...process.env, PLAUD_HOME: paths.plaudHome };
    const job = runner.start(
      jobKind,
      JSON.stringify(args),
      plan,
      env,
      JOB_TIMEOUTS_MS[jobKind],
    );
    res.status(201).json({ job });
  });

  router.post("/jobs/:id/kill", (req, res) => {
    const existing = findJob(db, req.params.id);
    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    // Switch on the string union, never truthiness - "not_running" and "internal" are both
    // truthy strings and would otherwise read as success.
    const outcome = runner.kill(existing.id);
    switch (outcome) {
      case "killed":
        res.json({ job: getJob(db, existing.id) });
        return;
      case "not_running":
        res.status(409).json({ error: "not running" });
        return;
      case "internal":
        res.status(409).json({ error: "internal jobs cannot be cancelled" });
        return;
    }
  });

  router.get("/schedule", (_req, res) => {
    res.json({ runs: listScheduledRuns(located.launchAgentsDir) });
  });

  return router;
}
