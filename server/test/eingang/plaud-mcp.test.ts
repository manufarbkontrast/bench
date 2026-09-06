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
// The fake process's own cold start (node boot plus reading plaud-aufnahmen.json) can outlast a
// tight budget on a loaded machine, failing a test whose subject isn't the timeout with
// "initialize timed out" instead of what it asserts - so every test but the hang one gets room to
// breathe, and only the hang test keeps a short budget, since firing the timeout fast is exactly
// what it exercises.
const GENEROUS = { callMs: 5_000, sessionMs: 20_000 };
const SHORT = { callMs: 500, sessionMs: 5_000 };

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
      GENEROUS,
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
        withPlaud(FAKE, (call) => call("list_files", {}), GENEROUS),
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
        withPlaud(FAKE, (call) => call("get_note", { file_id: "x" }), SHORT),
      );
      expect(err.kind).toBe("unreachable");
      expect(err.message).toContain("timed out");
    } finally {
      delete process.env.BENCH_FAKE_PLAUD;
    }
  });

  it("fails a call as unreachable when the session timer fires before the call timer", async () => {
    process.env.BENCH_FAKE_PLAUD = "hang";
    try {
      const err = await failureOf(
        withPlaud(FAKE, (call) => call("get_note", { file_id: "x" }), {
          callMs: 5_000,
          sessionMs: 500,
        }),
      );
      expect(err.kind).toBe("unreachable");
      expect(err.message).toContain("session timed out");
    } finally {
      delete process.env.BENCH_FAKE_PLAUD;
    }
  });

  it("fails a pending call as unreachable when the MCP exits mid-session", async () => {
    process.env.BENCH_FAKE_PLAUD = "exit";
    try {
      const err = await failureOf(
        withPlaud(FAKE, (call) => call("list_files", {}), GENEROUS),
      );
      expect(err.kind).toBe("unreachable");
      expect(err.message).toContain("exited");
    } finally {
      delete process.env.BENCH_FAKE_PLAUD;
    }
  });

  it("is unreachable on a non-JSON frame", async () => {
    process.env.BENCH_FAKE_PLAUD = "garbage";
    try {
      const err = await failureOf(
        withPlaud(FAKE, (call) => call("list_files", {}), GENEROUS),
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
        GENEROUS,
      ),
    );
    expect(err.kind).toBe("unreachable");
  });

  it("is off without spawning anything", async () => {
    const err = await failureOf(
      withPlaud("off", () => Promise.resolve("never"), GENEROUS),
    );
    expect(err.kind).toBe("off");
  });

  it("rethrows a non-Plaud error from fn and still returns", async () => {
    await expect(
      withPlaud(FAKE, () => Promise.reject(new Error("mine")), GENEROUS),
    ).rejects.toThrow("mine");
  });
});
