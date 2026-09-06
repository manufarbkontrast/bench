#!/usr/bin/env node
// Stands in for @plaud-ai/mcp in tests: the same newline-delimited JSON-RPC over stdio, answering
// from the bundled listing plus three synthetic transcripts. Every shape here mirrors the probe
// report in the SDD workspace (2026-09-06): an untranscribed recording answers a bare [] for every
// block, a transcribed one without marks answers a plain "not available" line, an unknown id is a
// 500. Modes via BENCH_FAKE_PLAUD: "unauthenticated" fails every tools/call with the MCP's 401
// text, "hang" never answers a tools/call, "garbage" prints one non-JSON line first, "exit" quits
// mid-call on the first tools/call, so the client sees the process die with a call still pending.
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
  if (mode === "exit") process.exit(0);
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
