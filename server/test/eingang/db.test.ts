import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import {
  finishJob,
  getJob,
  insertJob,
  listJobs,
  openEingangDb,
  reconcileRunning,
  runningJobs,
} from "../../src/eingang/db.js";

describe("openEingangDb", () => {
  it("inserts a job running and reads it back camelCase", () => {
    const db = openEingangDb(":memory:");
    const id = insertJob(db, {
      kind: "plaud-sync",
      argsJson: "{}",
      startedAt: 1_700_000_000,
      logPath: "/var/log/eingang/1.log",
    });

    expect(getJob(db, id)).toEqual({
      id,
      kind: "plaud-sync",
      argsJson: "{}",
      status: "running",
      startedAt: 1_700_000_000,
      finishedAt: null,
      exitCode: null,
      logPath: "/var/log/eingang/1.log",
      pid: null,
    });
  });

  it("a fresh job has a null pid until the runner sets it", () => {
    const db = openEingangDb(":memory:");
    const id = insertJob(db, {
      kind: "plaud-sync",
      argsJson: "{}",
      startedAt: 1,
      logPath: "/a.log",
    });

    expect(getJob(db, id)?.pid).toBeNull();
  });

  it("adds the pid column to a jobs table created before it existed", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "bench-eingang-migrate-"));
    const file = path.join(dir, "eingang.sqlite");
    const old = new Database(file);
    old.exec(
      `CREATE TABLE jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        kind TEXT NOT NULL,
        args_json TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('running','done','failed','killed','timeout')),
        started_at INTEGER NOT NULL,
        finished_at INTEGER,
        exit_code INTEGER,
        log_path TEXT NOT NULL
      )`,
    );
    old.close();

    const db = openEingangDb(file);
    const columns = (
      db.prepare("PRAGMA table_info(jobs)").all() as { name: string }[]
    ).map((c) => c.name);
    expect(columns).toContain("pid");
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("finishes a job, setting status, exit code and finished_at", () => {
    const db = openEingangDb(":memory:");
    const id = insertJob(db, {
      kind: "controlling",
      argsJson: '{"modus":"zwischenstand"}',
      startedAt: 1_700_000_000,
      logPath: "/var/log/eingang/2.log",
    });

    finishJob(db, id, "done", 0);

    const row = getJob(db, id);
    expect(row?.status).toBe("done");
    expect(row?.exitCode).toBe(0);
    expect(row?.finishedAt).toEqual(expect.any(Number));
  });

  it("returns null for a missing id", () => {
    const db = openEingangDb(":memory:");
    expect(getJob(db, 999)).toBeNull();
  });

  it("lists jobs newest started first", () => {
    const db = openEingangDb(":memory:");
    const first = insertJob(db, {
      kind: "plaud-sync",
      argsJson: "{}",
      startedAt: 1,
      logPath: "/a.log",
    });
    const second = insertJob(db, {
      kind: "controlling",
      argsJson: "{}",
      startedAt: 2,
      logPath: "/b.log",
    });
    const third = insertJob(db, {
      kind: "aufgaben-import",
      argsJson: "{}",
      startedAt: 3,
      logPath: "/c.log",
    });

    expect(listJobs(db, 10).map((row) => row.id)).toEqual([
      third,
      second,
      first,
    ]);
  });

  it("limits the number of rows listed", () => {
    const db = openEingangDb(":memory:");
    insertJob(db, {
      kind: "plaud-sync",
      argsJson: "{}",
      startedAt: 1,
      logPath: "/a.log",
    });
    insertJob(db, {
      kind: "plaud-sync",
      argsJson: "{}",
      startedAt: 2,
      logPath: "/b.log",
    });
    insertJob(db, {
      kind: "plaud-sync",
      argsJson: "{}",
      startedAt: 3,
      logPath: "/c.log",
    });

    expect(listJobs(db, 2)).toHaveLength(2);
  });

  it("runningJobs returns only rows still running", () => {
    const db = openEingangDb(":memory:");
    const running = insertJob(db, {
      kind: "plaud-sync",
      argsJson: "{}",
      startedAt: 1,
      logPath: "/a.log",
    });
    const finished = insertJob(db, {
      kind: "controlling",
      argsJson: "{}",
      startedAt: 2,
      logPath: "/b.log",
    });
    finishJob(db, finished, "done", 0);

    expect(runningJobs(db).map((row) => row.id)).toEqual([running]);
  });

  it("reconcileRunning flips exactly the running rows to failed with a null exit code when nothing is alive", () => {
    const db = openEingangDb(":memory:");
    const stale = insertJob(db, {
      kind: "plaud-sync",
      argsJson: "{}",
      startedAt: 1,
      logPath: "/a.log",
    });
    const alreadyDone = insertJob(db, {
      kind: "controlling",
      argsJson: "{}",
      startedAt: 2,
      logPath: "/b.log",
    });
    finishJob(db, alreadyDone, "done", 0);
    const alreadyFailed = insertJob(db, {
      kind: "aufgaben-import",
      argsJson: "{}",
      startedAt: 3,
      logPath: "/c.log",
    });
    finishJob(db, alreadyFailed, "failed", 1);

    reconcileRunning(db, () => false);

    const staleRow = getJob(db, stale);
    expect(staleRow?.status).toBe("failed");
    expect(staleRow?.exitCode).toBeNull();

    const doneRow = getJob(db, alreadyDone);
    expect(doneRow?.status).toBe("done");
    expect(doneRow?.exitCode).toBe(0);

    const failedRow = getJob(db, alreadyFailed);
    expect(failedRow?.status).toBe("failed");
    expect(failedRow?.exitCode).toBe(1);
  });

  it("reconcileRunning leaves a row running when isAlive confirms its pid, and fails the rest", () => {
    const db = openEingangDb(":memory:");
    const aliveId = insertJob(db, {
      kind: "plaud-sync",
      argsJson: "{}",
      startedAt: 1,
      logPath: "/a.log",
    });
    db.prepare("UPDATE jobs SET pid = ? WHERE id = ?").run(4321, aliveId);
    const goneId = insertJob(db, {
      kind: "controlling",
      argsJson: "{}",
      startedAt: 2,
      logPath: "/b.log",
    });
    db.prepare("UPDATE jobs SET pid = ? WHERE id = ?").run(9999, goneId);

    reconcileRunning(db, (pid) => pid === 4321);

    const aliveRow = getJob(db, aliveId);
    expect(aliveRow?.status).toBe("running");
    expect(aliveRow?.finishedAt).toBeNull();
    expect(aliveRow?.exitCode).toBeNull();

    const goneRow = getJob(db, goneId);
    expect(goneRow?.status).toBe("failed");
    expect(goneRow?.exitCode).toBeNull();
  });

  it("reconcileRunning fails a running row with no pid even when isAlive would answer true for everything", () => {
    const db = openEingangDb(":memory:");
    const internalId = insertJob(db, {
      kind: "aufgaben-import",
      argsJson: "{}",
      startedAt: 1,
      logPath: "/a.log",
    });

    reconcileRunning(db, () => true);

    const row = getJob(db, internalId);
    expect(row?.status).toBe("failed");
    expect(row?.exitCode).toBeNull();
  });
});
