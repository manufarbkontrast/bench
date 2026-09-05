import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import App from "./App";
import { api } from "./api";
import type {
  HandoffRow,
  InboxFile,
  Kpi,
  Project,
  Task,
  ZahlenReply,
} from "./types";

function task(overrides: Partial<Task> = {}): Task {
  return {
    path: "30_Projekte/Leuchtturm/Leuchtturm.md",
    line: 8,
    text: "Spezifikation fertigstellen",
    done: false,
    due: null,
    doneAt: null,
    ...overrides,
  };
}

function project(overrides: Partial<Project> = {}): Project {
  return {
    path: "/code/leuchtturm",
    name: "leuchtturm",
    dirty: 0,
    ahead: null,
    behind: null,
    lastCommitAt: null,
    ...overrides,
  };
}

function kpi(overrides: Partial<Kpi> = {}): Kpi {
  return {
    kennzahl: "Umsatz gesamt",
    vergleich: "51.200 €",
    aktuell: "54.300 €",
    veraenderung: "+6,1 %",
    ...overrides,
  };
}

// Drawn from server/src/eingang/fixture/controlling/2026-08-15-zwischenstand/zusammenfassung.md,
// the same sample fixture cockpit.spec.ts's e2e run reads - see that file's own derivation
// comment.
const zahlenFixture: ZahlenReply = {
  run: { stichtag: "2026-08-15", modus: "zwischenstand" },
  kpis: [
    kpi(),
    kpi({
      kennzahl: "Google-ROAS",
      vergleich: "3,8",
      aktuell: "4,2",
      veraenderung: "+0,4",
    }),
  ],
  breakEven: [
    'Kampagne "Sommeraktion Nord" liegt seit zwei Wochen unter dem Break-even.',
  ],
};

// The sample fixture world server/src/eingang/fixture/inbox: the werkstattrunde transcript and
// the m4a recording are unprocessed, the Hafenrunde transcript reconciles to a note - see
// server/test/eingang/routes.test.ts for the same three files.
const inboxFixture: InboxFile[] = [
  { status: "unverarbeitet" },
  { status: "unverarbeitet" },
  { status: "notiz_vorhanden" },
];

const DAY_MS = 24 * 60 * 60 * 1000;

function inWeek(days: number): string {
  return new Date(Date.now() + days * DAY_MS).toISOString().slice(0, 10);
}

/** The local calendar day `days` before now, in App.tsx's own YYYY-MM-DD shape - not
    toISOString, which would drift a day west of Greenwich here just as it would there. */
