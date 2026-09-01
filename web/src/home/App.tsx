/** Cockpit: one page onto what needs attention across the vault, the repositories and the
    tasks, replacing the old card-grid launcher. Reads three sibling APIs directly - each panel
    is one fetch's worth of rows, filtered and sorted here rather than in a shared module. */
import { useEffect, useState } from "react";
import BenchNav from "../shared/BenchNav";
import {
  IconAufgaben,
  IconCrm,
  IconProjekte,
  IconRolodex,
  IconVault,
} from "../shared/AppIcons";
import { api } from "./api";
import { dateText, deltaText } from "./format";
import { firstSection, type Section } from "./session";
import {
  movingProjects,
  overdueTasks,
  recentDone,
  weekTasks,
  type Project,
  type Task,
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
  { href: "/crm/", name: "CRM", Icon: IconCrm },
  { href: "/rolodex/", name: "Rolodex", Icon: IconRolodex },
];

/** The local calendar day - matches the aufgaben app's own todayISO. */
function todayISO(): string {
  const now = new Date();
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

function ProjectPanel({ projects }: { projects: Project[] }) {
  return (
    <section className="home-panel">
      <h2>Projekte in Bewegung</h2>
      {projects.length === 0 ? (
        <p className="home-empty">Alles ruhig.</p>
      ) : (
        <ul className="home-rows">
          {projects.map((project) => (
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

function PlaceholderPanel({
  heading,
  text,
}: {
  heading: string;
  text: string;
}) {
  return (
    <section className="home-panel">
      <h2>{heading}</h2>
      <p className="home-placeholder">{text}</p>
    </section>
  );
}

export default function App() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [session, setSession] = useState<Section | null>(null);

  useEffect(() => {
    void api.tasks().then(setTasks);
    void api.projects().then(setProjects);
    void api
      .sessionNote()
      .then((note) => setSession(note ? firstSection(note.body) : null));
  }, []);

  const today = todayISO();
  const now = new Date().getTime();

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
          <PlaceholderPanel
            heading="Eingang"
            text="Kommt mit der Eingang-App (Phase 4)."
          />
          <ProjectPanel projects={movingProjects(projects, now)} />
          <SessionPanel section={session} />
          <PlaceholderPanel
            heading="Zahlen"
            text="Kommt mit der Zahlen-App (Phase 5)."
          />
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
