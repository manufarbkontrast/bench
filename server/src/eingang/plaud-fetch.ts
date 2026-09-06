import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { resolvesInsideFolder } from "./jobs.js";
import {
  PlaudError,
  withPlaud,
  type PlaudCall,
  type PlaudCommand,
} from "./plaud-mcp.js";

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

const PAGE_SIZE = 20;
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

const START_AT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;

function toRecording(value: unknown): Recording | null {
  const r = asRecord(value);
  if (r === null || typeof r.id !== "string" || r.id === "") return null;
  const name = typeof r.name === "string" ? r.name.trim() : "";
  // start becomes fetchedFileName's date component and so a path segment - checked against the
  // probed shape here, at the boundary, rather than trusted as MCP-supplied text.
  const start =
    typeof r.start_at === "string" && START_AT.test(r.start_at)
      ? r.start_at
      : "";
  return {
    id: r.id,
    titel: name === "" ? UNTITLED : name,
    start,
    dauer: typeof r.duration === "number" ? r.duration : 0,
  };
}

export function parseListFiles(text: string, page: number): RecordingPage {
  const reply = asRecord(jsonOf(text));
  const data = Array.isArray(reply?.data) ? reply.data : [];
  const recordings = data.flatMap((entry: unknown) => toRecording(entry) ?? []);
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
    segments: raw.flatMap((s: unknown) => toSegment(s) ?? []),
    nextCursor: typeof page?.next_cursor === "string" ? page.next_cursor : null,
  };
}

export function parseMarks(text: string): Mark[] {
  const page = asRecord(jsonOf(text));
  const raw = Array.isArray(page?.marks) ? page.marks : [];
  return raw.flatMap((m: unknown) => {
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
  const summary = (entries as unknown[])
    .map((e: unknown) => asRecord(e))
    .find((e) => e?.data_type === "auto_sum_note");
  return summary != null &&
    typeof summary.data_content === "string" &&
    summary.data_content !== ""
    ? summary.data_content
    : null;
}

/** routes.ts pages recordings through this. */
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
async function findRecording(call: PlaudCall, id: string): Promise<Recording> {
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
  const noteSummary = note === null ? "none" : `${String(note.length)} chars`;
  log(`get_note ${recording.id}: ${noteSummary}`);
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
    .replace(/^-/, "")
    .replace(/-$/, "")
    .slice(0, SLUG_MAX)
    .replace(/-$/, "");
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
  const day =
    recording.start === "" ? "ohne-datum" : recording.start.slice(0, 10);
  const base = `${day}_${slugify(recording.titel)}`;
  const first = `${base}-transkript.md`;
  if (!taken(first)) return first;
  let n = 2;
  let candidate = `${base}-${String(n)}-transkript.md`;
  while (taken(candidate)) {
    n += 1;
    candidate = `${base}-${String(n)}-transkript.md`;
  }
  return candidate;
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

/** Creates `<plaudHome>/inbox/<name>` with the wx flag after the realpath check; returns the path. */
export function writeFetchedFile(
  plaudHome: string,
  name: string,
  content: string,
): string {
  // resolvesInsideFolder's own docstring (jobs.ts) states its precondition: it only ever inspects
  // the folder path itself, and trusts the caller to have already reduced `name` to a bare
  // basename - name is untrusted MCP data turned into a path component, so that reduction has to
  // happen here, before it is ever joined onto inbox.
  if (path.basename(name) !== name)
    throw new Error(`fetched file name escapes inbox: ${name}`);
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

/** Its own test drives it directly, ahead of runPlaudFetch's write. */
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

export interface PlaudFetchDeps {
  command: PlaudCommand;
  plaudHome: string | null;
  sample: boolean;
  today: () => string; // "YYYY-MM-DD", local
}

/** The plaud-fetch internal job: under sample data it logs the three calls and writes nothing. */
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
