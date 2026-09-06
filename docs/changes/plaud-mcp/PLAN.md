# Plaud über den MCP - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to
> implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eingang lists the user's Plaud recordings straight from the Plaud MCP, marks per
recording id what is already local, fetches one on click as a Markdown file into
`<plaudHome>/inbox`, lets the person pick a project before `Verarbeiten`, and Projekte counts the
Plaud notes dated after each handoff as a fourth freshness signal. Spec: [SPEC.md](./SPEC.md).

**Architecture:** One new stdio JSON-RPC client in `server/src/eingang/plaud-mcp.ts` (spawn,
handshake, `tools/call`, kill), one pure module `plaud-fetch.ts` (parsers for the MCP's reply
shapes, the file's name and text, the `wx` write, the fetch run), and an id-based reconciliation
beside the existing name-based one in `inbox.ts`. The fence gains one internal kind,
`plaud-fetch`, and one optional argument, `projekt`, on `plaud-process`; the runner learns to
hand an internal job its arguments. Two new read routes. The composition root wires the MCP
command, the handoff slugs and the notizen directory in; no module crosses an app boundary.
`stand.ts` reads the notizen folder for the fourth signal; both web apps that show handoff badges
gain one. The sample world lists a bundled fixture and never spawns the MCP.

**Tech Stack:** Express 5, better-sqlite3, Node `child_process` + `readline`, Vite 8 + React 19,
vitest 4, Playwright. **No new dependency, no new database, no new `.env` key.**

## Global Constraints

- Node: `export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use 24` at the start of every
  shell. TypeScript `6.0.3` exactly.
- Before every commit: `npm run format`, then `npm run check`, then `npm run e2e` when the task
  touches `e2e/`, `web/`, `server/src/app.ts`, `server/src/index.ts` or a fixture. Coverage stays
  at or above 80 % statements per workspace. Every gate step FOREGROUND with a generous explicit
  timeout and its own exit code - never piped through `tail`/`head`/`grep`; a run that gets
  auto-backgrounded is polled to completion immediately. No Bench server may be running during
  `check` (`lsof -nP -iTCP:8100 -iTCP:8101 -sTCP:LISTEN` first - its vault watcher starves
  `watch.test.ts`). Opaque failure -> `df -h` first.
- Focused tests: `cd server && npx vitest run test/eingang test/projekte` /
  `cd web && npx vitest run src/eingang src/projekte src/home` (never `-w`, that is vitest's
  watch flag). e2e retry-safety proofs use `npx playwright test <spec> --workers=1 --repeat-each=2`.
- ESLint limits: 500 lines a file, 200 a function (`.tsx` exempt from the latter), complexity
  15, depth 4, 5 params. No `any`. No emoji in code or comments. Comments say why. Hand-rolled
  line scanners over regex-heavy parsing. Immutable data - build new objects, never mutate.
- **No import across app boundaries.** `server/src/eingang/` imports nothing from
  `server/src/vault/`, `server/src/projekte/` or `server/src/aufgaben/`; `server/src/projekte/`
  imports nothing from `server/src/eingang/`; `web/src/home/` imports nothing from a sibling.
  Where a rule is shared, it is mirrored locally with a why-comment naming the twin.
- **The real MCP is never reached by a test.** Unit tests use `fixture/fake-plaud-mcp.mjs` or
  `"off"`; the sample world (every e2e worker, `npm start` without `PLAUD_HOME`) is `"off"` by
  construction; `e2e/fixtures.ts` also sets `BENCH_PLAUD: "off"` explicitly.
- **One write, guarded.** This change writes exactly one new kind of file, under
  `<plaudHome>/inbox`, created with the `wx` flag from a clicked `plaud-fetch` job after the
  realpath check. Nothing else writes anywhere.
- Machine paths, transcript or note content, real recording titles and real ids never appear in
  tracked files, briefs, reports or the ledger - fixture ids (`fix-lampe-0901`), counts and
  shapes only. The probe report in the SDD workspace is shapes-only by construction.
- German UI strings exactly as written in this plan; identifiers, comments, commits English.
  Conventional Commits, one line under 72 characters, then a blank line and EXACTLY these two
  trailers on every commit:
  `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` <!-- allow-secret: Anthropic's own no-reply address, required verbatim in every commit trailer --> and
  `Claude-Session: https://claude.ai/code/session_01MoJadrroWuuNdrBRnWAPCF`. Never push. Branch
  `plaud-mcp`, cut from `main` at d66465c; the spec is already committed as f0ed1d3.

## Decisions settled at plan approval

The fifteen spec decisions stand. The probe the spec assigned to Task 0 was run at plan time
(2026-09-06, shapes only, recorded in `.superpowers/sdd/PLAN-plaud-mcp/probe-report.md`), so the
parsers below are written against the real reply shapes rather than the skills' documentation:

1. **`list_files` answers `{ type: "list", data: [...], page, page_size }`** with `page_size`
   at least 10 (2 is refused). Bench asks for 20 and sets `nextPage = page + 1` when `data`
   holds exactly 20 entries, else `null`. Of a recording Bench reads `id` (32 characters of
   `[A-Za-z0-9_-]`), `name`, `start_at` (`YYYY-MM-DDTHH:MM:SS`, no zone, taken as local) and
   `duration` (milliseconds); the other keys are ignored.
2. **A transcript page is an object with `segments` and `next_cursor`**, each segment carrying
   `content`, `start_time`, `end_time` and `speaker`, times in milliseconds (verified: the last
   `end_time` equals the duration within 0.1 %). Bench asks with `limit: 500` and follows
   `next_cursor` until it is `null`.
3. **Three answers mean "nothing here"** and are not errors: a bare `[]` (an untranscribed
   recording, for every block), the plain-text line
   `Block "mark_memo" not available for this recording. ...` (transcribed, no marks), and an
   empty note array. The parsers accept all three; the fetch logs the plain line.
4. **The note is the `auto_sum_note` entry's `data_content`** of the array `get_note` returns;
   the `high_light` entry is ignored - highlights come from the transcript's `mark_memo` block,
   which carries timestamps (`marks[].timestamp`, `marks[].mark_content`).
5. **`get_file` is not used.** The recording's title, start and duration come from `list_files`;
   `fetchRecording` finds its recording by paging `list_files` (cap ten pages), and an id no page
   carries is `not_found`.
6. **A recording without a transcript fails the fetch and writes nothing** - the log reads
   `no transcript yet for <id>, nothing written`, the job settles `failed`, and the person tries
   again once Plaud has transcribed it. A file with an empty `## Transkript` would only mislead
   the `/plaud` skill.
7. **Error classification:** an `isError` text matching `/401|not authenticated/i` is
   `unauthenticated`, `/404|not found/i` is `not_found`, everything else `unreachable` - the MCP
   answers `500 Internal Server Error` for an unknown id (plaud-shared's documented quirk), and
   the job log carries that text verbatim. A spawn `error`, a timeout, a malformed frame or a
   child that exits mid-session are `unreachable` too.
8. **The MCP's stderr is discarded** (`stdio: ["pipe", "pipe", "ignore"]`): it is the server's
   own pino JSON log, one line per call, and nothing in it is for Bench.
9. **The Eingang component is `AufnahmenPanel`** (Aufgaben already has a `PlaudPanel`); the test
   file follows. Its section is a landmark: `<section aria-labelledby="eingang-aufnahmen">` with
   `<h2 id="eingang-aufnahmen">Plaud-Aufnahmen</h2>`, so e2e can scope by
   `getByRole("region", { name: "Plaud-Aufnahmen" })`.
10. **`describeSources` is unchanged**; `index.ts` prints `Plaud MCP: on | off` itself, so
    `config.test.ts` stays as it is.
11. **Fixtures:** the three fixture recordings are `fix-lampe-0901` (`Lampe für den Leuchtturm`,
    2026-09-01, `neu`), `fix-werft-0825` (`Werftbegehung`, 2026-08-25, `im_eingang` through a
    new fixture inbox file `2026-08-25_werftbegehung-transkript.md` carrying `aufnahme:`), and
    `fix-hafen-0820` (`Hafenrunde und Leuchtturm-Ausbau`, 2026-08-20, `notiz_vorhanden` through
    the aufgaben fixture note, which gains `aufnahme: fix-hafen-0820` and `projekt: leuchtturm`).
    The bundled listing `server/src/eingang/fixture/plaud-aufnahmen.json` is exactly a
    `list_files` reply, so the sample world runs through the same parser as the real one.
    Counts that move: the fixture inbox has four files (`routes.test.ts`), the Cockpit's Eingang
    panel reads `3 unverarbeitet` (`e2e/cockpit.spec.ts`), and the `leuchtturm` handoff shows
    `1 Plaud-Notiz seit Handoff` in the sample world (its `updated` is 2020-01-01, the note is
    dated 2026-08-20).
12. **`JobPlan`'s internal variant carries `args`**, and every `RunnerInternals` function takes
    `(log, args)`. `plaud-fetch` is internal with a 5-minute timeout; like the other two
    internal kinds it cannot be cancelled (`canCancel` false in the web).
13. **The id fence is `^[A-Za-z0-9_-]{1,64}$`** (real ids are 32 characters of that class), one
    key only, refused with `recording already local: <id>` when the id sits in any of the three
    folders.
14. **`JobPaths` gains `projektSlugs: () => string[]`** (the fence for `projekt`, and
    `GET /api/eingang/projekte`); `EingangContext` gains `mcp: PlaudCommand`; `ProjekteContext`
    gains `notizenDir: string | null`; `projektStand` takes it as a third parameter. The test
    harnesses (`server/test/eingang/routes.test.ts`'s contexts, `server/test/projekte/app.ts`'s
    `emptyProjekte` and `buildSampleContext`) gain the new fields.
15. **Badge wording:** `1 Plaud-Notiz seit Handoff` / `<n> Plaud-Notizen seit Handoff`, after the
    open-tasks hint and before the missing-repo lines, in `web/src/projekte/stand.ts`'s
    `standHints` and `web/src/home/types.ts`'s `handoffHints` alike.
16. **Job labels:** `Holen: <id>` for `plaud-fetch`; `Verarbeiten: <file> (<slug>)` for a
    `plaud-process` started with a project, `Verarbeiten: <file>` without.
17. **The listing loads with the page and after `Neu laden`**, and again right after a
    `plaud-fetch` start (to show `Wird geholt`); it is not polled. `Mehr laden` appends the next
    page. A finished fetch shows up on the next `Neu laden`, the way the Jobs table shows a
    finished job on the next action.
18. **SDD workspace:** `.superpowers/sdd/PLAN-plaud-mcp/` (the symlink `.superpowers/sdd/PLAN`
    already points there); ledger first line names this plan file.

---

### Task 0: Setup

Controller work, no subagent: branch `plaud-mcp` exists at f0ed1d3 with the spec; this plan is
committed as `docs: the Plaud-MCP plan`; the workspace holds `probe-report.md` and the ledger is
initialised at `.superpowers/sdd/PLAN-plaud-mcp/progress.md`, first line naming this file.

---

### Task 1: The stdio client and the fake MCP

**Files:**

- Create: `server/src/eingang/plaud-mcp.ts`, `server/src/eingang/fixture/fake-plaud-mcp.mjs`,
  `server/src/eingang/fixture/plaud-aufnahmen.json`
- Test: `server/test/eingang/plaud-mcp.test.ts`

**Interfaces:**

- Produces:

```ts
export type PlaudFailure = "off" | "unauthenticated" | "unreachable" | "not_found";
export class PlaudError extends Error {
  constructor(public readonly kind: PlaudFailure, message: string);
}
/** One tool call inside an open session; resolves to the joined text content of the result. */
export type PlaudCall = (tool: string, args: Record<string, unknown>) => Promise<string>;
/** argv of the MCP server, or "off" - the sample world and BENCH_PLAUD=off never spawn. */
export type PlaudCommand = readonly string[] | "off";
export const REAL_PLAUD_COMMAND: PlaudCommand = ["npx", "-y", "@plaud-ai/mcp@latest"];
export interface PlaudTimeouts { callMs: number; sessionMs: number }
export const PLAUD_TIMEOUTS: PlaudTimeouts = { callMs: 30_000, sessionMs: 120_000 };
export function classifyFailure(message: string): PlaudFailure;
export function withPlaud<T>(
  command: PlaudCommand,
  fn: (call: PlaudCall) => Promise<T>,
  timeouts?: PlaudTimeouts,
): Promise<T>;
```

- Consumes: nothing from Bench. Node `child_process.spawn` and `readline.createInterface`.

- [ ] **Step 1: The fixture listing.** `server/src/eingang/fixture/plaud-aufnahmen.json`, exactly
      a `list_files` reply (the sample route and the fake MCP both read it):

```json
{
  "type": "list",
  "data": [
    {
      "id": "fix-lampe-0901",
      "name": "Lampe für den Leuchtturm",
      "created_at": "2026-09-01T09:02:11",
      "serial_number": "FIXTURE00000001",
      "start_at": "2026-09-01T09:00:00",
      "duration": 1523000
    },
    {
      "id": "fix-werft-0825",
      "name": "Werftbegehung",
      "created_at": "2026-08-25T14:31:00",
      "serial_number": "FIXTURE00000001",
      "start_at": "2026-08-25T14:00:00",
      "duration": 600000
    },
    {
      "id": "fix-hafen-0820",
      "name": "Hafenrunde und Leuchtturm-Ausbau",
      "created_at": "2026-08-20T10:06:40",
      "serial_number": "FIXTURE00000001",
      "start_at": "2026-08-20T10:00:00",
      "duration": 300000
    }
  ],
  "page": 1,
  "page_size": 20
}
```

- [ ] **Step 2: The fake MCP.** `server/src/eingang/fixture/fake-plaud-mcp.mjs`, dependency-free
      like `fake-job.mjs`, the same newline-delimited JSON-RPC the real server speaks:

```js
#!/usr/bin/env node
// Stands in for @plaud-ai/mcp in tests: the same newline-delimited JSON-RPC over stdio, answering
// from the bundled listing plus three synthetic transcripts. Every shape here mirrors the probe
// report in the SDD workspace (2026-09-06): an untranscribed recording answers a bare [] for every
// block, a transcribed one without marks answers a plain "not available" line, an unknown id is a
// 500. Modes via BENCH_FAKE_PLAUD: "unauthenticated" fails every tools/call with the MCP's 401
// text, "hang" never answers a tools/call, "garbage" prints one non-JSON line first.
import { readFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

const mode = process.env.BENCH_FAKE_PLAUD;
const listing = readFileSync(
  fileURLToPath(new URL("./plaud-aufnahmen.json", import.meta.url)),
  "utf8",
);
const EMPTY_PAGE = { type: "list", data: [], page: 2, page_size: 20 };
const NOT_AVAILABLE =
  'Block "mark_memo" not available for this recording. Available blocks: transaction, outline, transaction_polish.';

const segment = (start, end, speaker, content) => ({
  content,
  end_time: end,
  start_time: start,
  speaker,
  original_speaker: speaker,
  embeddingKey: null,
});
const page = (fileId, block, segments, nextCursor, key = "segments") => ({
  file_id: fileId,
  block,
  total: segments.length,
  offset: 0,
  limit: 500,
  returned: segments.length,
  next_cursor: nextCursor,
  [key]: segments,
});
const TRANSCRIPTS = {
  "fix-lampe-0901": {
    // Two pages, so the client's cursor loop is exercised.
    "": page(
      "fix-lampe-0901",
      "transaction",
      [
        segment(
          1520,
          4100,
          "Speaker 1",
          "Die Lampe für den Turm muss bestellt werden.",
        ),
      ],
      "cursor-2",
    ),
    "cursor-2": page(
      "fix-lampe-0901",
      "transaction",
      [
        segment(
          4200,
          7900,
          "Speaker 2",
          "Ich frage morgen beim Lieferanten nach.",
        ),
      ],
      null,
    ),
  },
  "fix-werft-0825": {
    "": page(
      "fix-werft-0825",
      "transaction",
      [segment(900, 3300, "Speaker 1", "Die Werft ist bis Oktober belegt.")],
      null,
    ),
  },
  "fix-hafen-0820": {
    "": page(
      "fix-hafen-0820",
      "transaction",
      [
        segment(
          500,
          2900,
          "Speaker 1",
          "Der Ausbau folgt dem Plan aus dem Frühjahr.",
        ),
      ],
      null,
    ),
  },
};
const MARKS = {
  "fix-lampe-0901": page(
    "fix-lampe-0901",
    "mark_memo",
    [
      {
        timestamp: 4000,
        mark_type: 1,
        mark_type_string: null,
        mark_content: "Lampe bestellen",
        content: null,
        title: null,
        mark_id: "fixmark00000001",
        mark_status: 1,
      },
    ],
    null,
    "marks",
  ),
  "fix-werft-0825": NOT_AVAILABLE,
  "fix-hafen-0820": [],
};
const NOTES = {
  "fix-lampe-0901": [
    {
      data_id: "fixnote1",
      data_type: "auto_sum_note",
      data_title: "Summary",
      data_tab_name: "Summary",
      data_content:
        "## Zusammenfassung\n\nDie Lampe für den Turm wird bestellt; der Lieferant wird morgen gefragt.",
      data_link: "",
      data_error_code: 10,
    },
    {
      data_id: "fixnote2",
      data_type: "high_light",
      data_title: "Highlights",
      data_tab_name: "Highlights",
      data_content: "- Lampe bestellen",
      data_link: "",
      data_error_code: 1,
    },
  ],
  "fix-werft-0825": [],
  "fix-hafen-0820": [],
};

const send = (msg) => process.stdout.write(`${JSON.stringify(msg)}\n`);
const answer = (id, payload, isError = false) =>
  send({
    jsonrpc: "2.0",
    id,
    result: {
      content: [
        {
          type: "text",
          text: typeof payload === "string" ? payload : JSON.stringify(payload),
        },
      ],
      isError,
    },
  });

function tool(name, args) {
  if (name === "list_files")
    return args.page === 1 || args.page === undefined ? listing : EMPTY_PAGE;
  const known = Object.hasOwn(TRANSCRIPTS, args.file_id);
  if (name === "get_transcript") {
    if (!known)
      return {
        error: `Failed to get transcript: Error: API error: 500 Internal Server Error`,
      };
    if (args.block === "mark_memo") return MARKS[args.file_id];
    return TRANSCRIPTS[args.file_id][args.cursor ?? ""] ?? [];
  }
  if (name === "get_note")
    return known
      ? NOTES[args.file_id]
      : {
          error:
            "Failed to get note: Error: API error: 500 Internal Server Error",
        };
  return { error: `Unknown tool: ${name}` };
}

if (mode === "garbage") process.stdout.write("not json at all\n");
createInterface({ input: process.stdin }).on("line", (line) => {
  const msg = JSON.parse(line);
  if (msg.id === undefined) return; // a notification
  if (msg.method === "initialize") {
    send({
      jsonrpc: "2.0",
      id: msg.id,
      result: {
        protocolVersion: "2025-06-18",
        capabilities: { tools: { listChanged: true } },
        serverInfo: { name: "fake-plaud", version: "0.0.0" },
      },
    });
    return;
  }
  if (msg.method !== "tools/call") {
    send({
      jsonrpc: "2.0",
      id: msg.id,
      error: { code: -32601, message: "Method not found" },
    });
    return;
  }
  if (mode === "hang") return;
  if (mode === "unauthenticated") {
    answer(msg.id, "Error: 401 Not authenticated", true);
    return;
  }
  const result = tool(msg.params.name, msg.params.arguments ?? {});
  if (
    result !== null &&
    typeof result === "object" &&
    "error" in result &&
    !Array.isArray(result)
  )
    answer(msg.id, result.error, true);
  else answer(msg.id, result);
});
```

- [ ] **Step 3: Failing tests.** `server/test/eingang/plaud-mcp.test.ts`:

```ts
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  classifyFailure,
  PlaudError,
  withPlaud,
  type PlaudCommand,
} from "../../src/eingang/plaud-mcp.js";

const FAKE: PlaudCommand = [
  process.execPath,
  fileURLToPath(
    new URL("../../src/eingang/fixture/fake-plaud-mcp.mjs", import.meta.url),
  ),
];
const FAST = { callMs: 500, sessionMs: 5_000 };

/** The PlaudError a withPlaud rejection carries, or a loud failure if it resolved or threw something else. */
async function failureOf(promise: Promise<unknown>): Promise<PlaudError> {
  try {
    await promise;
  } catch (err) {
    if (err instanceof PlaudError) return err;
    throw err;
  }
  throw new Error("expected withPlaud to reject");
}

describe("classifyFailure", () => {
  it("maps the MCP's texts to the four kinds", () => {
    expect(classifyFailure("Error: 401 Not authenticated")).toBe(
      "unauthenticated",
    );
    expect(classifyFailure("Failed: 404 not found")).toBe("not_found");
    expect(
      classifyFailure(
        "Failed to get file: Error: API error: 500 Internal Server Error",
      ),
    ).toBe("unreachable");
  });
});

describe("withPlaud", () => {
  it("performs the handshake and returns a tool call's text content", async () => {
    const text = await withPlaud(
      FAKE,
      (call) => call("list_files", { page: 1, page_size: 20 }),
      FAST,
    );
    const parsed = JSON.parse(text) as { data: { id: string }[] };
    expect(parsed.data.map((r) => r.id)).toEqual([
      "fix-lampe-0901",
      "fix-werft-0825",
      "fix-hafen-0820",
    ]);
  });

  it("rejects an isError result as a PlaudError of the classified kind", async () => {
    process.env.BENCH_FAKE_PLAUD = "unauthenticated";
    try {
      const err = await failureOf(
        withPlaud(FAKE, (call) => call("list_files", {}), FAST),
      );
      expect(err.kind).toBe("unauthenticated");
    } finally {
      delete process.env.BENCH_FAKE_PLAUD;
    }
  });

  it("times out a call the server never answers, as unreachable", async () => {
    process.env.BENCH_FAKE_PLAUD = "hang";
    try {
      const err = await failureOf(
        withPlaud(FAKE, (call) => call("get_note", { file_id: "x" }), FAST),
      );
      expect(err.kind).toBe("unreachable");
      expect(err.message).toContain("timed out");
    } finally {
      delete process.env.BENCH_FAKE_PLAUD;
    }
  });

  it("is unreachable on a non-JSON frame", async () => {
    process.env.BENCH_FAKE_PLAUD = "garbage";
    try {
      const err = await failureOf(
        withPlaud(FAKE, (call) => call("list_files", {}), FAST),
      );
      expect(err.kind).toBe("unreachable");
      expect(err.message).toContain("malformed frame");
    } finally {
      delete process.env.BENCH_FAKE_PLAUD;
    }
  });

  it("is unreachable when the binary does not exist, without throwing out of the process", async () => {
    const err = await failureOf(
      withPlaud(
        ["/nonexistent/plaud-mcp"],
        (call) => call("list_files", {}),
        FAST,
      ),
    );
    expect(err.kind).toBe("unreachable");
  });

  it("is off without spawning anything", async () => {
    const err = await failureOf(
      withPlaud("off", () => Promise.resolve("never"), FAST),
    );
    expect(err.kind).toBe("off");
  });

  it("rethrows a non-Plaud error from fn and still returns", async () => {
    await expect(
      withPlaud(FAKE, () => Promise.reject(new Error("mine")), FAST),
    ).rejects.toThrow("mine");
  });
});
```

- [ ] **Step 4: Run, expect failure.** `cd server && npx vitest run test/eingang/plaud-mcp.test.ts`
      -> cannot resolve `../../src/eingang/plaud-mcp.js`.
- [ ] **Step 5: Implement `server/src/eingang/plaud-mcp.ts`.**

```ts
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

export type PlaudFailure =
  "off" | "unauthenticated" | "unreachable" | "not_found";

/** Every way the MCP can fail Bench, typed so a route answers a `source` instead of a 500. */
export class PlaudError extends Error {
  constructor(
    public readonly kind: PlaudFailure,
    message: string,
  ) {
    super(message);
  }
}

/** One tool call inside an open session; resolves to the joined text content of the result. */
export type PlaudCall = (
  tool: string,
  args: Record<string, unknown>,
) => Promise<string>;

/** argv of the MCP server, or "off" - the sample world and BENCH_PLAUD=off never spawn anything. */
export type PlaudCommand = readonly string[] | "off";

export const REAL_PLAUD_COMMAND: PlaudCommand = [
  "npx",
  "-y",
  "@plaud-ai/mcp@latest",
];

export interface PlaudTimeouts {
  callMs: number;
  sessionMs: number;
}

export const PLAUD_TIMEOUTS: PlaudTimeouts = {
  callMs: 30_000,
  sessionMs: 120_000,
};

const PROTOCOL_VERSION = "2025-06-18";

interface RpcReply {
  id?: unknown;
  result?: unknown;
  error?: { message?: unknown };
}

interface ToolResult {
  content?: { type?: unknown; text?: unknown }[];
  isError?: unknown;
}

interface Pending {
  resolve: (value: unknown) => void;
  reject: (error: PlaudError) => void;
  timer: NodeJS.Timeout;
}

/**
 * The MCP reports an unknown id as a 500, not a 404 (plaud-shared's documented quirk), so only a
 * 401 and an explicit 404 are told apart; everything else is "unreachable" and the caller's log
 * carries the text.
 */
export function classifyFailure(message: string): PlaudFailure {
  if (/401|not authenticated/i.test(message)) return "unauthenticated";
  if (/404|not found/i.test(message)) return "not_found";
  return "unreachable";
}

function textOf(result: unknown): string {
  const content = (result as ToolResult).content ?? [];
  return content
    .filter((c) => c.type === "text" && typeof c.text === "string")
    .map((c) => c.text as string)
    .join("\n");
}

interface Session {
  request(method: string, params: unknown): Promise<unknown>;
  notify(method: string): void;
  fail(error: PlaudError): void;
  close(): void;
}

function openSession(command: readonly string[], callMs: number): Session {
  const [bin, ...args] = command;
  // stderr is the MCP's own pino log stream, one JSON line per tool call - nothing for Bench.
  const child = spawn(bin, args, { stdio: ["pipe", "pipe", "ignore"] });
  const pending = new Map<number, Pending>();
  let nextId = 1;
  let failure: PlaudError | null = null;

  const fail = (error: PlaudError): void => {
    failure ??= error;
    for (const p of pending.values()) {
      clearTimeout(p.timer);
      p.reject(error);
    }
    pending.clear();
  };
  child.on("error", (err) => {
    fail(new PlaudError("unreachable", err.message));
  });
  child.on("close", () => {
    fail(new PlaudError("unreachable", "plaud mcp exited"));
  });
  // Writing to a child that already died raises EPIPE on stdin - an uncaught exception without this.
  child.stdin.on("error", (err) => {
    fail(new PlaudError("unreachable", err.message));
  });

  const lines = createInterface({ input: child.stdout });
  lines.on("line", (line) => {
    let reply: RpcReply;
    try {
      reply = JSON.parse(line) as RpcReply;
    } catch {
      fail(
        new PlaudError("unreachable", `malformed frame: ${line.slice(0, 200)}`),
      );
      return;
    }
    // A server-initiated notification carries no id; nothing here needs one.
    if (typeof reply.id !== "number") return;
    const p = pending.get(reply.id);
    if (!p) return;
    pending.delete(reply.id);
    clearTimeout(p.timer);
    if (reply.error) {
      const message =
        typeof reply.error.message === "string"
          ? reply.error.message
          : "rpc error";
      p.reject(new PlaudError(classifyFailure(message), message));
    } else p.resolve(reply.result);
  });

  const request = (method: string, params: unknown): Promise<unknown> =>
    new Promise((resolve, reject) => {
      if (failure) {
        reject(failure);
        return;
      }
      const id = nextId++;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(
          new PlaudError(
            "unreachable",
            `${method} timed out after ${String(callMs)}ms`,
          ),
        );
      }, callMs);
      pending.set(id, { resolve, reject, timer });
      child.stdin.write(
        `${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`,
      );
    });
  const notify = (method: string): void => {
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method })}\n`);
  };
  const close = (): void => {
    lines.close();
    child.kill();
  };
  return { request, notify, fail, close };
}

