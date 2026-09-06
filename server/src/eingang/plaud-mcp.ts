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

/** The production command, wired into index.ts's plaudCommand. */
export const REAL_PLAUD_COMMAND: PlaudCommand = [
  "npx",
  "-y",
  "@plaud-ai/mcp@latest",
];

export interface PlaudTimeouts {
  callMs: number;
  sessionMs: number;
}

// Not exported: nothing outside this module names it directly, only withPlaud's own default
// parameter reads it - a later task that needs the production values reaches them through that
// default rather than through a second public constant.
const PLAUD_TIMEOUTS: PlaudTimeouts = {
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
