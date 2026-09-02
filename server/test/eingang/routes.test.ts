import path from "node:path";
import { fileURLToPath } from "node:url";
import type express from "express";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  getJob,
  insertJob,
  openEingangDb,
  type JobRow,
} from "../../src/eingang/db.js";
import type { JobPaths } from "../../src/eingang/jobs.js";
import {
  locateEingang,
  type LocatedEingang,
} from "../../src/eingang/locate.js";
import type { EingangContext } from "../../src/eingang/routes.js";
import { createRunner } from "../../src/eingang/runner.js";
import { appWithEingang } from "./app.js";
import { scratchDir } from "./tmp.js";

const EINGANG_FIXTURE = fileURLToPath(
  new URL("../../src/eingang/fixture", import.meta.url),
);
const AUFGABEN_NOTIZEN = fileURLToPath(
  new URL("../../src/aufgaben/fixture/notizen", import.meta.url),
);

const scratch = scratchDir("bench-eingang-routes-");
afterAll(scratch.cleanup);

interface InboxFileReply {
  name: string;
  status: string;
}
interface InboxResponse {
  source: string;
  files: InboxFileReply[];
}
interface JobResponse {
  job: JobRow;
}
interface JobsResponse {
  jobs: JobRow[];
}
interface JobLogResponse {
  job: JobRow;
  log: string;
}
interface ScheduleResponse {
  runs: {
    label: string;
    day: number | null;
    hour: number | null;
    minute: number | null;
  }[];
}

function neverCalled(): Promise<void> {
  return Promise.reject(new Error("this internal job was not meant to run"));
}

let n = 0;
let db: ReturnType<typeof openEingangDb>;
let app: express.Express;

beforeEach(() => {
  n += 1;
  db = openEingangDb(":memory:");
  const located: LocatedEingang = locateEingang(
    { inboxWatch: [], controllingDir: undefined },
    EINGANG_FIXTURE,
  );
  const paths: JobPaths = {
    plaudHome: EINGANG_FIXTURE,
    vaultDir: EINGANG_FIXTURE,
    controllingDir: located.controllingDir,
    skillsDir: EINGANG_FIXTURE,
    sample: true,
  };
  const runner = createRunner(db, path.join(scratch.dir, `jobs-${n}`), {
    "vault-reindex": neverCalled,
    "projekte-scan": neverCalled,
  });
  const ctx: EingangContext = {
    db,
    located,
    plaud: { dir: AUFGABEN_NOTIZEN, source: "sample" },
    runner,
    paths,
  };
  app = appWithEingang(ctx);
});

/**
 * The runner has no completion callback for the caller, so a test polls the row until it leaves
 * "running" - the same shape runner.test.ts uses. Generous because the fixture's normal run
 * alone takes three seconds.
 */
async function waitForTerminal(
  id: number,
  timeoutMs = 10_000,
): Promise<JobRow> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const job = getJob(db, id);
    if (job && job.status !== "running") return job;
    if (Date.now() > deadline)
      throw new Error(
        `job ${id} did not leave "running" within ${timeoutMs}ms`,
      );
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

function jobCount(): number {
  return (db.prepare("SELECT COUNT(*) AS c FROM jobs").get() as { c: number })
    .c;
}

describe("GET /api/eingang/inbox", () => {
  it("lists the three fixture files, the Hafenrunde transcript matched to its note and the werkstattrunde one unprocessed", async () => {
    const res = await request(app).get("/api/eingang/inbox");

    expect(res.status).toBe(200);
    const body = res.body as InboxResponse;
    expect(body.source).toBe("sample");
    expect(body.files).toHaveLength(3);
    const byName = new Map(body.files.map((file) => [file.name, file]));
    expect(
      byName.get("08-20_Besprechung_Hafenrunde-transcript.pdf")?.status,
    ).toBe("notiz_vorhanden");
    expect(byName.get("2026-08-30_werkstattrunde-transcript.txt")?.status).toBe(
      "unverarbeitet",
    );
  });
});