/**
 * Spawns the MCP, performs the JSON-RPC handshake, hands `fn` a `call`, and kills the child once
 * `fn` settles - one process per listing or fetch, the way `gh` runs per call. Every failure
 * surfaces as a PlaudError: a route maps its `kind` to a `source`, a job writes its message to
 * the log.
 */
export async function withPlaud<T>(
  command: PlaudCommand,
  fn: (call: PlaudCall) => Promise<T>,
  timeouts: PlaudTimeouts = PLAUD_TIMEOUTS,
): Promise<T> {
  if (command === "off") throw new PlaudError("off", "plaud mcp is off");
  const session = openSession(command, timeouts.callMs);
  const sessionTimer = setTimeout(() => {
    session.fail(new PlaudError("unreachable", "plaud mcp session timed out"));
    session.close();
  }, timeouts.sessionMs);
  const call: PlaudCall = async (tool, args) => {
    const result = await session.request("tools/call", {
      name: tool,
      arguments: args,
    });
    const text = textOf(result);
    if ((result as ToolResult).isError === true)
      throw new PlaudError(classifyFailure(text), text.slice(0, 200));
    return text;
  };
  try {
    await session.request("initialize", {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "bench", version: "1.0.0" },
    });
    session.notify("notifications/initialized");
    return await fn(call);
  } finally {
    clearTimeout(sessionTimer);
    session.close();
  }
}
```

- [ ] **Step 6: Run, expect pass.** The hang test takes ~0.5 s; the missing-binary test relies on
      the `error` listener, so watch that the process itself survives (the file's later tests
      running is the evidence, the `runner.test.ts` pattern).
- [ ] **Step 7: Full gate** (`npm run format`, `npm run check`; no e2e - server only, no fixture
      the suite reads yet). `knip` treats the `.mjs` fixture like `fake-job.mjs`; the JSON is
      read through `readFileSync`, not imported.
- [ ] **Step 8: Commit** - `feat: a stdio client for the Plaud MCP`

---

### Task 2: Recordings, transcript pages and the fetched file

**Files:**

- Create: `server/src/eingang/plaud-fetch.ts`
- Test: `server/test/eingang/plaud-fetch.test.ts`

**Interfaces:**

- Consumes: `PlaudCall`, `PlaudError` (Task 1).
- Produces:

```ts
export interface Recording {
  id: string;
  titel: string; // list_files name, "Ohne Titel" when empty
  start: string; // list_files start_at as given, "YYYY-MM-DDTHH:MM:SS", local
  dauer: number; // milliseconds
}
export interface RecordingPage {
  recordings: Recording[];
  nextPage: number | null;
}
export interface Segment {
  start: number; // ms
  end: number; // ms
  speaker: string;
  text: string;
}
export interface Mark {
  at: number; // ms
  text: string;
}
export interface FetchedRecording {
  recording: Recording;
  segments: Segment[];
  marks: Mark[];
  note: string | null;
}
export const PAGE_SIZE = 20;
export function parseListFiles(text: string, page: number): RecordingPage;
export function parseTranscriptPage(text: string): {
  segments: Segment[];
  nextCursor: string | null;
};
export function parseMarks(text: string): Mark[];
export function parseNote(text: string): string | null;
export function listRecordings(
  call: PlaudCall,
  page: number,
): Promise<RecordingPage>;
export function findRecording(call: PlaudCall, id: string): Promise<Recording>;
export function fetchRecording(
  call: PlaudCall,
  recording: Recording,
  log: (line: string) => void,
): Promise<FetchedRecording>;
export function slugify(title: string): string;
export function dauerText(ms: number): string; // "1h05m", "5m23s", "23s"
export function zeitText(ms: number): string; // "HH:MM:SS"
export function fetchedFileName(
  recording: Recording,
  taken: (name: string) => boolean,
): string;
export function renderFetchedFile(
  fetched: FetchedRecording,
  geholt: string,
): string;
```

- [ ] **Step 1: Failing tests.** Every parser against the fake MCP's exact payload shapes (copy
      the objects from `fake-plaud-mcp.mjs` as literals, JSON-stringified in the test), the three
      "nothing here" answers, and the pure helpers:

```ts
import { describe, expect, it } from "vitest";
import {
  dauerText,
  fetchedFileName,
  fetchRecording,
  parseListFiles,
  parseMarks,
  parseNote,
  parseTranscriptPage,
  renderFetchedFile,
  slugify,
  zeitText,
  type FetchedRecording,
  type Recording,
} from "../../src/eingang/plaud-fetch.js";
import type { PlaudCall } from "../../src/eingang/plaud-mcp.js";