function daysAgo(days: number): string {
  const d = new Date(Date.now() - days * DAY_MS);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function handoffRow(overrides: Partial<HandoffRow> = {}): HandoffRow {
  return {
    slug: "leuchtturm",
    title: "Leuchtturm",
    updated: daysAgo(0),
    missingRepos: [],
    signals: { veraltet: false, dirtyRepos: 0, offeneTasks: 0 },
    ...overrides,
  };
}

const sessionBody = [
  "# Session-Kontext",
  "",
  "Rollierender Stand des Beispiel-Vaults.",
  "",
  "## Hier weitermachen — Stand 2026-08-19",
  "",
  "Der Leuchtturm-Prototyp wartet auf den Test im Hafen.",
  "",
  "## Notizen",
  "",
  "Nichts weiter.",
].join("\n");

vi.mock("./api", () => ({
  api: {
    tasks: vi.fn(),
    warmProjects: vi.fn(),
    stand: vi.fn(),
    inbox: vi.fn(),
    sessionNote: vi.fn(),
    zahlenLast: vi.fn(),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  // Resolved by default so every test but the ordering test below can ignore it; that one test
  // overrides this with its own manually controlled promise.
  vi.mocked(api.warmProjects).mockResolvedValue(undefined);
});

function panel(name: string): HTMLElement {
  const heading = screen.getByRole("heading", { name });
  const section = heading.closest("section");
  if (!section) throw new Error(`no section for heading ${name}`);
  return section;
}

describe("Cockpit", () => {
  it("renders all seven panels in order, filled from the fixtures", async () => {
    vi.mocked(api.tasks).mockResolvedValue([
      task({ text: "Spezifikation fertigstellen", due: "2020-01-01" }),
      task({ text: "Kabel bestellen", due: inWeek(2) }),
      task({
        text: "Test durchgeführt",
        done: true,
        doneAt: "2026-08-20",
      }),
      task({ text: "Ohne Datum erledigt", done: true, doneAt: null }),
    ]);
    vi.mocked(api.stand).mockResolvedValue({
      projekte: [],
      ohneProjekt: [
        project({ name: "leuchtturm", dirty: 2, ahead: 1, behind: 0 }),
        project({
          name: "frisch-committed",
          lastCommitAt: Date.now() - DAY_MS,
        }),
        project({
          name: "ruhig-und-alt",
          lastCommitAt: Date.now() - 30 * DAY_MS,
        }),
      ],
    });
    vi.mocked(api.inbox).mockResolvedValue(inboxFixture);
    vi.mocked(api.sessionNote).mockResolvedValue({ body: sessionBody });
    vi.mocked(api.zahlenLast).mockResolvedValue(zahlenFixture);

    render(<App />);
    await screen.findByText("Spezifikation fertigstellen");

    const headings = screen
      .getAllByRole("heading", { level: 2 })
      .map((h) => h.textContent);
    expect(headings).toEqual([
      "Überfällig",
      "Diese Woche",
      "Eingang",
      "Projekte in Bewegung",
      "Hier weitermachen",
      "Zahlen",
      "Zuletzt erledigt",
    ]);

    const uberfaellig = panel("Überfällig");
    expect(
      within(uberfaellig).getByText("Spezifikation fertigstellen"),
    ).toBeInTheDocument();
    expect(within(uberfaellig).getByText(/^Fällig /)).toBeInTheDocument();

    const woche = panel("Diese Woche");
    expect(within(woche).getByText("Kabel bestellen")).toBeInTheDocument();

    const eingang = panel("Eingang");
    expect(within(eingang).getByText("2 unverarbeitet")).toBeInTheDocument();
    expect(
      within(eingang).getByRole("link", { name: "Verarbeiten" }),
    ).toHaveAttribute("href", "/eingang/");

    const bewegung = panel("Projekte in Bewegung");
    expect(within(bewegung).getByText("leuchtturm")).toBeInTheDocument();
    expect(
      within(bewegung).getByText("2 geändert · 1 voraus"),
    ).toBeInTheDocument();
    expect(within(bewegung).getByText("frisch-committed")).toBeInTheDocument();
    expect(
      within(bewegung).queryByText("ruhig-und-alt"),
    ).not.toBeInTheDocument();

    const weitermachen = panel("Hier weitermachen");
    expect(
      within(weitermachen).getByText("Hier weitermachen — Stand 2026-08-19"),
    ).toBeInTheDocument();
    expect(
      within(weitermachen).getByText(
        "Der Leuchtturm-Prototyp wartet auf den Test im Hafen.",
      ),
    ).toBeInTheDocument();
    expect(
      within(weitermachen).getByRole("link", { name: "Im Vault öffnen" }),
    ).toHaveAttribute("href", "/vault/n/00_Index/Session_Context.md");

    const zahlen = panel("Zahlen");
    expect(
      within(zahlen).getByText("Zwischenstand vom 15.08.2026"),
    ).toBeInTheDocument();
    expect(
      within(zahlen).getByText("Umsatz gesamt: 54.300 €"),
    ).toBeInTheDocument();
    expect(within(zahlen).getByText("Google-ROAS: 4,2")).toBeInTheDocument();
    expect(
      within(zahlen).getByText("Kampagnen unter Break-even: 1"),
    ).toBeInTheDocument();
    expect(
      within(zahlen).getByRole("link", { name: "Zur Zahlen-App" }),
    ).toHaveAttribute("href", "/zahlen/");

    const erledigt = panel("Zuletzt erledigt");
    expect(within(erledigt).getByText("Test durchgeführt")).toBeInTheDocument();
    expect(
      within(erledigt).getByText("Ohne Datum erledigt"),
    ).toBeInTheDocument();

    const appRow = within(screen.getByRole("navigation", { name: "Apps" }));
    const appLinks = [
      ["Vault", "/vault/"],
      ["Projekte", "/projekte/"],
      ["Aufgaben", "/aufgaben/"],
      ["Eingang", "/eingang/"],
      ["Kontext", "/kontext/"],
      ["Zahlen", "/zahlen/"],
      ["CRM", "/crm/"],
      ["Rolodex", "/rolodex/"],
    ];
    for (const [name, href] of appLinks) {
      expect(appRow.getByRole("link", { name })).toHaveAttribute("href", href);
    }
    expect(appRow.getAllByRole("link")).toHaveLength(appLinks.length);
  });

  it("fetches the stand only after warmProjects has resolved, so a fresh install does not race the first scan", async () => {
    // GET /list (warmProjects) scans an empty table before answering
    // (server/src/projekte/routes.ts); GET /stand never scans. Firing them in parallel on a fresh
    // install would let /stand read the table before the scan has filled it in - same race Task 4
    // fixed inside the Projekte app itself.
    let resolveWarm!: () => void;
    vi.mocked(api.warmProjects).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveWarm = () => {
            resolve(undefined);
          };
        }),
    );
    vi.mocked(api.tasks).mockResolvedValue([]);
    vi.mocked(api.inbox).mockResolvedValue([]);
    vi.mocked(api.sessionNote).mockResolvedValue(null);
    vi.mocked(api.zahlenLast).mockResolvedValue({ run: null });
    vi.mocked(api.stand).mockResolvedValue({ projekte: [], ohneProjekt: [] });

    render(<App />);
    expect(api.stand).not.toHaveBeenCalled();
    resolveWarm();
    await within(panel("Projekte in Bewegung")).findByText("Alles ruhig.");
    expect(api.stand).toHaveBeenCalledTimes(1);
  });

  it("shows a handoff's age first, then its staleness hint", async () => {
    vi.mocked(api.tasks).mockResolvedValue([]);
    vi.mocked(api.inbox).mockResolvedValue([]);
    vi.mocked(api.sessionNote).mockResolvedValue(null);
    vi.mocked(api.zahlenLast).mockResolvedValue({ run: null });
    vi.mocked(api.stand).mockResolvedValue({
      projekte: [
        handoffRow({
          updated: daysAgo(3),
          signals: { veraltet: true, dirtyRepos: 0, offeneTasks: 0 },
        }),
      ],
      ohneProjekt: [],
    });

    render(<App />);
    const bewegung = panel("Projekte in Bewegung");
    await within(bewegung).findByText("Leuchtturm");
    expect(
      within(bewegung).getByText("vor 3 Tagen · Stand veraltet"),
    ).toBeInTheDocument();
    expect(
      within(bewegung).getByRole("link", { name: /Leuchtturm/ }),
    ).toHaveAttribute("href", "/projekte/");
  });

  it("covers every handoffMeta branch: age variants, hint plurals and a missing repo", async () => {
    vi.mocked(api.tasks).mockResolvedValue([]);
    vi.mocked(api.inbox).mockResolvedValue([]);
    vi.mocked(api.sessionNote).mockResolvedValue(null);
    vi.mocked(api.zahlenLast).mockResolvedValue({ run: null });
    vi.mocked(api.stand).mockResolvedValue({
      projekte: [
        handoffRow({ slug: "quiet", title: "Ruhig" }),
        handoffRow({ slug: "no-date", title: "Ohne Datum", updated: null }),
        handoffRow({ slug: "one-day", title: "Ein Tag", updated: daysAgo(1) }),
        handoffRow({
          slug: "dirty-one",
          title: "Ein Repo",
          signals: { veraltet: false, dirtyRepos: 1, offeneTasks: 0 },
        }),
        handoffRow({
          slug: "dirty-many",
          title: "Mehrere Repos",
          signals: { veraltet: false, dirtyRepos: 2, offeneTasks: 0 },
        }),
        handoffRow({
          slug: "task-one",
          title: "Eine Aufgabe",
          signals: { veraltet: false, dirtyRepos: 0, offeneTasks: 1 },
        }),
        handoffRow({
          slug: "task-many",
          title: "Mehrere Aufgaben",
          signals: { veraltet: false, dirtyRepos: 0, offeneTasks: 2 },
        }),
        handoffRow({
          slug: "missing-repo",
          title: "Fehlendes Repo",
          missingRepos: ["kaputt"],
        }),
      ],
      ohneProjekt: [],
    });

    render(<App />);
    const bewegung = panel("Projekte in Bewegung");
    await within(bewegung).findByText("Ruhig");
    expect(within(bewegung).getByText("heute")).toBeInTheDocument();
    expect(within(bewegung).getByText("Datum fehlt")).toBeInTheDocument();
    expect(within(bewegung).getByText("vor 1 Tag")).toBeInTheDocument();
    expect(
      within(bewegung).getByText("heute · 1 Repo ungesichert"),
    ).toBeInTheDocument();
    expect(
      within(bewegung).getByText("heute · 2 Repos ungesichert"),
    ).toBeInTheDocument();
    expect(
      within(bewegung).getByText("heute · 1 offene Aufgabe"),
    ).toBeInTheDocument();
    expect(
      within(bewegung).getByText("heute · 2 offene Aufgaben"),
    ).toBeInTheDocument();
    expect(
      within(bewegung).getByText("heute · Repo nicht gefunden: kaputt"),
    ).toBeInTheDocument();
  });

  it("folds handoffs past HANDOFF_ROWS into a … und n weitere row", async () => {
    vi.mocked(api.tasks).mockResolvedValue([]);
    vi.mocked(api.inbox).mockResolvedValue([]);
    vi.mocked(api.sessionNote).mockResolvedValue(null);
    vi.mocked(api.zahlenLast).mockResolvedValue({ run: null });
    const rows = Array.from({ length: 10 }, (_, i) =>
      handoffRow({ slug: `h${String(i)}`, title: `Handoff ${String(i)}` }),
    );
    vi.mocked(api.stand).mockResolvedValue({ projekte: rows, ohneProjekt: [] });

    render(<App />);
    const bewegung = panel("Projekte in Bewegung");
    await within(bewegung).findByText("Handoff 0");
    expect(within(bewegung).getByText("Handoff 7")).toBeInTheDocument();
    expect(within(bewegung).queryByText("Handoff 8")).not.toBeInTheDocument();
    expect(within(bewegung).queryByText("Handoff 9")).not.toBeInTheDocument();
    const more = within(bewegung).getByText("… und 2 weitere");
    expect(more).toBeInTheDocument();
    expect(more.closest("a")).toHaveAttribute("href", "/projekte/");
  });

  it("lists moving rows from ohneProjekt only, alongside any handoffs", async () => {
    vi.mocked(api.tasks).mockResolvedValue([]);
    vi.mocked(api.inbox).mockResolvedValue([]);
    vi.mocked(api.sessionNote).mockResolvedValue(null);
    vi.mocked(api.zahlenLast).mockResolvedValue({ run: null });
    vi.mocked(api.stand).mockResolvedValue({
      projekte: [handoffRow()],
      ohneProjekt: [project({ name: "frei-schwebend", dirty: 1 })],
    });

    render(<App />);
    const bewegung = panel("Projekte in Bewegung");
    await within(bewegung).findByText("Leuchtturm");
    expect(within(bewegung).getByText("frei-schwebend")).toBeInTheDocument();
    expect(within(bewegung).getByText("1 geändert")).toBeInTheDocument();
    // One row for the handoff, one for the sole unattached repo - nothing coupled to the
    // handoff sneaks in as a second moving row.
    expect(within(bewegung).getAllByRole("link")).toHaveLength(2);
  });

  it("omits the Google-ROAS line when the reply carries no such row", async () => {
    vi.mocked(api.tasks).mockResolvedValue([]);
    vi.mocked(api.stand).mockResolvedValue({ projekte: [], ohneProjekt: [] });
    vi.mocked(api.inbox).mockResolvedValue([]);
    vi.mocked(api.sessionNote).mockResolvedValue(null);
    vi.mocked(api.zahlenLast).mockResolvedValue({
      run: { stichtag: "2026-08-15", modus: "zwischenstand" },
      kpis: [kpi()],
      breakEven: [],
    });

    render(<App />);
    const zahlen = panel("Zahlen");
    await within(zahlen).findByText("Umsatz gesamt: 54.300 €");
    expect(within(zahlen).queryByText(/Google-ROAS/)).not.toBeInTheDocument();
    expect(
      within(zahlen).getByText("Kampagnen unter Break-even: 0"),
    ).toBeInTheDocument();
  });

  it("shows every empty state when nothing is due, moving or done and no note exists", async () => {
    vi.mocked(api.tasks).mockResolvedValue([]);
    vi.mocked(api.stand).mockResolvedValue({ projekte: [], ohneProjekt: [] });
    vi.mocked(api.inbox).mockResolvedValue([]);
    vi.mocked(api.sessionNote).mockResolvedValue(null);
    vi.mocked(api.zahlenLast).mockResolvedValue({ run: null });

    render(<App />);
    await screen.findByText("Nichts überfällig.");

    expect(
      screen.getByText("Diese Woche ist nichts fällig."),
    ).toBeInTheDocument();
    expect(screen.getByText("Alles ruhig.")).toBeInTheDocument();
    expect(
      screen.getByText("Keine Session-Notiz gefunden."),
    ).toBeInTheDocument();
    expect(screen.getByText("Noch nichts erledigt.")).toBeInTheDocument();

    const eingang = panel("Eingang");
    expect(within(eingang).getByText("Nichts Neues.")).toBeInTheDocument();
    expect(
      within(eingang).getByRole("link", { name: "Verarbeiten" }),
    ).toHaveAttribute("href", "/eingang/");

    const zahlen = panel("Zahlen");
    expect(within(zahlen).getByText("Noch kein Lauf.")).toBeInTheDocument();
    expect(
      within(zahlen).getByRole("link", { name: "Zur Zahlen-App" }),
    ).toHaveAttribute("href", "/zahlen/");
  });
});
