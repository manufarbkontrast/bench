import { mkdirSync, writeFileSync } from "node:fs";
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
import { runPlaudFetch } from "../../src/eingang/plaud-fetch.js";
import type { PlaudCommand } from "../../src/eingang/plaud-mcp.js";
import type { EingangContext, PlaudSource } from "../../src/eingang/routes.js";
import { createRunner } from "../../src/eingang/runner.js";
import { appWithEingang } from "./app.js";
import { scratchDir } from "./tmp.js";

const EINGANG_FIXTURE = fileURLToPath(
  new URL("../../src/eingang/fixture", import.meta.url),
);
const AUFGABEN_NOTIZEN = fileURLToPath(
  new URL("../../src/aufgaben/fixture/notizen", import.meta.url),
);

const FAKE: PlaudCommand = [
  process.execPath,
  fileURLToPath(
    new URL("../../src/eingang/fixture/fake-plaud-mcp.mjs", import.meta.url),
  ),
];

const scratch = scratchDir("bench-eingang-routes-");
afterAll(scratch.cleanup);

// A configured world for the MCP-reaching tests: an empty inbox/, and a note in notizen/ that
// already names fix-hafen-0820, so the reconciliation test has a local id to find.
const scratchHome = path.join(scratch.dir, "configured-home");
mkdirSync(path.join(scratchHome, "inbox"), { recursive: true });
mkdirSync(path.join(scratchHome, "notizen"), { recursive: true });
writeFileSync(
  path.join(scratchHome, "notizen", "hafenrunde.md"),
  "---\naufnahme: fix-hafen-0820\n---\n\nHafenrunde.\n",
);

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
interface PlaudResponse {
  source: PlaudSource;
  recordings: { id: string; status: string }[];
  nextPage: number | null;
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
    projektSlugs: () => ["leuchtturm", "hafen"],
  };
  const mcp: PlaudCommand = "off";
  const runner = createRunner(db, path.join(scratch.dir, `jobs-${n}`), {
    "vault-reindex": neverCalled,
    "projekte-scan": neverCalled,
    // The real runner, bound to this test's paths - the sample world's early return means it
    // never touches mcp, so the sample-run test is a real exercise of runPlaudFetch rather than
    // a stand-in that only proves the plumbing.
    "plaud-fetch": (log, args) =>
      runPlaudFetch(
        {
          command: mcp,
          plaudHome: paths.plaudHome,
          sample: paths.sample,
          today: () => "2026-09-06",
        },
        args.id as string,
        log,
      ),
  });
  const ctx: EingangContext = {
    db,
    located,
    plaud: { dir: AUFGABEN_NOTIZEN, source: "sample" },
    mcp,
    runner,
    paths,
  };
  app = appWithEingang(ctx);
});

interface AppWithOverrides {
  sample?: boolean;
  mcp?: PlaudCommand;
  plaudHome?: string;
}

let variantN = 0;