const lampe: Recording = {
  id: "fix-lampe-0901",
  titel: "Lampe für den Leuchtturm",
  start: "2026-09-01T09:00:00",
  dauer: 1523000,
};

describe("parseListFiles", () => {
  it("maps data entries to recordings and pages by a full page", () => {
    const entry = (i: number) => ({
      id: `id${String(i)}`,
      name: `N${String(i)}`,
      created_at: "2026-09-01T09:02:11",
      serial_number: "S",
      start_at: "2026-09-01T09:00:00",
      duration: 1000,
    });
    const full = JSON.stringify({
      type: "list",
      data: Array.from({ length: 20 }, (_, i) => entry(i)),
      page: 1,
      page_size: 20,
    });
    expect(parseListFiles(full, 1).nextPage).toBe(2);
    const short = JSON.stringify({
      type: "list",
      data: [entry(1)],
      page: 2,
      page_size: 20,
    });
    const page = parseListFiles(short, 2);
    expect(page.nextPage).toBeNull();
    expect(page.recordings).toEqual([
      { id: "id1", titel: "N1", start: "2026-09-01T09:00:00", dauer: 1000 },
    ]);
  });
  it("names an untitled recording Ohne Titel and skips an entry without an id", () => {
    const text = JSON.stringify({
      type: "list",
      data: [
        { id: "a", name: "", start_at: "2026-09-01T09:00:00", duration: 5 },
        { name: "no id" },
      ],
      page: 1,
      page_size: 20,
    });
    expect(parseListFiles(text, 1).recordings.map((r) => r.titel)).toEqual([
      "Ohne Titel",
    ]);
  });
});

describe("parseTranscriptPage / parseMarks / parseNote", () => {
  it("reads segments, the cursor, marks and the auto_sum_note", () => {
    const page = JSON.stringify({
      file_id: "x",
      block: "transaction",
      total: 1,
      offset: 0,
      limit: 500,
      returned: 1,
      next_cursor: "c2",
      segments: [
        {
          content: "Hallo",
          end_time: 4100,
          start_time: 1520,
          speaker: "Speaker 1",
          original_speaker: "Speaker 1",
          embeddingKey: null,
        },
      ],
    });
    expect(parseTranscriptPage(page)).toEqual({
      segments: [
        { start: 1520, end: 4100, speaker: "Speaker 1", text: "Hallo" },
      ],
      nextCursor: "c2",
    });
    const marks = JSON.stringify({
      file_id: "x",
      block: "mark_memo",
      total: 1,
      offset: 0,
      limit: 500,
      returned: 1,
      next_cursor: null,
      marks: [
        {
          timestamp: 4000,
          mark_type: 1,
          mark_content: "Lampe bestellen",
          content: null,
          title: null,
          mark_id: "m",
        },
      ],
    });
    expect(parseMarks(marks)).toEqual([{ at: 4000, text: "Lampe bestellen" }]);
    const note = JSON.stringify([
      { data_type: "high_light", data_content: "- x" },
      {
        data_type: "auto_sum_note",
        data_content: "## Zusammenfassung\n\nText.",
      },
    ]);
    expect(parseNote(note)).toBe("## Zusammenfassung\n\nText.");
  });
  it("treats a bare [], the not-available line and an empty note array as nothing", () => {
    expect(parseTranscriptPage("[]")).toEqual({
      segments: [],
      nextCursor: null,
    });
    expect(parseMarks("[]")).toEqual([]);
    expect(
      parseMarks(
        'Block "mark_memo" not available for this recording. Available blocks: transaction.',
      ),
    ).toEqual([]);
    expect(parseNote("[]")).toBeNull();
  });
});

describe("fetchRecording", () => {
  it("follows next_cursor, fetches marks and the note, and logs each call", async () => {
    const calls: string[] = [];
    const call: PlaudCall = (tool, args) => {
      calls.push(`${tool} ${JSON.stringify(args)}`);
      if (tool === "get_note")
        return Promise.resolve(
          JSON.stringify([
            { data_type: "auto_sum_note", data_content: "Note" },
          ]),
        );
      if (args.block === "mark_memo") return Promise.resolve("[]");
      const cursor = args.cursor;
      return Promise.resolve(
        JSON.stringify({
          next_cursor: cursor === undefined ? "c2" : null,
          segments: [
            {
              content: cursor === undefined ? "a" : "b",
              start_time: 0,
              end_time: 1,
              speaker: "S",
            },
          ],
        }),
      );
    };
    const log: string[] = [];
    const fetched = await fetchRecording(call, lampe, (l) => log.push(l));
    expect(fetched.segments.map((s) => s.text)).toEqual(["a", "b"]);
    expect(fetched.note).toBe("Note");
    expect(calls[0]).toBe(
      'get_transcript {"file_id":"fix-lampe-0901","block":"transaction","limit":500}',
    );
    expect(calls[1]).toContain('"cursor":"c2"');
    expect(
      calls.some(
        (c) => c.startsWith("get_transcript") && c.includes("mark_memo"),
      ),
    ).toBe(true);
    expect(calls.some((c) => c.startsWith("get_note"))).toBe(true);
    expect(log.length).toBeGreaterThanOrEqual(3);
  });
});

describe("naming and rendering", () => {
  it("slugifies German titles to ascii, capped at 60", () => {
    expect(slugify("Lampe für den Leuchtturm")).toBe(
      "lampe-fuer-den-leuchtturm",
    );
    expect(slugify("  Übergabe: Q4 / 2026!  ")).toBe("uebergabe-q4-2026");
    expect(slugify("")).toBe("aufnahme");
    expect(slugify("x".repeat(80))).toHaveLength(60);
  });
  it("formats durations and times", () => {
    expect(dauerText(23_000)).toBe("23s");
    expect(dauerText(323_000)).toBe("5m23s");
    expect(dauerText(3_900_000)).toBe("1h05m");
    expect(zeitText(4100)).toBe("00:00:04");
    expect(zeitText(3_661_000)).toBe("01:01:01");
  });
  it("names the file by day and slug, with a numeric suffix on collision", () => {
    expect(fetchedFileName(lampe, () => false)).toBe(
      "2026-09-01_lampe-fuer-den-leuchtturm-transkript.md",
    );
    const taken = new Set([
      "2026-09-01_lampe-fuer-den-leuchtturm-transkript.md",
      "2026-09-01_lampe-fuer-den-leuchtturm-2-transkript.md",
    ]);
    expect(fetchedFileName(lampe, (n) => taken.has(n))).toBe(
      "2026-09-01_lampe-fuer-den-leuchtturm-3-transkript.md",
    );
  });
  it("renders frontmatter and the three sections, with Keine. for absent marks and note", () => {
    const fetched: FetchedRecording = {
      recording: lampe,
      segments: [
        { start: 1520, end: 4100, speaker: "Speaker 1", text: "Hallo" },
      ],
      marks: [],
      note: null,
    };
    const text = renderFetchedFile(fetched, "2026-09-06");
    expect(
      text.startsWith(
        "---\naufnahme: fix-lampe-0901\ntitel: Lampe für den Leuchtturm\ndatum: 2026-09-01\nstart: 2026-09-01T09:00:00\ndauer: 25m23s\ngeholt: 2026-09-06\n---\n",
      ),
    ).toBe(true);
    expect(text).toContain(
      "# Lampe für den Leuchtturm\n\n## Transkript\n\n[00:00:01 - 00:00:04] Speaker 1: Hallo\n",
    );
    expect(text).toContain("## Markierungen\n\nKeine.\n");
    expect(text).toContain("## KI-Notiz (Plaud)\n\nKeine.\n");
    const withAll = renderFetchedFile(
      {
        ...fetched,
        marks: [{ at: 4000, text: "Lampe bestellen" }],
        note: "## Zusammenfassung\n\nText.",
      },
      "2026-09-06",
    );
    expect(withAll).toContain(
      "## Markierungen\n\n- [00:00:04] Lampe bestellen\n",
    );
    expect(withAll).toContain(
      "## KI-Notiz (Plaud)\n\n## Zusammenfassung\n\nText.\n",
    );
  });
});
```

- [ ] **Step 2: Run, expect failure** (module missing).
- [ ] **Step 3: Implement `server/src/eingang/plaud-fetch.ts`.** Parsers narrow `unknown` by hand
      (no `any`): a helper `asRecord(v): Record<string, unknown> | null`, and `jsonOf(text):
