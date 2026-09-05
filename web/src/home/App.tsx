/** Cockpit: one page onto what needs attention across the vault, the repositories and the
    tasks, replacing the old card-grid launcher. Reads five sibling APIs directly - each panel
    is one fetch's worth of rows, filtered and sorted here rather than in a shared module. */
import { useEffect, useState } from "react";
import BenchNav from "../shared/BenchNav";
import {
  IconAufgaben,
  IconCrm,
  IconEingang,
  IconKontext,
  IconProjekte,
  IconRolodex,
  IconVault,
  IconZahlen,
} from "../shared/AppIcons";
import { api } from "./api";
import { breakEvenText, dateText, deltaText, runLineText } from "./format";
import { firstSection, type Section } from "./session";
import {
  HANDOFF_ROWS,
  handoffMeta,
  movingProjects,
  overdueTasks,
  recentDone,
  unverarbeitetCount,
  weekTasks,
  zahlenKpis,
  type InboxFile,
  type StandReply,
  type Task,
  type ZahlenReply,
} from "./types";

const SESSION_NOTE_HREF = "/vault/n/00_Index/Session_Context.md";

const APPS: {
  href: string;
  name: string;
  Icon: (p: { size?: number }) => React.ReactElement;
}[] = [
  { href: "/vault/", name: "Vault", Icon: IconVault },
  { href: "/projekte/", name: "Projekte", Icon: IconProjekte },
  { href: "/aufgaben/", name: "Aufgaben", Icon: IconAufgaben },
  { href: "/eingang/", name: "Eingang", Icon: IconEingang },
  { href: "/kontext/", name: "Kontext", Icon: IconKontext },
  { href: "/zahlen/", name: "Zahlen", Icon: IconZahlen },
  { href: "/crm/", name: "CRM", Icon: IconCrm },
  { href: "/rolodex/", name: "Rolodex", Icon: IconRolodex },
];

/** The local calendar day for a given instant - matches the aufgaben app's own todayISO, taken
    as a parameter here so a handoff's age and the moving-repos window read the same clock. */