/** A variant EingangContext for the tests that need a non-default sample/mcp/plaudHome. */
function appWith(overrides: AppWithOverrides = {}): express.Express {
  variantN += 1;
  const sample = overrides.sample ?? true;
  const mcp = overrides.mcp ?? "off";
  const plaudHome = overrides.plaudHome ?? EINGANG_FIXTURE;
  const variantDb = openEingangDb(":memory:");
  const located: LocatedEingang = locateEingang(
    { inboxWatch: [], controllingDir: undefined },
    EINGANG_FIXTURE,
  );
  const paths: JobPaths = {
    plaudHome,
    vaultDir: EINGANG_FIXTURE,
    controllingDir: located.controllingDir,
    skillsDir: EINGANG_FIXTURE,
    sample,
    projektSlugs: () => ["leuchtturm", "hafen"],
  };
  const runner = createRunner(
    variantDb,
    path.join(scratch.dir, `jobs-variant-${String(variantN)}`),
    {
      "vault-reindex": neverCalled,
      "projekte-scan": neverCalled,
      "plaud-fetch": (log, args) =>
        runPlaudFetch(
          {
            command: mcp,
            plaudHome: paths.plaudHome,
            sample: paths.sample,
            today: () => "2026-09-06",
          },
          args.id as string,
          log,
        ),
    },
  );
  const ctx: EingangContext = {
    db: variantDb,
    located,
    // The way index.ts derives it: a configured world's notes sit at <plaudHome>/notizen.
    plaud: sample
      ? { dir: AUFGABEN_NOTIZEN, source: "sample" }
      : { dir: path.join(plaudHome, "notizen"), source: "configured" },
    mcp,
    runner,
    paths,
  };
  return appWithEingang(ctx);
}

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
  it("lists the four fixture files, the Hafenrunde transcript matched to its note and the werkstattrunde and werftbegehung ones unprocessed", async () => {
    const res = await request(app).get("/api/eingang/inbox");

    expect(res.status).toBe(200);
    const body = res.body as InboxResponse;
    expect(body.source).toBe("sample");
    expect(body.files).toHaveLength(4);
    const byName = new Map(body.files.map((file) => [file.name, file]));
    expect(
      byName.get("08-20_Besprechung_Hafenrunde-transcript.pdf")?.status,
    ).toBe("notiz_vorhanden");
    expect(byName.get("2026-08-30_werkstattrunde-transcript.txt")?.status).toBe(
      "unverarbeitet",
    );
    expect(byName.get("2026-08-25_werftbegehung-transkript.md")?.status).toBe(
      "unverarbeitet",
    );
  });
});

describe("GET /api/eingang/plaud", () => {
  it("lists the three fixture recordings with their marks under sample data", async () => {
    const res = await request(app).get("/api/eingang/plaud");
    expect(res.status).toBe(200);
    const body = res.body as PlaudResponse;
    expect(body.source).toBe("sample");
    expect(body.nextPage).toBeNull();
    expect(body.recordings.map((r) => r.id)).toEqual([
      "fix-lampe-0901",
      "fix-werft-0825",
      "fix-hafen-0820",
    ]);
    const byId = new Map(body.recordings.map((r) => [r.id, r]));
    expect(byId.get("fix-lampe-0901")?.status).toBe("neu");
    expect(byId.get("fix-werft-0825")?.status).toBe("im_eingang");
    expect(byId.get("fix-hafen-0820")?.status).toBe("notiz_vorhanden");
  });
  it("answers off with an empty list when the command is off in a configured world", async () => {
    const res = await request(appWith({ sample: false, mcp: "off" })).get(
      "/api/eingang/plaud",
    );
    expect(res.body).toEqual({ source: "off", recordings: [], nextPage: null });
  });
  it("reaches the fake MCP in a configured world and reconciles by id", async () => {
    const res = await request(
      appWith({ sample: false, mcp: FAKE, plaudHome: scratchHome }),
    ).get("/api/eingang/plaud?page=1");
    const body = res.body as PlaudResponse;
    expect(body.source).toBe("mcp");
    expect(body.recordings.find((r) => r.id === "fix-hafen-0820")?.status).toBe(
      "notiz_vorhanden",
    );
    expect(body.recordings.find((r) => r.id === "fix-lampe-0901")?.status).toBe(
      "neu",
    );
  });
  it("maps a 401 to source unauthenticated with 200", async () => {
    process.env.BENCH_FAKE_PLAUD = "unauthenticated";
    try {
      const res = await request(
        appWith({ sample: false, mcp: FAKE, plaudHome: scratchHome }),
      ).get("/api/eingang/plaud");
      expect(res.status).toBe(200);
      expect((res.body as PlaudResponse).source).toBe("unauthenticated");
    } finally {
      delete process.env.BENCH_FAKE_PLAUD;
    }
  });
  it("maps everything else to source unreachable with 200", async () => {
    // "exit" quits mid-call, so the client sees the process die with a call still pending -
    // classifyFailure's fallback, exercised here rather than only in plaud-mcp.test.ts's own unit
    // test of that function.
    process.env.BENCH_FAKE_PLAUD = "exit";
    try {
      const res = await request(
        appWith({ sample: false, mcp: FAKE, plaudHome: scratchHome }),
      ).get("/api/eingang/plaud");
      expect(res.status).toBe(200);
      expect((res.body as PlaudResponse).source).toBe("unreachable");
    } finally {
      delete process.env.BENCH_FAKE_PLAUD;
    }
  });
});