unknown` returning `null` for non-JSON, which is how the plain "not available" line becomes
      "nothing":

```ts
import type { PlaudCall } from "./plaud-mcp.js";
import { PlaudError } from "./plaud-mcp.js";

export const PAGE_SIZE = 20;
const TRANSCRIPT_LIMIT = 500;
const FIND_PAGES = 10;
const SLUG_MAX = 60;
const UNTITLED = "Ohne Titel";

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** null for the plain-text answers the MCP gives for an absent block - see the probe report. */
function jsonOf(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function toRecording(value: unknown): Recording | null {
  const r = asRecord(value);
  if (r === null || typeof r.id !== "string" || r.id === "") return null;
  const name = typeof r.name === "string" ? r.name.trim() : "";
  return {
    id: r.id,
    titel: name === "" ? UNTITLED : name,
    start: typeof r.start_at === "string" ? r.start_at : "",
    dauer: typeof r.duration === "number" ? r.duration : 0,
  };
}

export function parseListFiles(text: string, page: number): RecordingPage {
  const reply = asRecord(jsonOf(text));
  const data = Array.isArray(reply?.data) ? reply.data : [];
  const recordings = data.flatMap((entry) => toRecording(entry) ?? []);
  return { recordings, nextPage: data.length === PAGE_SIZE ? page + 1 : null };
}

function toSegment(value: unknown): Segment | null {
  const s = asRecord(value);
  if (
    s === null ||
    typeof s.start_time !== "number" ||
    typeof s.end_time !== "number"
  )
    return null;
  return {
    start: s.start_time,
    end: s.end_time,
    speaker: typeof s.speaker === "string" ? s.speaker : "Sprecher",
    text: typeof s.content === "string" ? s.content : "",
  };
}

export function parseTranscriptPage(text: string): {
  segments: Segment[];
  nextCursor: string | null;
} {
  const page = asRecord(jsonOf(text));
  const raw = Array.isArray(page?.segments) ? page.segments : [];
  return {
    segments: raw.flatMap((s) => toSegment(s) ?? []),
    nextCursor: typeof page?.next_cursor === "string" ? page.next_cursor : null,
  };
}

export function parseMarks(text: string): Mark[] {
  const page = asRecord(jsonOf(text));
  const raw = Array.isArray(page?.marks) ? page.marks : [];
  return raw.flatMap((m) => {
    const mark = asRecord(m);
    return mark !== null && typeof mark.timestamp === "number"
      ? [
          {
            at: mark.timestamp,
            text:
              typeof mark.mark_content === "string" ? mark.mark_content : "",
          },
        ]
      : [];
  });
}

export function parseNote(text: string): string | null {
  const entries = jsonOf(text);
  if (!Array.isArray(entries)) return null;
  const summary = entries
    .map(asRecord)
    .find((e) => e?.data_type === "auto_sum_note");
  return summary !== undefined &&
    typeof summary?.data_content === "string" &&
    summary.data_content !== ""
    ? summary.data_content
    : null;
}

export async function listRecordings(
  call: PlaudCall,
  page: number,
): Promise<RecordingPage> {
  return parseListFiles(
    await call("list_files", { page, page_size: PAGE_SIZE }),
    page,
  );
}

/** The listing is the only place a recording's title, start and duration come from (decision 5). */
export async function findRecording(
  call: PlaudCall,
  id: string,
): Promise<Recording> {
  for (let page = 1; page <= FIND_PAGES; page += 1) {
    const { recordings, nextPage } = await listRecordings(call, page);
    const hit = recordings.find((r) => r.id === id);
    if (hit) return hit;
    if (nextPage === null) break;
  }
  throw new PlaudError("not_found", `no recording with id ${id}`);
}

async function allSegments(
  call: PlaudCall,
  id: string,
  log: (line: string) => void,
): Promise<Segment[]> {
  const segments: Segment[] = [];
  let cursor: string | null = null;
  do {
    const args: Record<string, unknown> = {
      file_id: id,
      block: "transaction",
      limit: TRANSCRIPT_LIMIT,
    };
    const page = parseTranscriptPage(
      await call(
        "get_transcript",
        cursor === null ? args : { ...args, cursor },
      ),
    );
    log(`get_transcript ${id}: ${String(page.segments.length)} segments`);
    segments.push(...page.segments);
    cursor = page.nextCursor;
  } while (cursor !== null);
  return segments;
}

export async function fetchRecording(
  call: PlaudCall,
  recording: Recording,
  log: (line: string) => void,
): Promise<FetchedRecording> {
  const segments = await allSegments(call, recording.id, log);
  const marksText = await call("get_transcript", {
    file_id: recording.id,
    block: "mark_memo",
  });
  const marks = parseMarks(marksText);
  log(
    jsonOf(marksText) === null
      ? `get_transcript mark_memo: ${marksText.slice(0, 120)}`
      : `get_transcript mark_memo: ${String(marks.length)} marks`,
  );
  const note = parseNote(await call("get_note", { file_id: recording.id }));
  log(
    `get_note ${recording.id}: ${note === null ? "none" : `${String(note.length)} chars`}`,
  );
  return { recording, segments, marks, note };
}

const UMLAUTS: [RegExp, string][] = [
  [/ä/g, "ae"],
  [/ö/g, "oe"],
  [/ü/g, "ue"],
  [/ß/g, "ss"],
];

export function slugify(title: string): string {
  const lowered = UMLAUTS.reduce(
    (s, [re, to]) => s.replace(re, to),
    title.toLowerCase(),
  );
  const slug = lowered
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX)
    .replace(/-+$/g, "");
  return slug === "" ? "aufnahme" : slug;
}

export function dauerText(ms: number): string {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${String(h)}h${String(m).padStart(2, "0")}m`;
  if (m > 0) return `${String(m)}m${String(s).padStart(2, "0")}s`;
  return `${String(s)}s`;
}

export function zeitText(ms: number): string {
  const total = Math.floor(ms / 1000);
  const two = (n: number) => String(n).padStart(2, "0");
  return `${two(Math.floor(total / 3600))}:${two(Math.floor((total % 3600) / 60))}:${two(total % 60)}`;
}

export function fetchedFileName(
  recording: Recording,
  taken: (name: string) => boolean,
): string {
  const day = recording.start.slice(0, 10);
  const base = `${day}_${slugify(recording.titel)}`;
  const first = `${base}-transkript.md`;
  if (!taken(first)) return first;
  for (let n = 2; ; n += 1) {
    const candidate = `${base}-${String(n)}-transkript.md`;
    if (!taken(candidate)) return candidate;
  }
}

export function renderFetchedFile(
  fetched: FetchedRecording,
  geholt: string,
): string {
  const { recording, segments, marks, note } = fetched;
  const transcript = segments
    .map(
      (s) =>
        `[${zeitText(s.start)} - ${zeitText(s.end)}] ${s.speaker}: ${s.text}`,
    )
    .join("\n");
  const marksText =
    marks.length === 0
      ? "Keine."
      : marks.map((m) => `- [${zeitText(m.at)}] ${m.text}`).join("\n");
  return [
    "---",
    `aufnahme: ${recording.id}`,
    `titel: ${recording.titel}`,
    `datum: ${recording.start.slice(0, 10)}`,
    `start: ${recording.start}`,
    `dauer: ${dauerText(recording.dauer)}`,
    `geholt: ${geholt}`,
    "---",
    "",
    `# ${recording.titel}`,
    "",
    "## Transkript",
    "",
    transcript,
    "",
    "## Markierungen",
    "",
    marksText,
    "",
    "## KI-Notiz (Plaud)",
    "",
    note ?? "Keine.",
    "",
  ].join("\n");
}
```

- [ ] **Step 4: Run, expect pass.** Then `cd server && npx vitest run test/eingang` for the
      whole app.
- [ ] **Step 5: Full gate; Commit** - `feat: parse Plaud recordings and render the fetched file`

---

### Task 3: Local ids, the write and the fetch run

**Files:**

- Modify: `server/src/eingang/inbox.ts` (append), `server/src/eingang/plaud-fetch.ts` (append),
  `server/src/eingang/jobs.ts` (export `resolvesInsideFolder` only - the rest of jobs.ts is
  Task 4)
- Test: `server/test/eingang/inbox.test.ts` (extend), `server/test/eingang/plaud-fetch.test.ts`
  (extend)

**Interfaces:**

- Consumes: `withPlaud`, `PlaudCommand`, `PlaudError` (Task 1); `findRecording`,
  `fetchRecording`, `fetchedFileName`, `renderFetchedFile` (Task 2).
- Produces, in `inbox.ts`:

```ts
/** `key`'s value from a note's frontmatter, scanned line by line - null without frontmatter or key. */
export function frontmatterValue(text: string, key: string): string | null;
export interface LocalIds {
  inbox: Set<string>;
  archiv: Set<string>;
  notizen: Set<string>;
}
/** The `aufnahme:` ids every `.md` directly inside the three folders carries; a missing folder contributes nothing. */
export function localRecordingIds(dirs: {
  inboxDir: string;
  archivDir: string;
  notizenDir: string;
}): LocalIds;
export function isLocal(id: string, local: LocalIds): boolean;
export type RecordingStatus =
  "neu" | "wird_geholt" | "im_eingang" | "im_archiv" | "notiz_vorhanden";
/** notizen beats archiv beats inbox beats a running fetch beats neu - listInbox's order, applied to ids. */
export function plaudStatus(
  id: string,
  local: LocalIds,
  inFlight: Set<string>,
): RecordingStatus;
```

- Produces, in `plaud-fetch.ts`:

```ts
/** Creates `<plaudHome>/inbox/<name>` with the wx flag after the realpath check; returns the path. */
export function writeFetchedFile(
  plaudHome: string,
  name: string,
  content: string,
): string;
export interface PlaudFetchDeps {
  command: PlaudCommand;
  plaudHome: string | null;
  sample: boolean;
  today: () => string; // "YYYY-MM-DD", local
}
/** The plaud-fetch internal job: under sample data it logs the three calls and writes nothing. */
export function runPlaudFetch(
  deps: PlaudFetchDeps,
  id: string,
  log: (line: string) => void,
): Promise<void>;
```

- [ ] **Step 1: Failing tests for the ids.** In `inbox.test.ts`:

```ts
describe("frontmatterValue / localRecordingIds / plaudStatus", () => {
  it("reads a key up to the first ': ' and ignores a titel with its own colon", () => {
    const text =
      "---\ntitel: 08-18 Besprechung: Q4\naufnahme: abc-1\n---\n# x\n";
    expect(frontmatterValue(text, "aufnahme")).toBe("abc-1");
    expect(frontmatterValue(text, "titel")).toBe("08-18 Besprechung: Q4");
    expect(frontmatterValue("# no frontmatter", "aufnahme")).toBeNull();
  });
  it("collects ids per folder, skipping non-md files and missing folders", () => {
    const { watch, notizenDir, archivDir } = world();
    writeInboxFile(watch, "a-transkript.md", "---\naufnahme: id-inbox\n---\n");
    writeInboxFile(watch, "b-transcript.txt", "---\naufnahme: id-txt\n---\n");
    mkdirSync(notizenDir, { recursive: true });
    writeFileSync(
      path.join(notizenDir, "n.md"),
      "---\naufnahme: id-note\n---\n",
    );
    const local = localRecordingIds({ inboxDir: watch, archivDir, notizenDir });
    expect([...local.inbox]).toEqual(["id-inbox"]);
    expect([...local.archiv]).toEqual([]);
    expect([...local.notizen]).toEqual(["id-note"]);
    expect(isLocal("id-note", local)).toBe(true);
    expect(isLocal("id-txt", local)).toBe(false);
  });
  it("reconciles in the fixed order", () => {
    const local = {
      inbox: new Set(["x", "both"]),
      archiv: new Set(["y", "both"]),
      notizen: new Set(["z", "both"]),
    };
    expect(plaudStatus("both", local, new Set())).toBe("notiz_vorhanden");
    expect(plaudStatus("y", local, new Set(["y"]))).toBe("im_archiv");
    expect(plaudStatus("x", local, new Set())).toBe("im_eingang");
    expect(plaudStatus("w", local, new Set(["w"]))).toBe("wird_geholt");
    expect(plaudStatus("w", local, new Set())).toBe("neu");
  });
});
```

- [ ] **Step 2: Implement in `inbox.ts`.** `quelleOf` becomes a one-line wrapper over
      `frontmatterValue(text, "quelle")` (keep its export and docstring - the why is unchanged);
      `localRecordingIds` reuses `fileNames`; `plaudStatus` is the four-line ladder.
- [ ] **Step 3: Failing tests for the write and the run.** In `plaud-fetch.test.ts`, with a
      `scratchDir` world per test (`tmp.js`, as `jobs.test.ts` does):

```ts
describe("writeFetchedFile", () => {
  it("creates the file under inbox and refuses to overwrite", () => {
    const home = mkWorld(); // scratch dir with inbox/
    const written = writeFetchedFile(home, "a-transkript.md", "x");
    expect(readFileSync(written, "utf8")).toBe("x");
    expect(() => writeFetchedFile(home, "a-transkript.md", "y")).toThrow(
      /EEXIST/,
    );
  });
  it("refuses an inbox that is a symlink out of plaudHome", () => {
    const home = path.join(scratch.dir, `home-${String(n)}`);
    const outside = path.join(scratch.dir, `outside-${String(n)}`);
    mkdirSync(home, { recursive: true });
    mkdirSync(outside, { recursive: true });
    symlinkSync(outside, path.join(home, "inbox"));
    expect(() => writeFetchedFile(home, "a-transkript.md", "x")).toThrow(
      /escapes/,
    );
  });
});