function todayISO(ms: number): string {
  const now = new Date(ms);
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function TaskPanel({
  heading,
  tasks,
  meta,
  empty,
}: {
  heading: string;
  tasks: Task[];
  meta: (task: Task) => string | null;
  empty: string;
}) {
  return (
    <section className="home-panel">
      <h2>{heading}</h2>
      {tasks.length === 0 ? (
        <p className="home-empty">{empty}</p>
      ) : (
        <ul className="home-rows">
          {tasks.map((task) => {
            const rowMeta = meta(task);
            return (
              <li key={`${task.path}:${task.line}`}>
                <a className="home-row" href="/aufgaben/">
                  <span className="home-row-text">{task.text}</span>
                  {rowMeta !== null && (
                    <span className="home-row-meta">{rowMeta}</span>
                  )}
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function ProjectPanel({ stand, now }: { stand: StandReply; now: number }) {
  const today = todayISO(now);
  const handoffs = stand.projekte.slice(0, HANDOFF_ROWS);
  const moreCount = stand.projekte.length - handoffs.length;
  const moving = movingProjects(stand.ohneProjekt, now);
  const empty = handoffs.length === 0 && moving.length === 0;
  return (
    <section className="home-panel">
      <h2>Projekte in Bewegung</h2>
      {empty ? (
        <p className="home-empty">Alles ruhig.</p>
      ) : (
        <ul className="home-rows">
          {handoffs.map((row) => (
            <li key={row.slug}>
              <a className="home-row" href="/projekte/">
                <span className="home-row-text">{row.title}</span>
                <span className="home-row-meta">{handoffMeta(row, today)}</span>
              </a>
            </li>
          ))}
          {moreCount > 0 && (
            <li key="__more">
              <a className="home-row" href="/projekte/">
                <span className="home-row-text">{`… und ${String(moreCount)} weitere`}</span>
              </a>
            </li>
          )}
          {moving.map((project) => (
            <li key={project.path}>
              <a className="home-row" href="/projekte/">
                <span className="home-row-text">{project.name}</span>
                <span className="home-row-meta">
                  {deltaText(project.dirty, project.ahead, project.behind)}
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function SessionPanel({ section }: { section: Section | null }) {
  return (
    <section className="home-panel">
      <h2>Hier weitermachen</h2>
      {section === null ? (
        <p className="home-empty">Keine Session-Notiz gefunden.</p>
      ) : (
        <>
          <p className="home-session-heading">{section.heading}</p>
          {section.text.split("\n\n").map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
          <a className="home-session-link" href={SESSION_NOTE_HREF}>
            Im Vault öffnen
          </a>
        </>
      )}
    </section>
  );
}

function EingangPanel({ files }: { files: InboxFile[] }) {
  const count = unverarbeitetCount(files);
  return (
    <section className="home-panel">
      <h2>Eingang</h2>
      {count === 0 ? (
        <p className="home-empty">Nichts Neues.</p>
      ) : (
        <p>{`${count} unverarbeitet`}</p>
      )}
      <a className="home-session-link" href="/eingang/">
        Verarbeiten
      </a>
    </section>
  );
}

function ZahlenPanel({ reply }: { reply: ZahlenReply }) {
  return (
    <section className="home-panel">
      <h2>Zahlen</h2>
      {reply.run === null ? (
        <p className="home-empty">Noch kein Lauf.</p>
      ) : (
        <>
          <p>{runLineText(reply.run)}</p>
          {zahlenKpis(reply.kpis).map((row) => (
            <p key={row.kennzahl}>{`${row.kennzahl}: ${row.aktuell}`}</p>
          ))}
          <p>{breakEvenText(reply.breakEven)}</p>
        </>
      )}
      <a className="home-session-link" href="/zahlen/">
        Zur Zahlen-App
      </a>
    </section>
  );
}

export default function App() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [stand, setStand] = useState<StandReply>({
    projekte: [],
    ohneProjekt: [],
  });
  const [inboxFiles, setInboxFiles] = useState<InboxFile[]>([]);
  const [session, setSession] = useState<Section | null>(null);
  const [zahlen, setZahlen] = useState<ZahlenReply>({ run: null });

  useEffect(() => {
    void api.tasks().then(setTasks);
    // Sequenced, not parallel: GET /list scans the sample workshop on an empty table (see
    // server/src/projekte/routes.ts), but GET /stand never scans and just reads the table as it
    // stands - fired in parallel, a fresh install (nothing in data/projekte.sqlite yet) would show
    // an empty panel until Neu scannen or a reload. Warming first means the scan has already run.
    // Same ordering as web/src/projekte/App.tsx's own mount effect.
    void api
      .warmProjects()
      .then(() => api.stand())
      .then(setStand);
    void api.inbox().then(setInboxFiles);
    void api
      .sessionNote()
      .then((note) => setSession(note ? firstSection(note.body) : null));
    void api.zahlenLast().then(setZahlen);
  }, []);

  const now = new Date().getTime();
  const today = todayISO(now);

  return (
    <>
      <BenchNav active="home" />
      <div className="home">
        <header className="home-header">
          <h1>Bench</h1>
        </header>

        <nav className="home-apps" aria-label="Apps">
          {APPS.map(({ href, name, Icon }) => (
            <a key={href} className="home-app" href={href}>
              <Icon size={18} />
              {name}
            </a>
          ))}
        </nav>

        <div className="home-panels">
          <TaskPanel
            heading="Überfällig"
            tasks={overdueTasks(tasks, today)}
            meta={(t) => `Fällig ${dateText(t.due)}`}
            empty="Nichts überfällig."
          />
          <TaskPanel
            heading="Diese Woche"
            tasks={weekTasks(tasks, today)}
            meta={(t) => `Fällig ${dateText(t.due)}`}
            empty="Diese Woche ist nichts fällig."
          />
          <EingangPanel files={inboxFiles} />
          <ProjectPanel stand={stand} now={now} />
          <SessionPanel section={session} />
          <ZahlenPanel reply={zahlen} />
          <TaskPanel
            heading="Zuletzt erledigt"
            tasks={recentDone(tasks)}
            meta={(t) =>
              t.doneAt !== null ? `Erledigt ${dateText(t.doneAt)}` : null
            }
            empty="Noch nichts erledigt."
          />
        </div>
      </div>
    </>
  );
}