describe("GET /api/eingang/projekte", () => {
  it("answers the injected slugs", async () => {
    const res = await request(app).get("/api/eingang/projekte");
    expect(res.body).toEqual({ slugs: ["leuchtturm", "hafen"] });
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

describe("POST /api/eingang/jobs - plaud-fetch", () => {
  it("runs the sample fetch to done with the four log lines", async () => {
    const res = await request(app)
      .post("/api/eingang/jobs")
      .send({ kind: "plaud-fetch", args: { id: "fix-lampe-0901" } });
    expect(res.status).toBe(201);
    const finished = await waitForTerminal((res.body as JobResponse).job.id);
    expect(finished.status).toBe("done");
    const log = (
      await request(app).get(`/api/eingang/jobs/${String(finished.id)}`)
    ).body as JobLogResponse;
    expect(log.log).toContain("sample world: nothing written");
  }, 10_000);
  it("400s a hostile id and leaves the table empty", async () => {
    const res = await request(app)
      .post("/api/eingang/jobs")
      .send({ kind: "plaud-fetch", args: { id: "../x" } });
    expect(res.status).toBe(400);
    expect(jobCount()).toBe(0);
  });
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

  it("caps a log bigger than 64 KB to exactly its last 64 KB, read by position rather than the whole file", async () => {
    const logPath = path.join(scratch.dir, `big-log-${n}.log`);
    const filler = "x".repeat(70 * 1024);
    const marker = "TAIL-MARKER";
    writeFileSync(logPath, filler + marker);
    const id = insertJob(db, {
      kind: "plaud-sync",
      argsJson: "{}",
      startedAt: Date.now(),
      logPath,
    });

    const res = await request(app).get(`/api/eingang/jobs/${id}`);

    expect(res.status).toBe(200);
    const body = res.body as JobLogResponse;
    expect(body.log).toHaveLength(64 * 1024);
    expect(body.log.endsWith(marker)).toBe(true);
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

describe("POST /api/eingang/jobs - a null plaudHome", () => {
  it("400s plaud-sync, plaud-process and aufgaben-import, never reaching the runner", async () => {
    const nullPlaudDb = openEingangDb(":memory:");
    const nullPlaudLocated: LocatedEingang = locateEingang(
      { inboxWatch: [], controllingDir: undefined },
      EINGANG_FIXTURE,
    );
    const nullPlaudPaths: JobPaths = {
      plaudHome: null,
      vaultDir: EINGANG_FIXTURE,
      controllingDir: nullPlaudLocated.controllingDir,
      skillsDir: EINGANG_FIXTURE,
      sample: false,
      projektSlugs: () => [],
    };
    const nullPlaudRunner = createRunner(
      nullPlaudDb,
      path.join(scratch.dir, `jobs-null-plaud-${n}`),
      {
        "vault-reindex": neverCalled,
        "projekte-scan": neverCalled,
        "plaud-fetch": neverCalled,
      },
    );
    const nullPlaudApp = appWithEingang({
      db: nullPlaudDb,
      located: nullPlaudLocated,
      plaud: { dir: AUFGABEN_NOTIZEN, source: "sample" },
      mcp: "off",
      runner: nullPlaudRunner,
      paths: nullPlaudPaths,
    });

    const bodies = [
      { kind: "plaud-sync" },
      { kind: "plaud-process", args: { file: "x.txt" } },
      { kind: "aufgaben-import", args: { file: "x.md" } },
    ];
    for (const body of bodies) {
      const res = await request(nullPlaudApp)
        .post("/api/eingang/jobs")
        .send(body);
      expect(res.status).toBe(400);
      expect((res.body as { error: string }).error).toBe(
        "plaud is not configured",
      );
    }
    expect(
      (
        nullPlaudDb.prepare("SELECT COUNT(*) AS c FROM jobs").get() as {
          c: number;
        }
      ).c,
    ).toBe(0);
  });
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