describe("POST /api/eingang/jobs", () => {
  it("starts plaud-sync and it reaches done against the fake job", async () => {
    const res = await request(app)
      .post("/api/eingang/jobs")
      .send({ kind: "plaud-sync" });

    expect(res.status).toBe(201);
    const started = (res.body as JobResponse).job;
    expect(started.status).toBe("running");

    const finished = await waitForTerminal(started.id);
    expect(finished.status).toBe("done");
  }, 10_000);

  it("fences hostile args and an unknown kind with 400, leaving the jobs table empty", async () => {
    const bodies = [
      { kind: "plaud-process", args: { file: "../../etc/hosts" } },
      { kind: "controlling", args: { modus: "x" } },
      { kind: "nonsense" },
    ];

    for (const body of bodies) {
      const res = await request(app).post("/api/eingang/jobs").send(body);
      expect(res.status).toBe(400);
    }
    expect(jobCount()).toBe(0);
  });

  it("refuses a second start of the same hanging kind with 409, and kill flips it to killed", async () => {
    process.env.BENCH_FAKE_JOB = "hang";
    try {
      const first = await request(app)
        .post("/api/eingang/jobs")
        .send({ kind: "plaud-sync" });
      expect(first.status).toBe(201);
      const firstJob = (first.body as JobResponse).job;

      const second = await request(app)
        .post("/api/eingang/jobs")
        .send({ kind: "plaud-sync" });
      expect(second.status).toBe(409);
      expect(second.body).toEqual({ error: "already running" });

      const killRes = await request(app).post(
        `/api/eingang/jobs/${firstJob.id}/kill`,
      );
      expect(killRes.status).toBe(200);

      const finished = await waitForTerminal(firstJob.id);
      expect(finished.status).toBe("killed");
    } finally {
      delete process.env.BENCH_FAKE_JOB;
    }
  }, 10_000);
});

describe("GET /api/eingang/jobs", () => {
  it("lists a started job among the last 50", async () => {
    const start = await request(app)
      .post("/api/eingang/jobs")
      .send({ kind: "plaud-sync" });
    const id = (start.body as JobResponse).job.id;
    await waitForTerminal(id);

    const res = await request(app).get("/api/eingang/jobs");

    expect(res.status).toBe(200);
    const body = res.body as JobsResponse;
    expect(body.jobs.some((job) => job.id === id)).toBe(true);
  }, 10_000);
});

describe("GET /api/eingang/jobs/:id", () => {
  it("returns the job and the fake job's log text", async () => {
    const start = await request(app)
      .post("/api/eingang/jobs")
      .send({ kind: "plaud-sync" });
    const id = (start.body as JobResponse).job.id;
    await waitForTerminal(id);

    const res = await request(app).get(`/api/eingang/jobs/${id}`);

    expect(res.status).toBe(200);
    const body = res.body as JobLogResponse;
    expect(body.job.id).toBe(id);
    expect(body.log).toContain("fake-job start plaud-sync");
  }, 10_000);

  it("answers 404 for an unknown id", async () => {
    const res = await request(app).get("/api/eingang/jobs/999999");
    expect(res.status).toBe(404);
  });

  it("answers 200 with an empty log when the file has not been created yet", async () => {
    // Bypasses the runner on purpose: start() returns before createWriteStream's open()
    // completes, and this reproduces that exact window without waiting on a race.
    const id = insertJob(db, {
      kind: "plaud-sync",
      argsJson: "{}",
      startedAt: Date.now(),
      logPath: path.join(scratch.dir, `not-yet-written-${n}.log`),
    });

    const res = await request(app).get(`/api/eingang/jobs/${id}`);

    expect(res.status).toBe(200);
    const body = res.body as JobLogResponse;
    expect(body.job.id).toBe(id);
    expect(body.log).toBe("");
  });
});

describe("POST /api/eingang/jobs/:id/kill", () => {
  it("answers 404 for an unknown id", async () => {
    const res = await request(app).post("/api/eingang/jobs/999999/kill");
    expect(res.status).toBe(404);
  });

  it("answers 409 for a job that already finished", async () => {
    const start = await request(app)
      .post("/api/eingang/jobs")
      .send({ kind: "plaud-sync" });
    const id = (start.body as JobResponse).job.id;
    await waitForTerminal(id);

    const res = await request(app).post(`/api/eingang/jobs/${id}/kill`);

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: "not running" });
  }, 10_000);
});

describe("GET /api/eingang/schedule", () => {
  it("lists the two fixture launchd runs", async () => {
    const res = await request(app).get("/api/eingang/schedule");

    expect(res.status).toBe(200);
    const body = res.body as ScheduleResponse;
    expect(body.runs.map((run) => run.label)).toEqual([
      "de.beispiel.controlling.abschluss",
      "de.beispiel.controlling.zwischenstand",
    ]);
  });
});