describe("runPlaudFetch", () => {
  it("logs the three calls and writes nothing under sample data", async () => {
    const home = mkWorld();
    const log: string[] = [];
    await runPlaudFetch(
      {
        command: "off",
        plaudHome: home,
        sample: true,
        today: () => "2026-09-06",
      },
      "fix-lampe-0901",
      (l) => log.push(l),
    );
    expect(log).toEqual([
      "list_files page 1",
      "get_transcript fix-lampe-0901",
      "get_note fix-lampe-0901",
      "sample world: nothing written",
    ]);
    expect(readdirSync(path.join(home, "inbox"))).toEqual([]);
  });
  it("fetches through the fake MCP and writes the file", async () => {
    const home = mkWorld();
    const log: string[] = [];
    await runPlaudFetch(
      {
        command: FAKE,
        plaudHome: home,
        sample: false,
        today: () => "2026-09-06",
      },
      "fix-lampe-0901",
      (l) => log.push(l),
    );
    const [name] = readdirSync(path.join(home, "inbox"));
    expect(name).toBe("2026-09-01_lampe-fuer-den-leuchtturm-transkript.md");
    const text = readFileSync(path.join(home, "inbox", name), "utf8");
    expect(text).toContain("aufnahme: fix-lampe-0901");
    expect(text).toContain("[00:00:01 - 00:00:04] Speaker 1: Die Lampe");
    expect(text).toContain("- [00:00:04] Lampe bestellen");
    expect(text).toContain("## KI-Notiz (Plaud)\n\n## Zusammenfassung");
    expect(log.at(-1)).toBe(`written ${name}`);
  });
  it("fails without writing when no page lists the id", async () => {
    const home = mkWorld();
    await expect(
      runPlaudFetch(
        {
          command: FAKE,
          plaudHome: home,
          sample: false,
          today: () => "2026-09-06",
        },
        "fix-unknown-0000",
        () => undefined,
      ),
    ).rejects.toMatchObject({ kind: "not_found" });
    expect(readdirSync(path.join(home, "inbox"))).toEqual([]);
  });
  it("refuses a null plaudHome", async () => {
    await expect(
      runPlaudFetch(
        { command: "off", plaudHome: null, sample: false, today: () => "x" },
        "a",
        () => undefined,
      ),
    ).rejects.toThrow("plaud is not configured");
  });
});

describe("assembleFetch", () => {
  it("refuses a recording without a transcript, so nothing gets written", async () => {
    // The fake MCP transcribes all three fixture recordings, so the empty case uses the same
    // hand-written PlaudCall seam fetchRecording's own test uses.
    const listing = JSON.stringify({
      type: "list",
      data: [
        {
          id: "fix-leer-0000",
          name: "Leer",
          start_at: "2026-09-02T08:00:00",
          duration: 1000,
        },
      ],
      page: 1,
      page_size: 20,
    });
    const call: PlaudCall = (tool) =>
      Promise.resolve(tool === "list_files" ? listing : "[]");
    await expect(
      assembleFetch(call, "fix-leer-0000", () => undefined),
    ).rejects.toThrow("no transcript yet for fix-leer-0000, nothing written");
  });
});
```

- [ ] **Step 4: Implement.** In `jobs.ts` add `export` to `resolvesInsideFolder` (nothing else).
      In `plaud-fetch.ts`:

```ts
import { existsSync, mkdirSync, realpathSync, writeFileSync } from "node:fs";
import path from "node:path";
import { resolvesInsideFolder } from "./jobs.js";
import { withPlaud, type PlaudCommand } from "./plaud-mcp.js";

export function writeFetchedFile(
  plaudHome: string,
  name: string,
  content: string,
): string {
  const inbox = path.join(plaudHome, "inbox");
  mkdirSync(inbox, { recursive: true });
  // The one write this app makes outside data/: inbox/ has to be a real folder inside plaudHome,
  // never a symlink pointing elsewhere - the same boundary planJob draws for a file argument.
  if (!resolvesInsideFolder(plaudHome, inbox))
    throw new Error("inbox folder escapes plaud home");
  const target = path.join(inbox, name);
  writeFileSync(target, content, { flag: "wx" });
  return target;
}

export async function assembleFetch(
  call: PlaudCall,
  id: string,
  log: (line: string) => void,
): Promise<FetchedRecording> {
  const recording = await findRecording(call, id);
  log(`list_files: found ${id} (${dauerText(recording.dauer)})`);
  const fetched = await fetchRecording(call, recording, log);
  if (fetched.segments.length === 0)
    throw new Error(`no transcript yet for ${id}, nothing written`);
  return fetched;
}

export async function runPlaudFetch(
  deps: PlaudFetchDeps,
  id: string,
  log: (line: string) => void,
): Promise<void> {
  if (deps.plaudHome === null) throw new Error("plaud is not configured");
  if (deps.sample) {
    log("list_files page 1");
    log(`get_transcript ${id}`);
    log(`get_note ${id}`);
    log("sample world: nothing written");
    return;
  }
  const home = deps.plaudHome;
  const fetched = await withPlaud(deps.command, (call) =>
    assembleFetch(call, id, log),
  );
  const taken = (name: string) =>
    existsSync(path.join(home, "inbox", name)) ||
    existsSync(path.join(home, "archiv", name));
  const name = fetchedFileName(fetched.recording, taken);
  writeFetchedFile(home, name, renderFetchedFile(fetched, deps.today()));
  log(`written ${name}`);
}
```

`resolvesInsideFolder` requires the target to exist (it realpaths both sides) - `mkdirSync`
above guarantees that; a symlinked `inbox/` exists too and resolves outside, which is the refusal.

- [ ] **Step 5: Run, expect pass; full gate; Commit** -
      `feat: reconcile recordings by id and write a fetched recording`

---

### Task 4: The fence and the runner

**Files:**

- Modify: `server/src/eingang/jobs.ts`, `server/src/eingang/runner.ts`
- Test: `server/test/eingang/jobs.test.ts` (extend), `server/test/eingang/runner.test.ts`
  (extend: `newRunner` gains `"plaud-fetch"` and one test that an internal job receives its args)

**Interfaces:**

- Consumes: `localRecordingIds`, `isLocal` (Task 3).
- Produces:

```ts
export type JobKind = ... | "plaud-fetch";
export type InternalName = "vault-reindex" | "projekte-scan" | "plaud-fetch";
export type JobPlan =
  | { kind: "spawn"; argv: string[]; cwd: string }
  | { kind: "internal"; name: InternalName; args: Record<string, unknown> };
export interface JobPaths {
  plaudHome: string | null;
  vaultDir: string;
  controllingDir: string | null;
  skillsDir: string;
  sample: boolean;
  projektSlugs: () => string[]; // the handoff slugs the vault index knows, injected by the root
}
export const JOB_TIMEOUTS_MS: Record<JobKind, number>; // "plaud-fetch": 5 * 60 * 1000
// runner.ts
type InternalJobFn = (log: (line: string) => void, args: Record<string, unknown>) => Promise<void>;
export type RunnerInternals = Record<InternalName, InternalJobFn>;
```

- [ ] **Step 1: Failing tests.** `jobs.test.ts`'s `world()` gains `projektSlugs: () => ["leuchtturm", "hafen"]`
      in its base; then:

```ts
describe("plaud-fetch", () => {
  const hostileIds = ["", "a/b", "a b", "x".repeat(65), 123, "../x"];
  for (const id of hostileIds) {
    it(`rejects id: ${JSON.stringify(id)}`, () => {
      expect(planJob("plaud-fetch", { id }, world())).toEqual({
        error: expect.any(String) as string,
      });
    });
  }
  it("rejects an extra key and a null plaudHome", () => {
    expect(planJob("plaud-fetch", { id: "abc", x: 1 }, world())).toEqual({
      error: expect.any(String) as string,
    });
    expect(
      planJob("plaud-fetch", { id: "abc" }, world({ plaudHome: null })),
    ).toEqual({ error: "plaud is not configured" });
  });
  it("rejects an id already local in inbox, archiv or notizen", () => {
    const ctx = world();
    writeFileSync(
      path.join(ctx.plaudHome!, "notizen", "n.md"),
      "---\naufnahme: abc-1\n---\n",
    );
    expect(planJob("plaud-fetch", { id: "abc-1" }, ctx)).toEqual({
      error: "recording already local: abc-1",
    });
  });
  it("plans an internal job carrying the id", () => {
    expect(planJob("plaud-fetch", { id: "abc-1" }, world())).toEqual({
      kind: "internal",
      name: "plaud-fetch",
      args: { id: "abc-1" },
    });
  });
});

describe("plaud-process with projekt", () => {
  it("accepts a known slug into the prompt and refuses an unknown or non-string one", () => {
    const ctx = world();
    writeFileSync(path.join(ctx.plaudHome!, "inbox", "a-transkript.md"), "x");
    const plan = expectSpawn(
      planJob(
        "plaud-process",
        { file: "a-transkript.md", projekt: "leuchtturm" },
        ctx,
      ),
    );
    expect(plan.argv[2]).toContain(
      "Trage projekt: leuchtturm in das Frontmatter der Notiz ein.",
    );
    expect(
      expectSpawn(planJob("plaud-process", { file: "a-transkript.md" }, ctx))
        .argv[2],
    ).not.toContain("projekt:");
    expect(
      planJob(
        "plaud-process",
        { file: "a-transkript.md", projekt: "nope" },
        ctx,
      ),
    ).toEqual({ error: "unknown projekt: nope" });
    expect(
      planJob("plaud-process", { file: "a-transkript.md", projekt: 7 }, ctx),
    ).toEqual({ error: expect.any(String) as string });
  });
});
```

And in `runner.test.ts`:

```ts
it("hands an internal job its plan args", async () => {
  let seen: Record<string, unknown> | null = null;
  const { db, runner } = newRunner({
    "plaud-fetch": (log, args) => {
      seen = args;
      log("ok");
      return Promise.resolve();
    },
  });
  const job = runner.start(
    "plaud-fetch",
    JSON.stringify({ id: "abc" }),
    { kind: "internal", name: "plaud-fetch", args: { id: "abc" } },
    {},
    JOB_TIMEOUTS_MS["plaud-fetch"],
  );
  const finished = await waitForTerminal(db, job.id);
  expect(finished.status).toBe("done");
  expect(seen).toEqual({ id: "abc" });
});
```

- [ ] **Step 2: Run, expect failure** (type errors on the new kind and fields).
- [ ] **Step 3: Implement.** `jobs.ts`:

```ts
const RECORDING_ID = /^[A-Za-z0-9_-]{1,64}$/;

function projektOf(
  args: Record<string, unknown>,
  ctx: JobPaths,
): string | null | { error: string } {
  const projekt = args.projekt;
  if (projekt === undefined) return null;
  if (typeof projekt !== "string") return { error: "projekt must be a string" };
  if (!ctx.projektSlugs().includes(projekt))
    return { error: `unknown projekt: ${projekt}` };
  return projekt;
}

