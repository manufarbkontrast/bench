import { describe, expect, it } from "vitest";
import {
  failStaleRunning,
  finishJob,
  getJob,
  insertJob,
  listJobs,
  openEingangDb,
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
    });
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

  it("failStaleRunning flips exactly the running rows to failed with a null exit code", () => {
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

    failStaleRunning(db);

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
});
