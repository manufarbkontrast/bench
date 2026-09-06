# Review-Nacharbeit - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to
> implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One shared frontmatter line scanner on the server, the handoff slug rule enforced as a
derived column at the vault indexer and read by Projekte, the Kontext Regeln tab without handoffs,
and a React error boundary with the Bench strip in every one of the nine web documents. Spec:
[SPEC.md](./SPEC.md).

**Architecture:** A new `server/src/shared/frontmatter.ts` replaces four hand-rolled scanners
in four apps. The vault's `notes` table gains a derived `projekt` column, filled by `indexNote`
from a new `projektOf` in `vault/index/frontmatter.ts`; `projekte/handoffs.ts` and
`projekte/stand.ts` select it instead of parsing frontmatter JSON, and Eingang's fence inherits it
through the injected slug list. Kontext's `/regeln` filters one prefix. On the web,
`web/src/shared/ErrorBoundary.tsx` (a class component with its own self-contained `crash.css`)
wraps `<App />` in every `main.tsx`, outside the router where there is one. No app imports
another; the only new dependency edges point at the two `shared/` folders.

**Tech Stack:** Express 5, better-sqlite3 12, gray-matter (vault only), Vite 8 + React 19,
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
- Focused tests: `cd server && npx vitest run test/shared test/vault test/projekte test/kontext
test/aufgaben test/eingang` (pick the folders the task touches) /
  `cd web && npx vitest run src/shared` (never `-w`, that is vitest's watch flag).
- ESLint limits: 500 lines a file, 200 a function (`.tsx` exempt from the latter), complexity
  15, depth 4, 5 params. No `any`. No emoji in code or comments. Comments say why. Hand-rolled
  line scanners over regex-heavy parsing. Immutable data - build new objects, never mutate. No
  `/tmp/` literal in a test: `mkdtempSync(path.join(tmpdir(), ...))`.
- **No import across app boundaries.** `server/src/<app>/` imports from `server/src/shared/` and
  `server/src/config.ts`, never from a sibling app; the three existing imports into
  `server/src/vault/write.ts`, `vault/routes/query.ts` and `vault/routes/index.ts` stay as they
  are and are not a licence for new ones. `web/src/<app>/` imports from `web/src/shared/` only.
  Tests are not bound by the boundary (`server/test/projekte/*` already opens the vault database).
- **No new write path.** This change writes nothing outside `data/` and the repository; the only
  schema change is one nullable column on the derived vault index.
- Machine paths, real handoff titles, note contents and real recording data never appear in
  tracked files, briefs, reports or the ledger - fixture slugs (`hafen`, `leuchtturm`), counts
  and shapes only.
- German UI strings exactly as written in this plan; identifiers, comments, commits English.
  Conventional Commits, one line under 72 characters, then a blank line and EXACTLY these two
  trailers on every commit:
  `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` <!-- allow-secret: Anthropic's own no-reply address, required verbatim in every commit trailer --> and
  `Claude-Session: https://claude.ai/code/session_01MoJadrroWuuNdrBRnWAPCF`. Never push. Branch
  `follow-ups`, cut from `main` at 46c3b80; the spec is already committed as 9e3490b.

## Decisions settled at plan approval

The ten spec decisions stand. Settled here, from reading the code the tasks touch:

1. **Tests that seed `notes` rows by hand fill the `projekt` column through `projektOf`.** The
   projekte suites build vault databases with a raw `INSERT INTO notes` (`handoffs.test.ts` and
   `stand.test.ts`'s `buildVault`, `routes.test.ts`'s `insertHandoff`); after Task 3 the readers
   select the column and never fall back to the frontmatter, so those helpers import
   `projektOf` from `../../src/vault/index/frontmatter.js` and pass its result - the suites then
   exercise the exact rule the indexer applies. Helpers that insert notes without `projekt`
   (`app.ts`'s `coupleNotes`, `pipeline.test.ts`, the aufgaben and kontext suites) need nothing:
   the column is nullable and defaults to `NULL`.
2. **`handoffs.ts` tells the two `NULL` cases apart by the frontmatter.** No string `projekt`, or
   one blank after trimming, stays `Handoff ohne projekt: <file>` - the doc's existing promise;
   anything else that left the column empty is `Ungültiger Slug in <file>`.
3. **Only `scanFrontmatter` is exported from the shared module** (spec decision 9). `inbox.ts`'s
   `frontmatterValue` goes, its unit test moves to the shared suite; `quelleOf` stays, a named
   concept with callers and tests of its own. `kontext/skills.ts` and `aufgaben/plaud.ts` read
   `fields` directly.
4. **The boundary stores the error's message, a string, not the `Error`.** React hands
   `getDerivedStateFromError` whatever was thrown; a non-`Error` value is `String(value)`.
5. **The crash screen's button is a plain bordered button, not orange.** Orange means "you are
   here" in the strip; the screen is chrome, and the strip already carries the one accent.
6. **Kontext filters in `routes.ts`, beside `PROFIL_PREFIX` and `WORKFLOW_PREFIX`.**
   `vaultNotesUnder` is unchanged, so `readers.test.ts` is too.
7. **The fixture handoffs stay as they are.** Both carry valid slugs; the invalid-slug case is
   unit-tested only, so no e2e count moves and no fixture changes.
8. **The migration test builds an old-shape index file** in a `mkdtempSync` directory under
   `os.tmpdir()`, opens it through `openDb` and reads `PRAGMA table_info(notes)`.
9. **Task order:** scanner (1), vault column (2), projekte readers (3), kontext (4), boundary
   (5), docs and gate (6). Tasks 1, 4 and 5 are independent of the rest; 3 depends on 2.
10. **Reviews on sonnet for every task**; none touches a fence or a write surface. The final
    whole-branch review runs on opus, with one fix wave and one scoped re-review, as before.

---

### Task 0: Setup

Controller-led, no implementer.

- [ ] **Step 1:** This plan committed on `follow-ups` as `docs: the follow-ups plan`.
- [ ] **Step 2:** Workspace `.superpowers/sdd/PLAN-follow-ups/` with `progress.md` (the ledger)
      initialised; the symlink `.superpowers/sdd/PLAN` repointed at it
      (`ln -sfn PLAN-follow-ups .superpowers/sdd/PLAN`). The directory is gitignored.
- [ ] **Step 3:** The user's approval of this plan recorded in the ledger before Task 1 is
      dispatched.

---

### Task 1: The shared frontmatter scanner

**Files:**

- Create: `server/src/shared/frontmatter.ts`, `server/test/shared/frontmatter.test.ts`
- Modify: `server/src/aufgaben/plaud.ts` (delete `Frontmatter`, `NO_FRONTMATTER`,
  `splitFrontmatter`; `parsePlaudNote`), `server/src/eingang/inbox.ts` (delete
  `frontmatterValue`; `quelleOf`, `recordingIdsIn`), `server/src/kontext/skills.ts` (delete
  `frontmatterField` and the orphaned docstring above `readSkill`; `readSkill`),
  `server/src/projekte/stand.ts` (`plaudNoteMeta` and the comment above it),
  `server/test/eingang/inbox.test.ts` (drop the `frontmatterValue` import and its one test),
  `docs/PROJECT.md` (layout block), `docs/eingang/IMPLEMENTATION.md` (three spots),
  `docs/kontext/IMPLEMENTATION.md` (one paragraph), `docs/projekte/IMPLEMENTATION.md` (the
  fourth-signal paragraph), `docs/changes/plaud-mcp/SPEC.md` (decision 14)
- Test: `server/test/shared/frontmatter.test.ts` (new); `server/test/aufgaben/plaud.test.ts`,
  `server/test/eingang/inbox.test.ts`, `server/test/kontext/skills.test.ts`,
  `server/test/projekte/stand.test.ts` (unchanged, the regression net)

**Interfaces:**

- Consumes: nothing new.
- Produces:

```ts
// server/src/shared/frontmatter.ts
/** The keys between the fences, first occurrence winning, values trimmed; and the text after
    the closing fence. No frontmatter, or an unclosed one: an empty map and the whole text. */
export function scanFrontmatter(text: string): {
  fields: ReadonlyMap<string, string>;
  body: string;
};
```

- [ ] **Step 1: Write the failing test.** `server/test/shared/frontmatter.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { scanFrontmatter } from "../../src/shared/frontmatter.js";

describe("scanFrontmatter", () => {
  it("reads each key up to its first ': ', keeping a value's own ': ' verbatim", () => {
    const { fields, body } = scanFrontmatter(
      "---\ntitel: 08-18 Besprechung: Q4\naufnahme: abc-1\n---\n# x\n",
    );
    expect(fields.get("titel")).toBe("08-18 Besprechung: Q4");
    expect(fields.get("aufnahme")).toBe("abc-1");
    expect(body).toBe("# x\n");
  });

  it("trims the value and ignores a line without ': '", () => {
    const { fields } = scanFrontmatter(
      "---\nprojekt: Bench \ntags: [a, b]\nkein trenner\n---\n",
    );
    expect(fields.get("projekt")).toBe("Bench");
    expect(fields.get("tags")).toBe("[a, b]");
    expect(fields.size).toBe(2);
  });

  it("keeps the first occurrence of a repeated key", () => {
    expect(
      scanFrontmatter("---\nk: eins\nk: zwei\n---\n").fields.get("k"),
    ).toBe("eins");
  });

  it("is empty with the whole text as body when there is no frontmatter", () => {
    const text = "# Just a heading\n\nNo frontmatter here.";
    expect(scanFrontmatter(text)).toEqual({ fields: new Map(), body: text });
  });

  it("is empty with the whole text as body when the fence never closes", () => {
    const text = "---\ntitel: offen\nBody right after.\n";
    expect(scanFrontmatter(text)).toEqual({ fields: new Map(), body: text });
  });

  it("only opens on a '---' that is line one, exactly", () => {
    expect(scanFrontmatter("\n---\ntitel: x\n---\n").fields.size).toBe(0);
    expect(scanFrontmatter("--- \ntitel: x\n---\n").fields.size).toBe(0);
  });
});
```

- [ ] **Step 2: Run it, expect failure.** `cd server && npx vitest run test/shared` - fails with
      "Cannot find module '../../src/shared/frontmatter.js'".

- [ ] **Step 3: Implement.** `server/src/shared/frontmatter.ts`:

```ts
/**
 * The "key: value" line scanner four modules used to carry a copy of each - aufgaben's Plaud
 * notes, eingang's inbox and fetched recordings, kontext's SKILL.md files, projekte's Plaud
 * notes. It reads the lines between an opening `---` (line one, exactly) and the next line that
 * is exactly `---`, splitting each at its first ": " - deliberately without YAML semantics: every
 * one of those inputs is machine-written, and a `titel:` or `description:` there can carry its
 * own ": " ("08-18 Besprechung: Q4"), which a YAML parser rejects as an incomplete mapping and a
 * line scanner reads as written. Human-written vault notes go through gray-matter in
 * vault/index/frontmatter.ts instead - a different input and a different tool.
 */
const FENCE = "---";
const SEPARATOR = ": ";

export function scanFrontmatter(text: string): {
  fields: ReadonlyMap<string, string>;
  body: string;
} {
  const lines = text.split("\n");
  const closing = lines[0] === FENCE ? lines.indexOf(FENCE, 1) : -1;
  if (closing === -1) return { fields: new Map(), body: text };
  const fields = new Map<string, string>();
  for (const line of lines.slice(1, closing)) {
    const sep = line.indexOf(SEPARATOR);
    if (sep === -1) continue;
    const key = line.slice(0, sep);
    // First occurrence wins. A machine-written note never repeats a key; two of the four copies
    // this replaces overwrote on repeat, two returned the first, and nothing depended on either.
    if (!fields.has(key))
      fields.set(key, line.slice(sep + SEPARATOR.length).trim());
  }
  return { fields, body: lines.slice(closing + 1).join("\n") };
}
```

- [ ] **Step 4: Run, expect pass.** `cd server && npx vitest run test/shared`.

- [ ] **Step 5: Move the four callers onto it.** Each keeps its exports and its tests; only the
      copy and its cross-naming comment go.

`server/src/aufgaben/plaud.ts` - delete the `Frontmatter` interface, `NO_FRONTMATTER`,
`splitFrontmatter` and its docstring; add
`import { scanFrontmatter } from "../shared/frontmatter.js";`; `parsePlaudNote` becomes:

```ts
/** A processed Plaud note - title/date/source from frontmatter, and its three tracked sections. */
export function parsePlaudNote(file: string, text: string): PlaudNote {
  const { fields, body } = scanFrontmatter(text);
  const lines = body.split("\n");
  return {
    file,
    title: fields.get("titel") ?? firstHeading(lines) ?? file,
    date: fields.get("datum") ?? null,
    source: fields.get("quelle") ?? null,
    items: parseItems(sectionLines(lines, "Arbeitsaufträge")),
    openQuestions: bullets(sectionLines(lines, "Offene Fragen")),
    direct: bullets(sectionLines(lines, "Direkt erledigbar")),
  };
}
```

`server/src/eingang/inbox.ts` - delete `frontmatterValue` and its docstring; add the import;

```ts
export function quelleOf(noteText: string): string | null {
  return scanFrontmatter(noteText).fields.get("quelle") ?? null;
}
```

and in `recordingIdsIn`:

```ts
const id = scanFrontmatter(text).fields.get("aufnahme");
if (id !== undefined) ids.add(id);
```

`server/src/kontext/skills.ts` - delete `frontmatterField` and the detached docstring that sits
between `cache` and `readSkill` (it described the deleted function); add the import;

```ts
function readSkill(skillDir: string): Skill | null {
  let text: string;
  try {
    text = readFileSync(path.join(skillDir, "SKILL.md"), "utf8");
  } catch {
    return null;
  }
  const { fields } = scanFrontmatter(text);
  const name = fields.get("name");
  const description = fields.get("description");
  if (name === undefined || description === undefined) return null;
  return { name, description };
}
```

`server/src/projekte/stand.ts` - replace the comment above `plaudNoteMeta` and the function:

```ts
/** `projekt` (lowercased) and `datum` (first ten characters) of a Plaud note's frontmatter, or
    null when either is missing. The slug is compared against the handoffs' checked slugs, never
    admitted on its own, so no rule is applied here. */
export function plaudNoteMeta(
  text: string,
): { projekt: string; datum: string } | null {
  const { fields } = scanFrontmatter(text);
  const projekt = fields.get("projekt")?.toLowerCase() ?? "";
  const datum = fields.get("datum")?.slice(0, 10) ?? "";
  return projekt !== "" && /^\d{4}-\d{2}-\d{2}$/.test(datum)
    ? { projekt, datum }
    : null;
}
```

`server/test/eingang/inbox.test.ts` - remove `frontmatterValue` from the import list and delete
the test `reads a key up to the first ': ' and ignores a titel with its own colon`; rename its
`describe` to `"localRecordingIds / plaudStatus"`.

- [ ] **Step 6: Run the four suites and the new one.**
      `cd server && npx vitest run test/shared test/aufgaben test/eingang test/kontext
test/projekte` - all pass, unchanged assertions.

- [ ] **Step 7: Prove there is one scanner.** `grep -rn 'indexOf(": ")' server/src` lists exactly
      `server/src/shared/frontmatter.ts`. (`eingang/schedule.ts`'s `stringAfterKey` reads XML,
      not `": "`, and is out of scope.)

- [ ] **Step 8: Docs.**
  - `docs/PROJECT.md`, the layout block: after the `server/src/zahlen/` line add
    `  src/shared/         the frontmatter line scanner - the only code the eight backends share`.
  - `docs/eingang/IMPLEMENTATION.md`: the bullet "**The `quelle` scan is a deliberate small
    duplicate ...**" becomes "**The `quelle` scan is `server/src/shared/frontmatter.ts`'s line
    scanner**, not YAML: a note's own `titel` can carry a colon a YAML parser would reject; the
    module's docstring carries the reasoning." The bullet "**`frontmatterValue(text, key)`
    generalises ...**" becomes "**Both scans read `scanFrontmatter(text).fields`** - `quelleOf`
    for `quelle`, `localRecordingIds` for `aufnahme`." The related-documents line about
    `splitFrontmatter`'s docstring now points at `server/src/shared/frontmatter.ts`.
  - `docs/kontext/IMPLEMENTATION.md`: the paragraph starting "`frontmatterField`'s frontmatter
    reader ..." becomes "`readSkill` reads `name` and `description` through
    `server/src/shared/frontmatter.ts`'s `scanFrontmatter`, not a YAML parser: a skill's own
    description can contain its own `": "` (`"Sammelt A: ein Beispiel"`), which a real YAML parser
    would reject as an incomplete mapping."
  - `docs/projekte/IMPLEMENTATION.md`: in the fourth-signal paragraph, "with a third, hand-rolled
    line scanner: the same tolerant colon-scan ... never import each other" becomes "through
    `server/src/shared/frontmatter.ts`'s `scanFrontmatter`".
  - `docs/changes/plaud-mcp/SPEC.md`, decision 14: append the line "Superseded by
    [changes/follow-ups/SPEC.md](../follow-ups/SPEC.md) decision 10 (2026-09-06): the scanner now
    lives once in `server/src/shared/frontmatter.ts`."

- [ ] **Step 9: Gate and commit.** `npm run format`, `npm run check` (no e2e: no web, e2e, app.ts,
      index.ts or fixture change). Commit:
      `refactor: one shared frontmatter scanner on the server`.

---

### Task 2: The slug rule and the derived column

**Files:**

- Modify: `server/src/vault/index/frontmatter.ts` (add `projektOf`), `server/src/vault/db.ts`
  (schema, `migrate`, `NoteRow`), `server/src/vault/index/indexer.ts` (`indexNote`'s INSERT),
  `docs/vault/IMPLEMENTATION.md`
- Test: `server/test/vault/frontmatter.test.ts`, `server/test/vault/db.test.ts`,
  `server/test/vault/indexer.test.ts` (extend)

**Interfaces:**

- Consumes: nothing from Task 1.
- Produces:

```ts
// server/src/vault/index/frontmatter.ts
/** `projekt:` as the checked slug, or null: absent, not a string, or failing the slug rule after
    trimming and lowercasing. */
export function projektOf(frontmatter: Record<string, unknown>): string | null;

// server/src/vault/db.ts - notes gains `projekt TEXT` (nullable); NoteRow gains
export interface NoteRow {
  /* ...existing fields... */
  projekt: string | null;
}
```

- [ ] **Step 1: Failing tests.** `server/test/vault/frontmatter.test.ts` - add `projektOf` to the
      import and:

```ts
describe("projektOf", () => {
  it("keeps a slug of lowercase letters, digits and single hyphens", () => {
    expect(projektOf({ projekt: "bench" })).toBe("bench");
    expect(projektOf({ projekt: "shoesplease-klaviyo" })).toBe(
      "shoesplease-klaviyo",
    );
    expect(projektOf({ projekt: "q4-2026" })).toBe("q4-2026");
  });

  it("trims and lowercases before checking", () => {
    expect(projektOf({ projekt: "  Bench " })).toBe("bench");
  });

  it("is null for anything outside the alphabet", () => {
    for (const bad of [
      "Nicht Gültig!",
      "zwei worte",
      "-vorn",
      "hinten-",
      "doppel--strich",
      "ümlaut",
      "",
      "   ",
    ])
      expect(projektOf({ projekt: bad })).toBeNull();
  });

  it("is null when the key is absent or not a string", () => {
    expect(projektOf({})).toBeNull();
    expect(projektOf({ projekt: 42 })).toBeNull();
    expect(projektOf({ projekt: ["bench"] })).toBeNull();
  });
});
```

`server/test/vault/db.test.ts` - add `mkdtempSync` to the `node:fs` import, `import { tmpdir }
from "node:os";`, `import Database from "better-sqlite3";` and:

```ts
it("adds the projekt column to an index file created before it existed", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "bench-vault-migrate-"));
  const file = path.join(dir, "vault.sqlite");
  const old = new Database(file);
  old.exec(
    "CREATE TABLE notes (path TEXT PRIMARY KEY, title TEXT NOT NULL, folder TEXT NOT NULL, frontmatter TEXT NOT NULL DEFAULT '{}', body TEXT NOT NULL, mtime INTEGER NOT NULL, size INTEGER NOT NULL)",
  );
  old.close();
  const db = openDb(file);
  const columns = (db.prepare("PRAGMA table_info(notes)").all() as Name[]).map(
    (c) => c.name,
  );
  expect(columns).toContain("projekt");
  db.close();
  rmSync(dir, { recursive: true, force: true });
});
```

`server/test/vault/indexer.test.ts` - inside `describe("indexAll")`:

```ts
it("derives projekt from a checked, normalised slug and leaves it null otherwise", () => {
  const handoffs = path.join(dir, "50_Workflow", "Handoffs");
  writeFileSync(
    path.join(handoffs, "Handoff_gross.md"),
    "---\nprojekt:  Gross-Schreibung \n---\n# x\n",
  );
  writeFileSync(
    path.join(handoffs, "Handoff_kaputt.md"),
    "---\nprojekt: Nicht Gültig!\n---\n# x\n",
  );
  indexAll(db, dir);
  const projektAt = (p: string) =>
    (
      db.prepare("SELECT projekt FROM notes WHERE path = ?").get(p) as {
        projekt: string | null;
      }
    ).projekt;
  expect(projektAt("50_Workflow/Handoffs/Handoff_hafen.md")).toBe("hafen");
  expect(projektAt("50_Workflow/Handoffs/Handoff_gross.md")).toBe(
    "gross-schreibung",
  );
  expect(projektAt("50_Workflow/Handoffs/Handoff_kaputt.md")).toBeNull();
  expect(projektAt("00_Index/Start.md")).toBeNull();
});
```

- [ ] **Step 2: Run, expect failure.** `cd server && npx vitest run test/vault/frontmatter.test.ts
test/vault/db.test.ts test/vault/indexer.test.ts` - `projektOf` is not exported; the
      migration test finds no `projekt` column; the indexer test reads `undefined`.

- [ ] **Step 3: Implement.** `server/src/vault/index/frontmatter.ts`, after `tagsOf`:

```ts
// A slug's alphabet: lowercase letters, digits and single hyphens between them. It goes into a
// `claude -p` prompt, a select option, an equality against a Plaud note's `projekt:` and a
// heading unchanged, and this alphabet passes through every one of those as written.
const PROJEKT_SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** `projekt:` as the checked slug, or null: absent, not a string, or failing the rule after
    trimming and lowercasing - the normalisation projekte's readers applied by hand before this
    column existed, kept so `projekt: Bench` stays the project `bench`. */
export function projektOf(frontmatter: Record<string, unknown>): string | null {
  const raw = frontmatter.projekt;
  if (typeof raw !== "string") return null;
  const slug = raw.trim().toLowerCase();
  return PROJEKT_SLUG.test(slug) ? slug : null;
}
```

`server/src/vault/db.ts` - in `SCHEMA`, the `notes` table gains `projekt TEXT,` after
`frontmatter`; `NoteRow` gains `projekt: string | null;`; add and call:

```ts
/** An index file created before the projekt column existed gets it added in place. No backfill:
    indexAll runs at every start and rewrites every row, which fills it. */
function migrate(db: Database.Database): void {
  const columns = (
    db.prepare("PRAGMA table_info(notes)").all() as { name: string }[]
  ).map((c) => c.name);
  if (!columns.includes("projekt"))
    db.exec("ALTER TABLE notes ADD COLUMN projekt TEXT");
}

export function openDb(dbPath: string): Database.Database {
  if (dbPath !== ":memory:")
    mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  migrate(db);
  return db;
}
```

Also extend the module docstring's column list if it names the columns; the schema comment at the
top stays.

`server/src/vault/index/indexer.ts` - import `projektOf` beside `splitNote`; the INSERT becomes:

```ts
db.prepare(
  "INSERT INTO notes (path, title, folder, frontmatter, projekt, body, mtime, size) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
).run(
  relPath,
  titleOf(relPath),
  folder,
  JSON.stringify(frontmatter),
  projektOf(frontmatter),
  body,
  Math.round(stat.mtimeMs),
  stat.size,
);
```

- [ ] **Step 4: Run, expect pass.** The three files, then `cd server && npx vitest run test/vault
test/projekte test/aufgaben test/kontext` - every suite that opens a vault database still
      passes (the column is nullable; nothing reads it yet).

- [ ] **Step 5: Docs.** `docs/vault/IMPLEMENTATION.md`: the `notes` column list (line ~18) gains
      "`projekt` (the checked handoff slug, or `NULL` - see below)"; the indexer section gains a
      bullet:

  "- **`projekt` is a derived column, the one place the slug rule lives.** `projektOf`
  (`index/frontmatter.ts`) trims and lowercases a string `projekt:` and keeps it only when it
  matches `^[a-z0-9]+(-[a-z0-9]+)*$`; everything else is `NULL`. Projekte's readers select
  this column rather than the frontmatter JSON, and Eingang's project fence inherits it through
  the slug list Projekte hands the root - so an apostrophe, a space or an umlaut in a handoff's
  `projekt:` is refused once, here, not three times downstream. An index file from before the
  column gets it through `migrate` in `db.ts`; the next `indexAll` fills it."

- [ ] **Step 6: Gate and commit.** `npm run format`, `npm run check`; e2e not required (no web,
      e2e, app.ts, index.ts or fixture change - the fixture vault is read, not changed). Commit:
      `feat: the handoff slug rule as a derived vault column`.

---

### Task 3: Projekte reads the column

**Files:**

- Modify: `server/src/projekte/handoffs.ts` (`NoteRow`, the SELECT, the `projekt` branch),
  `server/src/projekte/stand.ts` (`TaskRow`, `openTaskCounts`),
  `server/test/projekte/handoffs.test.ts`, `server/test/projekte/stand.test.ts`,
  `server/test/projekte/routes.test.ts` (the three insert helpers, per plan decision 1),
  `docs/projekte/IMPLEMENTATION.md`
- Test: the three suites above (extend)

**Interfaces:**

- Consumes: `projektOf` and the `notes.projekt` column from Task 2.
- Produces: no signature change. `vaultHandoffs(vaultDb)` and `projektStand(vaultDb, rows,
notizenDir)` keep their shapes; `warnings` gains the line `Ungültiger Slug in <file>`.

- [ ] **Step 1: Failing tests.** In `handoffs.test.ts`, `stand.test.ts` and `routes.test.ts`
      (projekte), the insert helpers fill the column:

```ts
import { projektOf } from "../../src/vault/index/frontmatter.js";
// ...
const insert = db.prepare(
  "INSERT INTO notes (path, title, folder, frontmatter, projekt, body, mtime, size) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
);
for (const note of notes) {
  insert.run(
    note.path,
    note.title ?? path.posix.basename(note.path, ".md"),
    path.posix.dirname(note.path),
    JSON.stringify(note.frontmatter),
    projektOf(note.frontmatter),
    note.body ?? "",
    0,
    0,
  );
}
```

(`routes.test.ts`'s `insertHandoff` the same, with its fixed path and title.) Then add to
`handoffs.test.ts`'s `vaultHandoffs` describe:

```ts
it("warns about a projekt that fails the slug rule and drops the handoff", () => {
  const db = buildVault([
    {
      path: `${HANDOFF}/Handoff_kaputt.md`,
      frontmatter: { projekt: "Nicht Gültig!" },
    },
    { path: `${HANDOFF}/Handoff_ok.md`, frontmatter: { projekt: " Ok " } },
  ]);
  const { handoffs, warnings } = vaultHandoffs(db);
  expect(handoffs.map((h) => h.slug)).toEqual(["ok"]);
  expect(warnings).toEqual(["Ungültiger Slug in Handoff_kaputt.md"]);
});
```

and to `stand.test.ts`, beside the existing open-task cases (using the file's `buildVault`,
`handoff` and `insertTask` helpers as the neighbouring tests do):

```ts
it("counts a task under a note whose projekt normalises to the slug, not one that fails the rule", () => {
  const db = buildVault([
    handoff("bench"),
    { path: "30_Projekte/A.md", frontmatter: { projekt: " Bench " } },
    { path: "30_Projekte/B.md", frontmatter: { projekt: "kein slug!" } },
  ]);
  insertTask(db, "30_Projekte/A.md", 1, 0);
  insertTask(db, "30_Projekte/B.md", 1, 0);
  const reply = projektStand(db, [], null);
  expect(reply.projekte[0].signals.offeneTasks).toBe(1);
});
```

(`insertTask(db, notePath, line, done)` is the file's existing helper; `done` is `0` or `1`.)

- [ ] **Step 2: Run, expect failure.** `cd server && npx vitest run test/projekte` - the new
      handoffs case reports `Handoff ohne projekt` or lists the bad handoff; the stand case
      counts 2.

- [ ] **Step 3: Implement.** `server/src/projekte/handoffs.ts`:

```ts
interface NoteRow {
  path: string;
  frontmatter: string;
  projekt: string | null;
  body: string;
}
// ...
  const rows = vaultDb
    .prepare(
      "SELECT path, frontmatter, projekt, body FROM notes WHERE folder = ? ORDER BY path",
    )
    .all(HANDOFF_FOLDER) as NoteRow[];
  // ...
  for (const row of rows) {
    const file = path.posix.basename(row.path);
    const frontmatter = JSON.parse(row.frontmatter) as Record<string, unknown>;
    if (row.projekt === null) {
      // The indexer left the column empty (vault/index/frontmatter.ts's projektOf) for one of
      // two reasons a person tells apart: nothing there, or something the slug rule refused.
      const raw = frontmatter.projekt;
      warnings.push(
        typeof raw !== "string" || raw.trim() === ""
          ? `Handoff ohne projekt: ${file}`
          : `Ungültiger Slug in ${file}`,
      );
      continue;
    }
    const slug = row.projekt;
    // First note path wins, like couple.ts's dedupe of duplicate project paths.
    if (seen.has(slug)) {
```

(the rest of the loop unchanged; `projekt.trim().toLowerCase()` is gone.)

`server/src/projekte/stand.ts`:

```ts
interface TaskRow {
  path: string;
  projekt: string;
}

function openTaskCounts(vaultDb: Database.Database): Map<string, number> {
  const rows = vaultDb
    .prepare(
      "SELECT t.path AS path, n.projekt AS projekt FROM tasks t JOIN notes n ON n.path = t.path WHERE t.done = 0 AND n.projekt IS NOT NULL",
    )
    .all() as TaskRow[];
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (row.path.split("/").some((segment) => EXCLUDED_FOLDERS.has(segment)))
      continue;
    counts.set(row.projekt, (counts.get(row.projekt) ?? 0) + 1);
  }
  return counts;
}
```

- [ ] **Step 4: Run, expect pass.** `cd server && npx vitest run test/projekte test/eingang` -
      Eingang's fence tests still pass (they stub `projektSlugs`).

- [ ] **Step 5: Docs.** `docs/projekte/IMPLEMENTATION.md`: the `slug` row of the handoff table
      becomes "the index's `projekt` column - frontmatter `projekt`, trimmed, lowercased and
      checked against `^[a-z0-9]+(-[a-z0-9]+)*$` by the vault indexer
      (`vault/index/frontmatter.ts`'s `projektOf`); the card's own heading". The warnings paragraph
      gains, after the `Handoff ohne projekt` sentence: "a `projekt` that is there but failed the
      slug rule becomes `Ungültiger Slug in <file>` and is dropped the same way". In the four
      signals sentence, `offeneTasks` reads "open vault tasks whose _containing note's_ `projekt`
      column equals the slug".

- [ ] **Step 6: Gate and commit.** `npm run format`, `npm run check`; no e2e needed. Commit:
      `refactor: projekte reads the checked slug from the index`.

---

### Task 4: The Regeln tab without handoffs

**Files:**

- Modify: `server/src/kontext/routes.ts`, `server/test/kontext/routes.test.ts` (`buildVault`),
  `e2e/kontext/kontext.spec.ts`, `docs/kontext/IMPLEMENTATION.md`
- Test: `server/test/kontext/routes.test.ts` (the existing `GET /api/kontext/regeln` case turns
  red, then green), `e2e/kontext/kontext.spec.ts` (extend)

**Interfaces:**

- Consumes: nothing new.
- Produces: `GET /api/kontext/regeln`'s `vault` array no longer contains paths under
  `50_Workflow/Handoffs/`. Shape unchanged.

- [ ] **Step 1: Failing test.** In `server/test/kontext/routes.test.ts`'s `buildVault`, after the
      `50_Workflow/regeln.md` insert:

```ts
insert.run(
  "50_Workflow/Handoffs/Handoff_hafen.md",
  "Handoff_hafen",
  "50_Workflow/Handoffs",
  "{}",
  "ein handoff, keine regel",
  0,
  0,
);
```

The existing `GET /api/kontext/regeln` test asserts the exact `vault` array, so nothing else
changes there. In `e2e/kontext/kontext.spec.ts`, after the `Testing` link assertion:

```ts
// The two fixture handoffs sit under 50_Workflow/Handoffs/ and are not rules.
await expect(
  page.getByRole("link", { name: "Handoff_leuchtturm", exact: true }),
).toHaveCount(0);
await expect(
  page.getByRole("link", { name: "Handoff_hafen", exact: true }),
).toHaveCount(0);
```

- [ ] **Step 2: Run, expect failure.** `cd server && npx vitest run test/kontext` - the regeln
      test's `vault` array now has two entries. (The e2e assertion is run in Step 4.)

- [ ] **Step 3: Implement.** `server/src/kontext/routes.ts`:

```ts
const PROFIL_PREFIX = "10_Profile/";
const WORKFLOW_PREFIX = "50_Workflow/";
// Handoffs live under 50_Workflow/ so Aufgaben never counts their checkboxes, but they are not
// rules. Mirrored by hand from projekte/handoffs.ts's HANDOFF_FOLDER, as vault/routes/tasks.ts
// and aufgaben/routes.ts already do: the apps never import each other.
const HANDOFFS_PREFIX = "50_Workflow/Handoffs/";
const STAND_PATH = "00_Index/Session_Context.md";
// ...
router.get("/regeln", (_req, res) => {
  res.json({
    claude: readRules(ctx.claudeDir),
    vault: vaultNotesUnder(ctx.vaultDb, WORKFLOW_PREFIX).filter(
      (note) => !note.path.startsWith(HANDOFFS_PREFIX),
    ),
  });
});
```

- [ ] **Step 4: Run, expect pass.** `cd server && npx vitest run test/kontext`, then
      `npx playwright test e2e/kontext --retries=0`.

- [ ] **Step 5: Docs.** `docs/kontext/IMPLEMENTATION.md`: the `GET /regeln` row becomes
      "`{ claude, vault }` - `~/.claude/rules` and the vault's `50_Workflow/`, minus
      `50_Workflow/Handoffs/`"; below the routes table add one sentence: "Handoffs sit under
      `50_Workflow/` only so Aufgaben never counts their checkboxes (see `/handoff`'s own note);
      they are project state, not rules, so `/regeln` filters that one subfolder by a mirrored
      constant."

- [ ] **Step 6: Gate and commit.** `npm run format`, `npm run check`, `npm run e2e` (an e2e spec
      changed). Commit: `fix: the Kontext Regeln tab no longer lists handoffs`.

---

### Task 5: The error boundary in every document

**Files:**

- Create: `web/src/shared/ErrorBoundary.tsx`, `web/src/shared/crash.css`,
  `web/src/shared/ErrorBoundary.test.tsx`
- Modify: `web/src/shared/BenchNav.tsx` (export `AppKey`), the nine entry points
  `web/src/{home,vault,projekte,aufgaben,eingang,kontext,zahlen,crm,rolodex}/main.tsx`,
  `docs/PROJECT.md` (layout line and the "One shared module" decision), `e2e/EXPLORATORY.md`
  (Cross-app)
- Test: `web/src/shared/ErrorBoundary.test.tsx` (new); the e2e suite as the regression net for
  the nine entry points

**Interfaces:**

- Consumes: `BenchNav` and its `AppKey`.
- Produces:

```tsx
// web/src/shared/BenchNav.tsx
export type AppKey =
  | "home"
  | "vault"
  | "projekte"
  | "aufgaben"
  | "eingang"
  | "kontext"
  | "zahlen"
  | "crm"
  | "rolodex";

// web/src/shared/ErrorBoundary.tsx
export default class ErrorBoundary extends Component<
  { active: AppKey; children: ReactNode },
  { message: string | null }
> {}
```

- [ ] **Step 1: Failing test.** `web/src/shared/ErrorBoundary.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import ErrorBoundary from "./ErrorBoundary";

function Bomb(): never {
  throw new Error("Intl kann NaN nicht");
}

describe("ErrorBoundary", () => {
  it("renders its children while nothing throws", () => {
    render(
      <ErrorBoundary active="eingang">
        <p>alles gut</p>
      </ErrorBoundary>,
    );
    expect(screen.getByText("alles gut")).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Diese Seite ist abgestürzt." }),
    ).not.toBeInTheDocument();
  });

  it("replaces a throwing tree with the strip, the message, the error text and a reload button", () => {
    // React reports every caught render error on console.error; expect the call, do not print it.
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    render(
      <ErrorBoundary active="eingang">
        <Bomb />
      </ErrorBoundary>,
    );
    const nav = within(screen.getByRole("navigation", { name: "Primary" }));
    expect(
      nav.getByRole("link", { name: "Eingang" }).getAttribute("aria-current"),
    ).toBe("page");
    expect(
      screen.getByRole("heading", { name: "Diese Seite ist abgestürzt." }),
    ).toBeInTheDocument();
    expect(screen.getByText("Intl kann NaN nicht")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Neu laden" }),
    ).toBeInTheDocument();
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
```

- [ ] **Step 2: Run, expect failure.** `cd web && npx vitest run src/shared` - the module does not
      exist.

- [ ] **Step 3: Implement.** `web/src/shared/BenchNav.tsx`: `type AppKey =` becomes
      `export type AppKey =`. `web/src/shared/ErrorBoundary.tsx`:

```tsx
/**
 * The one thing every document renders above its own App: a boundary that turns a render-time
 * throw into a page that still carries the Bench strip, says what happened and offers a reload -
 * instead of React unmounting the whole tree to a white page, which is what Eingang did when one
 * recording's start was blank. A class, because React 19 still exposes getDerivedStateFromError
 * to classes only. It catches render errors and nothing else: a rejected fetch or a throwing
 * event handler never reaches a boundary, by React's own contract.
 */
import { Component, type ReactNode } from "react";
import BenchNav, { type AppKey } from "./BenchNav";
import "./crash.css";

interface Props {
  active: AppKey;
  children: ReactNode;
}

interface State {
  message: string | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { message: null };

  // React hands over whatever was thrown, Error or not; the message is what the page shows.
  static getDerivedStateFromError(thrown: unknown): State {
    return {
      message: thrown instanceof Error ? thrown.message : String(thrown),
    };
  }

  render(): ReactNode {
    if (this.state.message === null) return this.props.children;
    return (
      <>
        <BenchNav active={this.props.active} />
        <main className="bench-crash">
          <h1 className="bench-crash-title">Diese Seite ist abgestürzt.</h1>
          <p className="bench-crash-text">
            Die Bench-Leiste oben funktioniert weiter. Der Fehler:
          </p>
          <pre className="bench-crash-error">{this.state.message}</pre>
          <button
            type="button"
            className="bench-crash-reload"
            onClick={() => window.location.reload()}
          >
            Neu laden
          </button>
        </main>
      </>
    );
  }
}
```

`web/src/shared/crash.css`:

```css
/**
 * The crash screen ErrorBoundary renders over any of the nine documents. Like nav.css, every
 * class is prefixed and every value literal: the host stylesheet may be any of nine, and the
 * component that threw may be the one that carried its palette.
 */

.bench-crash {
  box-sizing: border-box;
  max-width: 720px;
  margin: 0 auto;
  padding: 48px 24px;
  font-family:
    -apple-system, BlinkMacSystemFont, "Helvetica Neue", system-ui, sans-serif;
  font-size: 14px;
  line-height: 1.5;
  color: #1c2128;
}

[data-theme="dark"] .bench-crash {
  color: #e6e9ee;
}

.bench-crash-title {
  margin: 0 0 12px;
  font-size: 20px;
  font-weight: 700;
}

.bench-crash-text {
  margin: 0 0 16px;
  color: #5b636e;
}

[data-theme="dark"] .bench-crash-text {
  color: #98a1ad;
}

.bench-crash-error {
  margin: 0 0 20px;
  padding: 12px 14px;
  overflow-x: auto;
  border: 1px solid #e3e6ea;
  border-radius: 6px;
  background: #f0f2f5;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 13px;
  white-space: pre-wrap;
}

[data-theme="dark"] .bench-crash-error {
  border-color: #000000;
  background: #272d36;
}

.bench-crash-reload {
  height: 32px;
  padding: 0 14px;
  border: 1px solid #c9ced6;
  border-radius: 6px;
  background: #ffffff;
  color: #1c2128;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}

.bench-crash-reload:hover {
  background: #f0f2f5;
}

[data-theme="dark"] .bench-crash-reload {
  border-color: #3a414b;
  background: #272d36;
  color: #ffffff;
}

[data-theme="dark"] .bench-crash-reload:hover {
  background: #313842;
}
```

The nine entry points. The six plain ones (`home`, `projekte`, `aufgaben`, `eingang`, `kontext`,
`zahlen`), each with its own key:

```tsx
import { createRoot } from "react-dom/client";
import App from "./App";
import ErrorBoundary from "../shared/ErrorBoundary";
import { initTheme } from "../shared/theme";
import "./styles.css";

initTheme();

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary active="eingang">
    <App />
  </ErrorBoundary>,
);
```

`vault` and `rolodex`, the boundary outside the router:

```tsx
createRoot(document.getElementById("root")!).render(
  <ErrorBoundary active="vault">
    <BrowserRouter basename="/vault">
      <App />
    </BrowserRouter>
  </ErrorBoundary>,
);
```

`crm`, outside `StrictMode` too:

```tsx
createRoot(document.getElementById("root")!).render(
  <ErrorBoundary active="crm">
    <StrictMode>
      <BrowserRouter basename="/crm">
        <App />
      </BrowserRouter>
    </StrictMode>
  </ErrorBoundary>,
);
```

- [ ] **Step 4: Run, expect pass.** `cd web && npx vitest run src/shared`; then
      `grep -L ErrorBoundary web/src/*/main.tsx` prints nothing (every entry point wraps).

- [ ] **Step 5: See it.** With no Bench server running on 8100/8101:
      `BENCH_DOTENV=off DATA_DIR=<scratch> npm run dev`, open `http://localhost:8101/eingang/`,
      temporarily add `throw new Error("Probe");` at the top of one Eingang panel component's
      render, confirm the strip, the heading, `Probe` and `Neu laden`; take one screenshot per
      theme into `.superpowers/sdd/PLAN-follow-ups/` (untracked); **revert the throw** and confirm
      `git status` shows no change under `web/src/eingang/`. Stop the server before the gate.

- [ ] **Step 6: Docs.** `docs/PROJECT.md`: the layout line for `src/shared/` becomes "the
      navigation strip, the theme and the error boundary - the only code all nine documents
      share"; in the "One shared module" decision, after the sentence ending "...chrome above the
      app, not part of it.", add: "The error boundary (`ErrorBoundary.tsx`, `crash.css`) follows
      the same rule for the same reason: when it renders, the app's own stylesheet may be the thing
      that broke." `e2e/EXPLORATORY.md`, Cross-app, a new bullet: "**A render error shows the crash
      screen, not a white page.** Every document wraps its App in the shared `ErrorBoundary`; the
      suite cannot make a page throw on purpose, so the unit test on the boundary is the proof and
      the by-hand check is a temporary `throw` in one component under the sample world: the strip
      stays, `Diese Seite ist abgestürzt.` and the message render, `Neu laden` restores the page."

- [ ] **Step 7: Gate and commit.** `npm run format`, `npm run check`, `npm run e2e` (web changed;
      the smoke spec's console-error check over all nine documents is the regression net).
      Commit: `feat: an error boundary with the Bench strip in every document`.

---

### Task 6: Coverage table, final gate and the criteria report

Controller-led with a short implementer dispatch for the docs commit if preferred.

**Files:**

- Modify: `docs/CONTROLS.md` (the coverage table)
- Create (untracked, in the workspace): `.superpowers/sdd/PLAN-follow-ups/criteria-report.md`

- [ ] **Step 1: Coverage.** `npm run coverage`; rewrite the CONTROLS.md table from the report -
      the `server/src` row, a new `server/src/shared` row, the `web/src/shared` row if the tool
      prints one, and the web overall figure.
- [ ] **Step 2: Final gate at the branch head**, each in the foreground with its own exit code:
      `npm run format`, `npm run check`, `npm run e2e`.
- [ ] **Step 3: Criteria.** Against the spec's five success criteria:
  1. the boundary: unit test green, `grep -L ErrorBoundary web/src/*/main.tsx` empty, the Task 5
     screenshots;
  2. the slug rule: the unit tests, plus one read of the real machine - with the real `.env`,
     `npm run dev`, `curl -s localhost:8100/api/projekte/stand | jq '{n: (.projekte|length), w: .warnings}'`
     shows the same project count and warnings as `main` did (run the same on a `main` worktree
     or note the figures before Task 2 lands: expected 8 projects). Counts only in the report.
     Stop the server afterwards;
  3. the Regeln tab: the e2e assertion;
  4. one scanner: the grep;
  5. the gate: exit codes.
- [ ] **Step 4: Commit** `docs: the follow-ups coverage figures` and write the ledger's closing
      entry. Then the final whole-branch review (opus), its fix wave and scoped re-review, as the
      house does.

---

## Self-review

- **Spec coverage.** Decisions 3, 4/7, 5, 6/9/10 map to Tasks 5, 2+3, 4, 1; decision 8 is
  Task 1's `plaudNoteMeta`; every Web/Server/Docs bullet in the spec has a step above; the five
  success criteria are Task 6 Step 3. The `/handoff` skill sentence outside the repo is not a
  task - it is the user's, on their go, and Task 6's report reminds them.
- **Placeholders.** None: every code step carries the code, every doc step the sentence.
- **Type consistency.** `scanFrontmatter` returns `{ fields: ReadonlyMap<string, string>; body:
string }` everywhere it is used; `projektOf(frontmatter: Record<string, unknown>): string |
null` in Tasks 2 and 3; `NoteRow.projekt: string | null` in `vault/db.ts` and the local
  `NoteRow` in `handoffs.ts`; `AppKey` exported from `BenchNav.tsx` and consumed by
  `ErrorBoundary.tsx`.