function planPlaudFetch(
  args: Record<string, unknown>,
  ctx: JobPaths,
): JobPlan | { error: string } {
  const id = args.id;
  if (typeof id !== "string" || !RECORDING_ID.test(id))
    return { error: "id must be a recording id" };
  if (Object.keys(args).length !== 1)
    return { error: "plaud-fetch takes only id" };
  if (ctx.plaudHome === null) return { error: "plaud is not configured" };
  const local = localRecordingIds({
    inboxDir: path.join(ctx.plaudHome, "inbox"),
    archivDir: path.join(ctx.plaudHome, "archiv"),
    notizenDir: path.join(ctx.plaudHome, "notizen"),
  });
  if (isLocal(id, local)) return { error: `recording already local: ${id}` };
  return { kind: "internal", name: "plaud-fetch", args: { id } };
}
```

`planPlaudProcess` calls `projektOf` after the file checks and before `fakeSpawn`, returns its
error if any, and appends ` Trage projekt: ${projekt} in das Frontmatter der Notiz ein.` to the
prompt when a slug was given. `planInternal` becomes `{ kind: "internal", name, args: {} }`. The
switch gains `case "plaud-fetch": return planPlaudFetch(args, ctx);`, `JOB_KINDS` and
`JOB_TIMEOUTS_MS` the new member. `runner.ts`: `runInternal` takes `args` and calls
`internals[name](log, args)`; `start` passes `plan.args`. Note the sample world: in the sample
world `plaudHome` is the fixture dir, whose `notizen/` does not exist (the fixture note lives under
`aufgaben/fixture/notizen`), so the fence's local check there only sees `inbox/` - which is where
the fixture's `fix-werft-0825` sits (Task 9).

- [ ] **Step 4: Run, expect pass.** `routes.test.ts` and any other test constructing a `JobPaths`
      or `RunnerInternals` literal now needs `projektSlugs: () => []` and `"plaud-fetch": neverCalled` - add them (typecheck tells you where).
- [ ] **Step 5: Full gate; Commit** - `feat: the plaud-fetch job kind and a project for plaud-process`

---

### Task 5: The routes and the composition root

**Files:**

- Modify: `server/src/eingang/routes.ts`, `server/src/index.ts`, `e2e/fixtures.ts` (one line)
- Test: `server/test/eingang/routes.test.ts` (extend)

**Interfaces:**

- Consumes: `withPlaud`, `PlaudCommand`, `PlaudError`, `REAL_PLAUD_COMMAND` (Task 1);
  `listRecordings`, `parseListFiles`, `runPlaudFetch`, `Recording` (Tasks 2-3);
  `localRecordingIds`, `plaudStatus`, `RecordingStatus` (Task 3); `vaultHandoffs` from
  `server/src/projekte/handoffs.ts` and `localDay` from `server/src/projekte/stand.ts` (root only).
- Produces:

```ts
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
// GET /api/eingang/plaud?page=1 -> { source: PlaudSource, recordings: (Recording & { status: RecordingStatus })[], nextPage: number | null }
// GET /api/eingang/projekte     -> { slugs: string[] }
```

- [ ] **Step 1: Failing tests.** In `routes.test.ts`, the shared `beforeEach` context gains
      `mcp: "off"` and `paths.projektSlugs: () => ["leuchtturm", "hafen"]`; a helper
      `appWith(overrides)` builds a variant. Tests:

```ts
describe("GET /api/eingang/plaud", () => {
  it("lists the three fixture recordings with their marks under sample data", async () => {
    // needs Task 9's fixture files for im_eingang/notiz_vorhanden; until then this asserts neu for all three
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
  });
  it("answers off with an empty list when the command is off in a configured world", async () => {
    const res = await request(appWith({ sample: false, mcp: "off" })).get(
      "/api/eingang/plaud",
    );
    expect(res.body).toEqual({ source: "off", recordings: [], nextPage: null });
  });
  it("reaches the fake MCP in a configured world and reconciles by id", async () => {
    // A configured world: plaudHome is a scratch dir with an empty inbox/, and plaud.dir is its
    // notizen/, holding one note with `aufnahme: fix-hafen-0820` - appWith sets both from
    // scratchHome, the way index.ts derives plaud.dir from PLAUD_HOME.
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
});

describe("GET /api/eingang/projekte", () => {
  it("answers the injected slugs", async () => {
    const res = await request(app).get("/api/eingang/projekte");
    expect(res.body).toEqual({ slugs: ["leuchtturm", "hafen"] });
  });
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
  });
  it("400s a hostile id and leaves the table empty", async () => {
    const res = await request(app)
      .post("/api/eingang/jobs")
      .send({ kind: "plaud-fetch", args: { id: "../x" } });
    expect(res.status).toBe(400);
    expect(jobCount()).toBe(0);
  });
});
```

The `plaud-fetch` internal in the test runner is the real `runPlaudFetch` bound to the test's
paths, not `neverCalled` - that is what makes the sample-run test meaningful.

- [ ] **Step 2: Run, expect failure.**
- [ ] **Step 3: Implement `routes.ts`.**

```ts
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

