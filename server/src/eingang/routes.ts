/** Eingang API: the watched inbox, fenced jobs and the externally scheduled runs. Mounted at /api/eingang. */
import { Router } from "express";
import {
  closeSync,
  fstatSync,
  openSync,
  readFileSync,
  readSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type Database from "better-sqlite3";
import { getJob, listJobs, runningJobs, type JobRow } from "./db.js";
import {
  listInbox,
  localRecordingIds,
  plaudStatus,
  type RecordingStatus,
} from "./inbox.js";
import {
  JOB_TIMEOUTS_MS,
  planJob,
  type JobKind,
  type JobPaths,
} from "./jobs.js";
import type { LocatedEingang } from "./locate.js";
import {
  listRecordings,
  parseListFiles,
  type Recording,
  type RecordingPage,
} from "./plaud-fetch.js";
import {
  PlaudError,
  withPlaud,
  type PlaudCommand,
  type PlaudFailure,
} from "./plaud-mcp.js";
import type { Runner } from "./runner.js";
import { listScheduledRuns } from "./schedule.js";

export interface EingangContext {
  db: Database.Database;
  located: LocatedEingang;
  plaud: { dir: string; source: "configured" | "sample" };
  mcp: PlaudCommand;
  runner: Runner;
  paths: JobPaths;
}

export type PlaudSource =
  "mcp" | "sample" | "off" | "unauthenticated" | "unreachable";

interface PlaudReply {
  source: PlaudSource;
  recordings: (Recording & { status: RecordingStatus })[];
  nextPage: number | null;
}

const JOB_LIST_LIMIT = 50;

// The UI polls this endpoint while a job runs; capping the reply keeps a long or noisy job's log
// from growing the response without bound.
const LOG_TAIL_BYTES = 64 * 1024;

function tailLog(logPath: string): string {
  // runner.start() returns synchronously once the job row is inserted, but the log file's
  // createWriteStream open() completes asynchronously - a client polling this route right after
  // the 201 (exactly what the UI does) can land in that window and find no file yet. An empty
  // tail is the correct answer for a job that has not logged anything yet; anything else (a
  // permissions error, a path that is a directory) still throws.
  let fd: number;
  try {
    fd = openSync(logPath, "r");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return "";
    throw err;
  }
  // Read only the trailing LOG_TAIL_BYTES by position rather than readFileSync-ing the whole
  // file - the panel polls this route every 2s while a job runs, and a verbose job logging for
  // 45 minutes would otherwise mean re-reading a multi-megabyte file on every tick just to keep
  // the last 64 KB of it.
  try {
    const size = fstatSync(fd).size;
    const start = Math.max(0, size - LOG_TAIL_BYTES);
    const length = size - start;
    const buffer = Buffer.alloc(length);
    if (length > 0) readSync(fd, buffer, 0, length, start);
    return buffer.toString("utf8");
  } finally {
    closeSync(fd);
  }
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

const FIXTURE_LISTING = fileURLToPath(
  new URL("./fixture/plaud-aufnahmen.json", import.meta.url),
);

function pageOf(raw: unknown): number {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 ? n : 1;
}

/** The ids running plaud-fetch jobs carry, the inFlightFiles twin for recordings. */
function inFlightIds(db: Database.Database): Set<string> {
  const ids = new Set<string>();
  for (const job of runningJobs(db)) {
    if (job.kind !== "plaud-fetch") continue;
    const args = JSON.parse(job.argsJson) as Record<string, unknown>;
    if (typeof args.id === "string") ids.add(args.id);
  }
  return ids;
}

function sourceOf(kind: PlaudFailure): PlaudSource {
  if (kind === "off") return "off";
  if (kind === "unauthenticated") return "unauthenticated";
  return "unreachable";
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
  const { db, located, plaud, mcp, runner, paths } = ctx;
  const router = Router();

  router.get("/inbox", (_req, res) => {
    const files = listInbox(
      located.watchDirs,
      { notizenDir: plaud.dir, archivDir: archivDirOf(plaud) },
      inFlightFiles(db),
    );
    res.json({ source: located.source, files });
  });

  // The same async handler shape projekteRouter's POST /scan uses: Express 5 forwards a rejection
  // to its error middleware, so only a PlaudError is caught here and everything else still 500s.
  router.get("/plaud", async (req, res) => {
    const page = pageOf(req.query.page);
    const empty = (source: PlaudSource): PlaudReply => ({
      source,
      recordings: [],
      nextPage: null,
    });
    if (paths.plaudHome === null) {
      res.json(empty("off"));
      return;
    }
    const local = localRecordingIds({
      inboxDir: path.join(paths.plaudHome, "inbox"),
      archivDir: archivDirOf(plaud),
      notizenDir: plaud.dir,
    });
    const inFlight = inFlightIds(db);
    const withStatus = (
      pageReply: RecordingPage,
      source: PlaudSource,
    ): PlaudReply => ({
      source,
      recordings: pageReply.recordings.map((r) => ({
        ...r,
        status: plaudStatus(r.id, local, inFlight),
      })),
      nextPage: pageReply.nextPage,
    });
    if (paths.sample) {
      res.json(
        withStatus(
          parseListFiles(
            page === 1 ? readFileSync(FIXTURE_LISTING, "utf8") : "[]",
            page,
          ),
          "sample",
        ),
      );
      return;
    }
    try {
      res.json(
        withStatus(
          await withPlaud(mcp, (call) => listRecordings(call, page)),
          "mcp",
        ),
      );
    } catch (err) {
      if (!(err instanceof PlaudError)) throw err;
      // The reply carries only the kind; the text (first 200 bytes, per the client) goes to the server log.
      console.error(`plaud mcp ${err.kind}: ${err.message}`);
      res.json(empty(sourceOf(err.kind)));
    }
  });

  router.get("/projekte", (_req, res) => {
    res.json({ slugs: paths.projektSlugs() });
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

    // planJob already refused any kind that needs plaudHome when it is null (see jobs.ts), so a
    // plan only reaches here with a real plaudHome or with a kind that never reads it - either
    // way, leaving PLAUD_HOME unset is correct rather than passing the literal string "null".
    const env = { ...process.env, PLAUD_HOME: paths.plaudHome ?? undefined };
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