// The same async handler shape projekteRouter's POST /scan uses: Express 5 forwards a rejection
// to its error middleware, so only a PlaudError is caught here and everything else still 500s.
router.get("/plaud", async (req, res) => {
  const page = pageOf(req.query.page);
  const empty = (source: PlaudSource) => ({
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
  const withStatus = (pageReply: RecordingPage, source: PlaudSource) => ({
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
```

`archivDirOf` and `plaud.dir` already encode the sample/configured split for archiv and notizen;
`inboxDir` is `<plaudHome>/inbox` in both worlds (the fixture dir's own `inbox/` under sample).
`parseListFiles("[]", n)` yields an empty page - the fixture has one page.

- [ ] **Step 4: `index.ts`.**

```ts
import { vaultHandoffs } from "./projekte/handoffs.js";
import { localDay } from "./projekte/stand.js";
import { REAL_PLAUD_COMMAND, type PlaudCommand } from "./eingang/plaud-mcp.js";
import { runPlaudFetch } from "./eingang/plaud-fetch.js";
// ...
const eingangPaths: JobPaths = { ...existing, projektSlugs: () => vaultHandoffs(vaultDb).handoffs.map((h) => h.slug) };
// BENCH_PLAUD=off is the e2e/sample switch, the BENCH_GH=off twin; the sample world is off by construction.
const plaudCommand: PlaudCommand = process.env.BENCH_PLAUD === "off" || eingangPaths.sample ? "off" : REAL_PLAUD_COMMAND;
// runner internals gain:
"plaud-fetch": (log, args) =>
  runPlaudFetch(
    { command: plaudCommand, plaudHome: eingangPaths.plaudHome, sample: eingangPaths.sample, today: () => localDay(Date.now()) },
    // planPlaudFetch proved args.id is a string before the plan reached the runner.
    args.id as string,
    log,
  ),
// context: { ..., mcp: plaudCommand }
// startup: console.log(`  Plaud MCP: ${plaudCommand === "off" ? "off" : "on"}`);
```

`e2e/fixtures.ts`: add `BENCH_PLAUD: "off",` after `BENCH_GH: "off",` with a one-line comment
(the sample world is off already; the explicit switch guards a future configured e2e world).

- [ ] **Step 5: Run, expect pass; `npm run format`, `npm run check`, `npm run e2e`** (index.ts
      and fixtures.ts changed). **Commit** - `feat: GET /api/eingang/plaud and the fetch wiring`

---

### Task 6: The Eingang web app

**Files:**

- Modify: `web/src/eingang/types.ts`, `web/src/eingang/api.ts`, `web/src/eingang/format.ts`,
  `web/src/eingang/App.tsx`, `web/src/eingang/components/InboxList.tsx`,
  `web/src/eingang/styles.css`
- Create: `web/src/eingang/components/AufnahmenPanel.tsx`
- Test: `web/src/eingang/components/AufnahmenPanel.test.tsx` (new), `InboxList.test.tsx`,
  `format.test.ts`, `App.test.tsx` (extend)

**Interfaces:**

- Consumes: `GET /api/eingang/plaud`, `GET /api/eingang/projekte`, `POST /jobs` with
  `{ kind: "plaud-fetch", args: { id } }` and `{ kind: "plaud-process", args: { file, projekt? } }`
  (Tasks 4-5).
- Produces, in `types.ts`:

```ts
export type PlaudSource = "mcp" | "sample" | "off" | "unauthenticated" | "unreachable";
export type RecordingStatus = "neu" | "wird_geholt" | "im_eingang" | "im_archiv" | "notiz_vorhanden";
export interface Recording { id: string; titel: string; start: string; dauer: number; status: RecordingStatus }
export interface PlaudReply { source: PlaudSource; recordings: Recording[]; nextPage: number | null }
export type EingangJobKind = ... | "plaud-fetch"; // EINGANG_JOB_KINDS and INTERNAL_KINDS gain it too
```

in `api.ts`: `plaud: (page: number) => get<PlaudReply>(\`/api/eingang/plaud?page=${String(page)}\`)`,
`projekte: () => get<{ slugs: string[] }>("/api/eingang/projekte")`; in `format.ts`:
`dauerText(ms)` (the server's twin, duplicated per the workspace boundary), `recordingMetaText(r)`
= `${dateTimeText(Date.parse(r.start))} · ${dauerText(r.dauer)}`, and the two labels of
decision 16 (`JobArgs`gains`projekt?: string; id?: string`).

- [ ] **Step 1: Failing tests.** `AufnahmenPanel.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AufnahmenPanel from "./AufnahmenPanel";
import type { PlaudReply, Recording } from "../types";

function recording(overrides: Partial<Recording> = {}): Recording {
  return {
    id: "fix-lampe-0901",
    titel: "Lampe für den Leuchtturm",
    start: "2026-09-01T09:00:00",
    dauer: 1523000,
    status: "neu",
    ...overrides,
  };
}
const reply = (overrides: Partial<PlaudReply> = {}): PlaudReply => ({
  source: "mcp",
  recordings: [recording()],
  nextPage: null,
  ...overrides,
});
const noop = { onFetch: vi.fn(), onReload: vi.fn(), onMore: vi.fn() };

describe("AufnahmenPanel", () => {
  it("shows Lädt … before the first reply", () => {
    render(<AufnahmenPanel reply={null} {...noop} />);
    expect(screen.getByText("Lädt …")).toBeInTheDocument();
  });
  it("renders a row with title, meta and an enabled Holen for a new recording", async () => {
    const onFetch = vi.fn();
    render(<AufnahmenPanel reply={reply()} {...noop} onFetch={onFetch} />);
    expect(screen.getByText("Lampe für den Leuchtturm")).toBeInTheDocument();
    expect(screen.getByText(/25m23s/)).toBeInTheDocument();
    const button = screen.getByRole("button", {
      name: "Holen: Lampe für den Leuchtturm",
    });
    expect(button).toBeEnabled();
    await userEvent.click(button);
    expect(onFetch).toHaveBeenCalledWith("fix-lampe-0901");
  });
  it("disables Holen with the status as title for every other status", () => {
    render(
      <AufnahmenPanel
        reply={reply({
          recordings: [
            recording({ status: "wird_geholt" }),
            recording({ id: "b", titel: "B", status: "im_eingang" }),
            recording({ id: "c", titel: "C", status: "im_archiv" }),
            recording({ id: "d", titel: "D", status: "notiz_vorhanden" }),
          ],
        })}
        {...noop}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Holen: Lampe für den Leuchtturm" }),
    ).toHaveAttribute("title", "Wird geholt");
    expect(screen.getByRole("button", { name: "Holen: B" })).toHaveAttribute(
      "title",
      "Im Eingang",
    );
    expect(screen.getByRole("button", { name: "Holen: C" })).toHaveAttribute(
      "title",
      "Im Archiv",
    );
    expect(screen.getByRole("button", { name: "Holen: D" })).toHaveAttribute(
      "title",
      "Notiz vorhanden",
    );
    expect(screen.getByText("Wird geholt")).toBeInTheDocument();
  });
  it("shows one source line per non-mcp source and the empty state", () => {
    const { rerender } = render(
      <AufnahmenPanel
        reply={reply({ source: "off", recordings: [] })}
        {...noop}
      />,
    );
    expect(
      screen.getByText("Plaud ist nicht konfiguriert."),
    ).toBeInTheDocument();
    rerender(
      <AufnahmenPanel
        reply={reply({ source: "unauthenticated", recordings: [] })}
        {...noop}
      />,
    );
    expect(
      screen.getByText("Nicht angemeldet - im Terminal /plaud starten."),
    ).toBeInTheDocument();
    rerender(
      <AufnahmenPanel
        reply={reply({ source: "unreachable", recordings: [] })}
        {...noop}
      />,
    );
    expect(screen.getByText("Plaud nicht erreichbar.")).toBeInTheDocument();
    rerender(
      <AufnahmenPanel
        reply={reply({ source: "sample", recordings: [] })}
        {...noop}
      />,
    );
    expect(screen.getByText("Beispieldaten")).toBeInTheDocument();
    expect(screen.getByText("Keine Aufnahmen.")).toBeInTheDocument();
  });
  it("offers Neu laden always and Mehr laden only with a next page", async () => {
    const onMore = vi.fn();
    const onReload = vi.fn();
    const { rerender } = render(
      <AufnahmenPanel
        reply={reply({ nextPage: 2 })}
        {...noop}
        onMore={onMore}
        onReload={onReload}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Mehr laden" }));
    expect(onMore).toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Neu laden" }));
    expect(onReload).toHaveBeenCalled();
    rerender(<AufnahmenPanel reply={reply()} {...noop} />);
    expect(
      screen.queryByRole("button", { name: "Mehr laden" }),
    ).not.toBeInTheDocument();
  });
});
```

`InboxList.test.tsx`: existing calls to `onProcess` expect `(name, null)`; a new test renders
`slugs={["leuchtturm", "hafen"]}`, selects `leuchtturm` in the row's `Projekt: <name>` select,
clicks and expects `onProcess("2026-08-30_werkstattrunde-transcript.txt", "leuchtturm")`; another
asserts a non-processable row has no select. `format.test.ts`: `dauerText` three cases,
`jobKindLabel` for `plaud-fetch` (`Holen: abc`) and `plaud-process` with a projekt
(`Verarbeiten: a.md (leuchtturm)`); the `expectTypeOf` pin needs no change beyond the union.
`App.test.tsx`: the `vi.mock("./api")` factory gains `plaud: vi.fn()` and `projekte: vi.fn()`,
`beforeEach` resolves them to `{ source: "sample", recordings: [], nextPage: null }` and
`{ slugs: [] }`; new tests: the panel heading renders; `Holen` calls `startJob("plaud-fetch",
{ id })` and refetches the listing (`api.plaud` called twice); `Verarbeiten` with a selected
project calls `startJob("plaud-process", { file, projekt: "leuchtturm" })`; without a selection
`{ file }` only.

- [ ] **Step 2: Run, expect failure.**
- [ ] **Step 3: Implement.** `AufnahmenPanel.tsx`:

```tsx
import { recordingMetaText } from "../format";
import type {
  PlaudReply,
  PlaudSource,
  Recording,
  RecordingStatus,
} from "../types";

const STATUS_LABEL: Record<RecordingStatus, string> = {
  neu: "Neu",
  wird_geholt: "Wird geholt",
  im_eingang: "Im Eingang",
  im_archiv: "Im Archiv",
  notiz_vorhanden: "Notiz vorhanden",
};

const SOURCE_LINE: Record<Exclude<PlaudSource, "mcp">, string> = {
  sample: "Beispieldaten",
  off: "Plaud ist nicht konfiguriert.",
  unauthenticated: "Nicht angemeldet - im Terminal /plaud starten.",
  unreachable: "Plaud nicht erreichbar.",
};

function RecordingRow({
  recording,
  onFetch,
}: {
  recording: Recording;
  onFetch: (id: string) => void;
}) {
  const fetchable = recording.status === "neu";
  return (
    <li className="eingang-row">
      <div className="eingang-row-body">
        <span className="eingang-row-name">{recording.titel}</span>
        <div className="eingang-row-meta">
          <span className="eingang-chip">{STATUS_LABEL[recording.status]}</span>
          <span>{recordingMetaText(recording)}</span>
        </div>
      </div>
      <button
        type="button"
        aria-label={`Holen: ${recording.titel}`}
        disabled={!fetchable}
        title={fetchable ? undefined : STATUS_LABEL[recording.status]}
        onClick={() => onFetch(recording.id)}
      >
        Holen
      </button>
    </li>
  );
}

/** The recordings Plaud holds, marked by what is already local; nothing here polls the MCP. */
export default function AufnahmenPanel({
  reply,
  onFetch,
  onReload,
  onMore,
}: {
  reply: PlaudReply | null;
  onFetch: (id: string) => void;
  onReload: () => void;
  onMore: () => void;
}) {
  return (
    <section className="eingang-section" aria-labelledby="eingang-aufnahmen">
      <h2 id="eingang-aufnahmen">Plaud-Aufnahmen</h2>
      {reply === null ? (
        <p className="eingang-empty">Lädt …</p>
      ) : (
        <>
          {reply.source !== "mcp" && (
            <p className="eingang-source">{SOURCE_LINE[reply.source]}</p>
          )}
          {reply.recordings.length === 0 ? (
            <p className="eingang-empty">Keine Aufnahmen.</p>
          ) : (
            <ul className="eingang-list">
              {reply.recordings.map((r) => (
                <RecordingRow key={r.id} recording={r} onFetch={onFetch} />
              ))}
            </ul>
          )}
          <div className="eingang-section-actions">
            <button type="button" className="eingang-btn" onClick={onReload}>
              Neu laden
            </button>
            {reply.nextPage !== null && (
              <button type="button" className="eingang-btn" onClick={onMore}>
                Mehr laden
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
}
```

`InboxList.tsx`: `InboxRow` gains a `slugs: string[]` prop and `useState<string>("")` for the
selection; a processable row renders, before the button,
`<select aria-label={\`Projekt: ${file.name}\`} className="eingang-row-select" value={projekt}
onChange={(e) => setProjekt(e.target.value)}>`with`<option value="">Kein Projekt</option>`and
one option per slug;`onProcess(file.name, projekt === "" ? null : projekt)`. The signature is
`onProcess: (name: string, projekt: string | null) => void`on both`InboxRow`and`InboxList`.

`App.tsx`: state `plaud: PlaudReply | null` (initial `null`) and `slugs: string[]`;
`refetchPlaud = () => api.plaud(1).then(setPlaud)`; `loadMore` fetches `plaud.nextPage` and
sets `{ ...next, recordings: [...plaud.recordings, ...next.recordings] }`; the mount effect adds
`refetchPlaud()` and `api.projekte().then((r) => setSlugs(r.slugs))`; `runJob` calls
`refetchPlaud()` after a successful start when `kind === "plaud-fetch"` (decision 17);
`handleFetch = (id) => void runJob("plaud-fetch", { id })`; `handleProcess = (name, projekt) =>
void runJob("plaud-process", projekt === null ? { file: name } : { file: name, projekt })`.
`<AufnahmenPanel>` renders between the inbox section and `<JobsPanel>`; `<InboxList slugs={slugs}
... />`.

`styles.css`: `.eingang-source` (the muted colour the meta line uses), `.eingang-row-select`
(the same height and border tokens as `.eingang-btn`, a small right margin), and
`.eingang-section-actions` (a flex row, gap 8px, top margin 12px) - every colour through the
file's existing variables, dark palette included.

- [ ] **Step 4: Run, expect pass.** Then in a browser against `npm run dev` (port 8101): the
      panel with the three sample recordings, one enabled `Holen`, the select beside
      `Verarbeiten`, both themes; measure that the select and the button share a baseline
      (`getBoundingClientRect`).
- [ ] **Step 5: `npm run format`, `npm run check`, `npm run e2e`** (web changed; the e2e inbox
      spec still passes since `Verarbeiten: <name>` is unchanged). **Commit** -
      `feat: the Plaud-Aufnahmen panel and a project for Verarbeiten`

---

### Task 7: The fourth signal on the server

**Files:**

- Modify: `server/src/projekte/stand.ts`, `server/src/projekte/routes.ts`,
  `server/src/index.ts`, `server/test/projekte/app.ts` (`emptyProjekte`, `buildSampleContext`)
- Test: `server/test/projekte/stand.test.ts`, `server/test/projekte/routes.test.ts` (extend)

**Interfaces:**

- Consumes: nothing new; `plaudLocation.dir` in the root.
- Produces:

```ts
export interface Signals {
  veraltet: boolean;
  dirtyRepos: number;
  offeneTasks: number;
  plaudNotizen: number;
}
/** `projekt` (trimmed, lowercased) and `datum` (first ten characters, YYYY-MM-DD) of a Plaud note's frontmatter, or null when either is missing. */
export function plaudNoteMeta(
  text: string,
): { projekt: string; datum: string } | null;
export function projektStand(
  vaultDb: Database.Database,
  rows: ProjectRow[],
  notizenDir: string | null,
): StandReply;
export interface ProjekteContext {
  db;
  roots;
  source;
  gh;
  notizenDir: string | null;
}
```

- [ ] **Step 1: Failing tests.** `stand.test.ts` gains a `notizenDir(files: Record<string, string>)`
      helper writing `.md` files into a scratch subdir, and:

```ts
describe("plaudNoteMeta", () => {
  it("reads projekt and datum, tolerating a titel with a colon, and is null without either", () => {
    expect(
      plaudNoteMeta(
        "---\ntitel: 08-18 Besprechung: Q4\nprojekt: Bench \ndatum: 2026-08-20\n---\n",
      ),
    ).toEqual({ projekt: "bench", datum: "2026-08-20" });
    expect(plaudNoteMeta("---\ndatum: 2026-08-20\n---\n")).toBeNull();
    expect(plaudNoteMeta("# none")).toBeNull();
  });
});

describe("plaudNotizen", () => {
  it("counts notes with the slug dated after updated, not on it, not before, and 0 without a dir or updated", () => {
    const dir = notizenDir({
      "a.md": "---\nprojekt: bench\ndatum: 2026-08-02\n---\n",
      "b.md": "---\nprojekt: bench\ndatum: 2026-08-01\n---\n",
      "c.md": "---\nprojekt: bench\ndatum: 2026-07-31\n---\n",
      "d.md": "---\nprojekt: other\ndatum: 2026-09-01\n---\n",
      "e.txt": "---\nprojekt: bench\ndatum: 2026-09-01\n---\n",
    });
    const db = buildVault([
      handoff("bench", { updated: "2026-08-01" }),
      handoff("nodate"),
    ]);
    const reply = projektStand(db, [], dir);
    expect(
      reply.projekte.find((p) => p.slug === "bench")?.signals.plaudNotizen,
    ).toBe(1);
    expect(
      reply.projekte.find((p) => p.slug === "nodate")?.signals.plaudNotizen,
    ).toBe(0);
    expect(projektStand(db, [], null).projekte[0].signals.plaudNotizen).toBe(0);
    expect(
      projektStand(db, [], path.join(scratch.dir, "missing")).projekte[0]
        .signals.plaudNotizen,
    ).toBe(0);
  });
});
```

Every existing `projektStand(db, rows)` call in the file gains `, null`. `routes.test.ts`: one
test builds the sample context with a scratch `notizenDir` holding a note `projekt: <slug of an
inserted handoff>`, `datum` after its `updated`, and asserts `GET /stand` shows `plaudNotizen: 1`.

- [ ] **Step 2: Run, expect failure.** **Step 3: Implement.** In `stand.ts`:

```ts
// The Plaud notes are machine-written from the /plaud skill's template, whose titel line can
// carry its own ": " - the same line scanner server/src/eingang/inbox.ts's frontmatterValue and
// server/src/aufgaben/plaud.ts's splitFrontmatter use, written a third time here because the
// three apps never import each other.
export function plaudNoteMeta(
  text: string,
): { projekt: string; datum: string } | null {
  const lines = text.split("\n");
  if (lines[0] !== "---") return null;
  const closing = lines.indexOf("---", 1);
  if (closing === -1) return null;
  let projekt: string | null = null;
  let datum: string | null = null;
  for (const line of lines.slice(1, closing)) {
    const sep = line.indexOf(": ");
    if (sep === -1) continue;
    const key = line.slice(0, sep);
    const value = line.slice(sep + 2).trim();
    if (key === "projekt") projekt = value.toLowerCase();
    else if (key === "datum") datum = value.slice(0, 10);
  }
  return projekt !== null &&
    projekt !== "" &&
    datum !== null &&
    /^\d{4}-\d{2}-\d{2}$/.test(datum)
    ? { projekt, datum }
    : null;
}

function plaudNotes(
  notizenDir: string | null,
): { projekt: string; datum: string }[] {
  if (notizenDir === null) return [];
  let entries: Dirent[];
  try {
    entries = readdirSync(notizenDir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((e) => e.isFile() && e.name.endsWith(".md"))
    .flatMap(
      (e) =>
        plaudNoteMeta(readFileSync(path.join(notizenDir, e.name), "utf8")) ??
        [],
    );
}

function plaudNotizenFor(
  handoff: Handoff,
  notes: { projekt: string; datum: string }[],
): number {
  if (handoff.updated === null) return 0;
  return notes.filter(
    (n) => n.projekt === handoff.slug && n.datum > handoff.updated!,
  ).length;
}
```

`signalsFor` gains the `notes` parameter and `plaudNotizen: plaudNotizenFor(handoff, notes)`;
`projektStand` reads `plaudNotes(notizenDir)` once. `routes.ts`: `projektStand(vaultDb,
listProjects(db), ctx.notizenDir)`. `index.ts`: `notizenDir: plaudLocation.dir` on the projekte
context. `test/projekte/app.ts`: `notizenDir: null` in both builders.

- [ ] **Step 4: Run, expect pass; `npm run format`, `npm run check`, `npm run e2e`** (index.ts).
      **Commit** - `feat: count the Plaud notes dated after a handoff`

---

### Task 8: The badge in Projekte and on the Cockpit

**Files:**

- Modify: `web/src/projekte/types.ts` (`StandSignals.plaudNotizen`), `web/src/projekte/stand.ts`
  (`standHints`), `web/src/home/types.ts` (`HandoffRow.signals.plaudNotizen`, `handoffHints`)
- Test: `web/src/projekte/stand.test.ts`, `web/src/projekte/components/ProjektView.test.tsx`,
  `web/src/home/App.test.tsx` (extend; every `signals:` literal gains `plaudNotizen: 0`)

- [ ] **Step 1: Failing tests.** `stand.test.ts` (web): `standHints` yields
      `1 Plaud-Notiz seit Handoff` for `plaudNotizen: 1`, `3 Plaud-Notizen seit Handoff` for 3,
      nothing for 0, and the order `Stand veraltet`, `1 Repo ungesichert`, `2 offene Aufgaben`,
      `1 Plaud-Notiz seit Handoff`, `Repo nicht gefunden: x` when everything is set.
      `ProjektView.test.tsx`: a card with `plaudNotizen: 2` shows `2 Plaud-Notizen seit Handoff`.
      Home `App.test.tsx`, the "covers every handoffMeta branch" test: a row with
      `plaudNotizen: 1` renders `1 Plaud-Notiz seit Handoff` in its meta.
- [ ] **Step 2: Run, expect failure (type errors first).** **Step 3: Implement** - in both hint
      functions, after the open-tasks lines:

```ts
if (p.signals.plaudNotizen === 1) hints.push("1 Plaud-Notiz seit Handoff");
else if (p.signals.plaudNotizen > 1)
  hints.push(`${String(p.signals.plaudNotizen)} Plaud-Notizen seit Handoff`);
```

- [ ] **Step 4: Run, expect pass; full gate with e2e** (web). **Commit** -
      `feat: the Plaud-Notizen badge on project cards and Cockpit rows`

---

### Task 9: Fixtures and the browser suite

**Files:**

- Create: `server/src/eingang/fixture/inbox/2026-08-25_werftbegehung-transkript.md`,
  `e2e/eingang/plaud.spec.ts`
- Modify: `server/src/aufgaben/fixture/notizen/2026-08-20_hafenrunde.md` (frontmatter gains
  `aufnahme: fix-hafen-0820` and `projekt: leuchtturm`), `server/test/eingang/routes.test.ts`
  (inbox count 3 -> 4; the sample listing test now asserts `im_eingang` and `notiz_vorhanden`),
  `e2e/eingang/inbox.spec.ts` (one assertion: the new `.md` row is `Unverarbeitet` with an
  enabled button), `e2e/cockpit.spec.ts` (`2 unverarbeitet` -> `3 unverarbeitet`; the
  `leuchtturm` row also contains `1 Plaud-Notiz seit Handoff`), `e2e/projekte/stand.spec.ts`
  (the `leuchtturm` card contains `1 Plaud-Notiz seit Handoff`, the `hafen` card does not)

**The fixture inbox file, verbatim:**

```markdown
---
aufnahme: fix-werft-0825
titel: Werftbegehung
datum: 2026-08-25
start: 2026-08-25T14:00:00
dauer: 10m00s
geholt: 2026-08-26
---

# Werftbegehung

## Transkript

[00:00:00 - 00:00:03] Speaker 1: Die Werft ist bis Oktober belegt.
[00:00:04 - 00:00:09] Speaker 2: Dann planen wir den Rumpf für November.

## Markierungen

Keine.

## KI-Notiz (Plaud)

Keine.
```

- [ ] **Step 1: Fixtures and the unit/e2e count updates** listed above; run
      `cd server && npx vitest run test/eingang test/aufgaben` (the aufgaben parser ignores the
      two new keys - its tests stay green).
- [ ] **Step 2: The spec.** `e2e/eingang/plaud.spec.ts`:

```ts
/** The Plaud-Aufnahmen panel over the sample listing: three recordings with three marks, Holen on
    the new one reaching Fertig through the sample fetch that writes nothing, and Verarbeiten
    carrying the chosen project into the job's label. */
import type { Locator, Page } from "@playwright/test";
import { test, expect } from "../fixtures";

function jobRow(page: Page, protokollName: string): Locator {
  return page
    .getByRole("row")
    .filter({
      has: page.getByRole("button", { name: protokollName, exact: true }),
    })
    .first();
}

test("the panel marks the three sample recordings, fetches the new one and processes with a project", async ({
  page,
}) => {
  await page.goto("/eingang/");
  const panel = page.getByRole("region", { name: "Plaud-Aufnahmen" });
  await expect(panel).toContainText("Beispieldaten");

  const lampe = panel
    .getByRole("listitem")
    .filter({ hasText: "Lampe für den Leuchtturm" });
  await expect(lampe).toContainText("Neu");
  const werft = panel
    .getByRole("listitem")
    .filter({ hasText: "Werftbegehung" });
  await expect(werft).toContainText("Im Eingang");
  await expect(
    werft.getByRole("button", { name: "Holen: Werftbegehung", exact: true }),
  ).toBeDisabled();
  const hafen = panel
    .getByRole("listitem")
    .filter({ hasText: "Hafenrunde und Leuchtturm-Ausbau" });
  await expect(hafen).toContainText("Notiz vorhanden");

  await lampe
    .getByRole("button", {
      name: "Holen: Lampe für den Leuchtturm",
      exact: true,
    })
    .click();
  const fetchRow = jobRow(page, "Protokoll: Holen: fix-lampe-0901");
  await expect(fetchRow).toContainText(/Läuft|Fertig/);
  await fetchRow
    .getByRole("button", {
      name: "Protokoll: Holen: fix-lampe-0901",
      exact: true,
    })
    .click();
  await expect(page.getByRole("region", { name: "Protokoll" })).toContainText(
    "sample world: nothing written",
    { timeout: 15_000 },
  );

  const file = page
    .getByRole("listitem")
    .filter({ hasText: "2026-08-25_werftbegehung-transkript.md" });
  await file
    .getByLabel("Projekt: 2026-08-25_werftbegehung-transkript.md")
    .selectOption("leuchtturm");
  await file
    .getByRole("button", {
      name: "Verarbeiten: 2026-08-25_werftbegehung-transkript.md",
      exact: true,
    })
    .click();
  const processRow = jobRow(
    page,
    "Protokoll: Verarbeiten: 2026-08-25_werftbegehung-transkript.md (leuchtturm)",
  );
  await expect(processRow).toContainText(/Läuft|Fertig/);

  // The fake job runs three seconds; a same-worker retry would otherwise find plaud-process
  // still occupied and get its own start refused - the same wait jobs.spec.ts ends on.
  const vaultPoke = page.getByRole("button", {
    name: "Vault neu indexieren",
    exact: true,
  });
  await expect
    .poll(
      async () => {
        await vaultPoke.click();
        return (await processRow.textContent()) ?? "";
      },
      { timeout: 10_000 },
    )
    .toContain("Fertig");
});
```

- [ ] **Step 3: Run it alone**, then the retry proof
      `npx playwright test e2e/eingang/plaud.spec.ts --workers=1 --repeat-each=2`, then the full
      `npm run e2e`.
- [ ] **Step 4: `npm run format`, `npm run check`, `npm run e2e`; Commit** -
      `test: fixture recordings and the Plaud panel browser suite`

---

### Task 10: Documentation

**Files:**

- Modify: `docs/eingang/IMPLEMENTATION.md` (intro bullets: `plaud-mcp.ts`, `plaud-fetch.ts`;
  `## The fence`: the seventh kind, the id regex, the already-local refusal, the `projekt`
  argument checked against the injected slugs; `## Real jobs, fixture jobs, internal jobs`:
  three internal kinds, an internal plan carries `args`, the sample fetch writes nothing; a new
  `## The Plaud MCP` section: the stdio client, one process per call, the handshake, the four
  failure kinds and what each becomes, stderr discarded, `BENCH_PLAUD=off`, the reply shapes as
  the probe found them, the fetched file's name and text; `## Inbox reconciliation`: the id
  reconciliation beside the name one, `frontmatterValue`; `## The API`: the two new routes;
  `## The web app`: the panel, the select, decision 17; `## Tests`; `## Things that will bite`:
  npx resolves `@latest` on every spawn and needs the network, the first spawn after an update
  is slow, `wx` and the numeric suffix, old exports have no id and read `Neu`, the listing is
  not polled, a 500 for an unknown id, `page_size` floor of 10), `docs/eingang/REQUIREMENTS.md`
  (a `## Plaud über den MCP` section: the brief in five lines and a link to
  `docs/changes/plaud-mcp/SPEC.md`; the "Any job kind beyond the fixed six" bullet becomes
  seven), `docs/projekte/IMPLEMENTATION.md` (the fourth signal, its scanner, `notizenDir`),
  `docs/cockpit/IMPLEMENTATION.md` (the badge), `docs/PROJECT.md` (the Eingang row mentions the
  MCP listing and fetch; Bench OS decisions: "Two write paths" becomes three with the fetched
  file named; "Local CLIs are fair game" names `npx @plaud-ai/mcp` beside `gh`; the layout
  comment for `src/eingang/`), `e2e/EXPLORATORY.md` (Eingang: the real MCP is never reached by
  the suite - listing, paging, 401, the real fetch and the file it writes are checked by hand
  (Task 11); the real `/plaud` run with a project; the `Neu laden` after a fetch).
- Content rule: every claim verified against the code at HEAD; no task-history narration; each
  doc keeps its voice; no real ids, titles or content.

- [ ] **Step 1: Write and verify. Step 2: `npm run format`, `npm run check`. Step 3: Commit** -
      `docs: Plaud over the MCP`

---

### Task 11: The companion changes and the real-machine gate

Controller-led, with the user. No tracked change expected; the report lands in the SDD
workspace as `criteria-report.md`.

- [ ] **Step 1: The `/plaud` skill**, three files under `~/.claude/skills/plaud/`, applied on
      the user's word (the files are the user's):
  - `references/transkript-formate.md`, a new section after Format B:

    ```
    ## Format C - Bench-Export (aus dem Plaud-MCP)

    Eine Markdown-Datei mit Frontmatter (`aufnahme`, `titel`, `datum`, `start`, `dauer`,
    `geholt`) und drei Abschnitten: `## Transkript` mit Zeilen
    `[HH:MM:SS - HH:MM:SS] Sprecher: Text`, `## Markierungen` (die am Gerät markierten Momente,
    oder „Keine.") und `## KI-Notiz (Plaud)` (Plauds eigene Zusammenfassung, oder „Keine.").

    - **Quelle ist allein `## Transkript`.** Die KI-Notiz ist Kontext und Belegstelle, nie der
      Ausgangspunkt (siehe „Grenzen" in SKILL.md). Markierungen zeigen, welche Momente der
      Person wichtig waren; sie werden in der Notiz mit ihrer Zeitmarke aufgegriffen.
    - Zeitmarken sind vorhanden; Sprecher heißen `Speaker 1`, `Speaker 2` … wie in Format A.
    - `aufnahme:` aus dem Frontmatter in die Notiz übernehmen (siehe `notiz-format.md`).
    ```

  - `references/notiz-format.md`, two lines in the template's frontmatter after `zeitmarken:`
    and one rule appended as number 6:

    ```
    aufnahme: <Aufnahme-ID aus dem Frontmatter der Quelldatei, falls vorhanden>
    projekt: <Projekt-Slug, falls im Auftrag genannt>
    ```

    ```
    6. **`aufnahme:` und `projekt:`**: `aufnahme:` wird aus der Quelldatei übernommen, wenn sie
       eines trägt (Bench-Export); `projekt:` nur, wenn der Auftrag ein Projekt nennt - nie
       raten. Fehlt eines, den Schlüssel weglassen.
    ```

  - `SKILL.md`, one sentence appended to step 4 after "Datum aus dem Transkriptkopf nehmen,
    nicht das heutige Datum.":

    ```
    Trägt die Quelldatei `aufnahme:` im Frontmatter, in die Notiz übernehmen; nennt der
    Auftrag ein Projekt, `projekt: <slug>` setzen.
    ```

    and one sentence appended to the first bullet under „Grenzen":

    ```
    Eine Bench-Export-Datei trägt Plauds Zusammenfassung unter `## KI-Notiz (Plaud)`; sie
    bleibt Kontext, verarbeitet wird `## Transkript`.
    ```

- [ ] **Step 2: Measure the spec's success criteria** against `npm start` with the real `.env`
      (stop the server before any `check`): (1) the panel lists the newest recordings, marks
      match the local files (today: every recording reads `Neu`, since no local file carries an
      id yet), `Mehr laden` reaches page 2; (2) `Holen` on one transcribed recording the user
      picks writes exactly one `.md` under `~/Plaud/inbox` with `aufnahme:` and the three
      sections, the inbox list shows it `Unverarbeitet` with `Verarbeiten` enabled, a second
      `Holen` is refused (400, button disabled after `Neu laden`); a recording without a
      transcript fails with `no transcript yet`; (3) `Verarbeiten` with a project chosen runs
      the real `/plaud` skill and yields a note carrying `projekt:` and `aufnahme:`, and the
      listing shows `Notiz vorhanden` after `Neu laden`; (4) `GET /api/projekte/stand` shows
      that project's `plaudNotizen` equal to a hand count, and the badge renders in Projekte and
      on the Cockpit; (5) with `BENCH_PLAUD=off npm start` the panel reads
      `Plaud ist nicht konfiguriert.`, after `logout` through the MCP in Claude Code it reads
      `Nicht angemeldet` (then `login` again), offline it reads `Plaud nicht erreichbar.`;
      screenshots in both themes via `node e2e/tools/chrome-shots.mjs` (add the panel if the
      screen list needs it), untracked under `data/task-11-plaud-mcp-screenshots/`. Report
      counts, basenames and shapes only - no title, no id, no content.
- [ ] **Step 3: Final gate** - `npm run format`, `npm run check`, `npm run e2e`, each with its
      own exit code; commit only if a tracked change was needed
      (`chore: plaud-mcp gate follow-up`).

---

## Self-review notes

- Spec coverage: the client with its four failure kinds, timeouts and the fixture MCP (Task 1);
  the reply parsers, `findRecording`, the cursor loop, the file's name and text (Task 2); the id
  reconciliation, `wx`, the realpath refusal, the sample fetch that writes nothing, the empty
  transcript refusal (Task 3); the fence's new kind and `projekt` argument, internal args
  (Task 4); the two routes, every `source`, the wiring and `BENCH_PLAUD` (Task 5); the panel with
  every German string, the select, decision 17 (Task 6); the fourth signal (Task 7); the badge in
  both apps (Task 8); fixtures, the spec, the moved counts, the retry proof (Task 9); every doc
  the spec names (Task 10); the companion skill wording and the five success criteria (Task 11).
- Names consistent across tasks: `PlaudFailure`, `PlaudError`, `PlaudCall`, `PlaudCommand`,
  `REAL_PLAUD_COMMAND`, `PlaudTimeouts`, `PLAUD_TIMEOUTS`, `classifyFailure`, `withPlaud`;
  `Recording`, `RecordingPage`, `Segment`, `Mark`, `FetchedRecording`, `PAGE_SIZE`,
  `parseListFiles`, `parseTranscriptPage`, `parseMarks`, `parseNote`, `listRecordings`,
  `findRecording`, `fetchRecording`, `assembleFetch`, `slugify`, `dauerText`, `zeitText`,
  `fetchedFileName`, `renderFetchedFile`, `writeFetchedFile`, `PlaudFetchDeps`, `runPlaudFetch`;
  `frontmatterValue`, `LocalIds`, `localRecordingIds`, `isLocal`, `RecordingStatus`,
  `plaudStatus`; `InternalName`, `RECORDING_ID`, `planPlaudFetch`, `projektOf`,
  `JobPaths.projektSlugs`, `resolvesInsideFolder` (now exported); `EingangContext.mcp`,
  `PlaudSource`, `inFlightIds`, `sourceOf`; `Signals.plaudNotizen`, `plaudNoteMeta`,
  `ProjekteContext.notizenDir`; web: `PlaudReply`, `Recording`, `RecordingStatus`,
  `PlaudSource`, `api.plaud`, `api.projekte`, `dauerText`, `recordingMetaText`,
  `AufnahmenPanel`, `RecordingRow`, `InboxList.slugs`, `standHints`, `handoffHints`.
- The only production behaviour changes outside the new panel are: the fence accepts one more
  kind and one optional argument; internal jobs receive args; `/stand` carries one more signal;
  the aufgaben fixture note carries two more keys (ignored by its parser).
- Writes: exactly one, `writeFetchedFile`, `wx`, under `<plaudHome>/inbox`, after the realpath
  check, from a clicked `plaud-fetch` job; the sample world never reaches it.
