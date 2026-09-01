import { useEffect, useState } from "react";
import BenchNav from "../shared/BenchNav";
import { api, HttpError, type CreateBody } from "./api";
import CreateForm from "./components/CreateForm";
import TaskList from "./components/TaskList";
import {
  groupByBrand,
  groupByNote,
  viewDone,
  viewToday,
  viewUnassigned,
  viewWeek,
  type Task,
  type TaskGroup,
  type TreeEntry,
} from "./types";

type View =
  "heute" | "woche" | "projekt" | "marke" | "unzugeordnet" | "erledigt";

const TABS: { key: View; label: string }[] = [
  { key: "heute", label: "Heute" },
  { key: "woche", label: "Woche" },
  { key: "projekt", label: "Projekt" },
  { key: "marke", label: "Marke" },
  { key: "unzugeordnet", label: "Unzugeordnet" },
  { key: "erledigt", label: "Erledigt" },
];

const CONFLICT_MESSAGE = "Die Notiz hat sich geändert – Liste neu geladen.";

/** The local calendar day, not UTC - matches the server's own todayISO in vault/write.ts. */
function todayISO(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

type OnToggle = (path: string, line: number, raw: string) => void;

function HeuteView({
  tasks,
  today,
  onToggle,
}: {
  tasks: Task[];
  today: string;
  onToggle: OnToggle;
}) {
  const heute = viewToday(tasks, today);
  return (
    <div className="aufgaben-sections">
      <section className="aufgaben-section">
        <h2>Überfällig</h2>
        <TaskList tasks={heute.overdue} onToggle={onToggle} />
      </section>
      <section className="aufgaben-section">
        <h2>Heute fällig</h2>
        <TaskList tasks={heute.dueToday} onToggle={onToggle} />
      </section>
      <section className="aufgaben-section">
        <h2>Hohe Priorität</h2>
        <TaskList tasks={heute.highPriority} onToggle={onToggle} />
      </section>
    </div>
  );
}

function GroupedView({
  groups,
  onToggle,
}: {
  groups: TaskGroup[];
  onToggle: OnToggle;
}) {
  return (
    <div className="aufgaben-sections">
      {groups.map((group) => (
        <section key={group.key} className="aufgaben-section">
          <h2>{group.label}</h2>
          <TaskList tasks={group.tasks} onToggle={onToggle} />
        </section>
      ))}
    </div>
  );
}

export default function App() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [notes, setNotes] = useState<TreeEntry[]>([]);
  const [view, setView] = useState<View>("heute");
  const [creating, setCreating] = useState(false);
  const [conflict, setConflict] = useState<string | null>(null);

  const refetchTasks = () => api.tasks().then(setTasks);

  useEffect(() => {
    void refetchTasks();
    void api.tree().then(setNotes);
  }, []);

  async function toggle(path: string, line: number, raw: string) {
    setConflict(null);
    try {
      await api.toggle(path, line, raw);
      await refetchTasks();
    } catch (err) {
      if (err instanceof HttpError && err.status === 409) {
        setConflict(CONFLICT_MESSAGE);
        await refetchTasks();
        return;
      }
      // A failed toggle otherwise is a network or server problem the user can retry - logged so
      // it is not silently dropped, without a banner for a request nothing else here reacts to.
      console.error(err);
    }
  }
  const handleToggle: OnToggle = (path, line, raw) =>
    void toggle(path, line, raw);

  async function create(body: CreateBody) {
    await api.create(body);
    setCreating(false);
    await refetchTasks();
  }

  const today = todayISO();

  return (
    <>
      <BenchNav active="aufgaben" />
      <main className="aufgaben">
        <header className="aufgaben-header">
          <h1>Aufgaben</h1>
          <button
            type="button"
            className="aufgaben-new"
            onClick={() => setCreating(true)}
          >
            Neue Aufgabe
          </button>
        </header>

        {conflict && <p className="aufgaben-conflict">{conflict}</p>}

        <div className="aufgaben-tabs" role="group" aria-label="Ansicht">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              className="aufgaben-tab"
              aria-pressed={view === tab.key}
              onClick={() => setView(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {view === "heute" && (
          <HeuteView tasks={tasks} today={today} onToggle={handleToggle} />
        )}
        {view === "woche" && (
          <TaskList tasks={viewWeek(tasks, today)} onToggle={handleToggle} />
        )}
        {view === "projekt" && (
          <GroupedView groups={groupByNote(tasks)} onToggle={handleToggle} />
        )}
        {view === "marke" && (
          <GroupedView groups={groupByBrand(tasks)} onToggle={handleToggle} />
        )}
        {view === "unzugeordnet" && (
          <TaskList tasks={viewUnassigned(tasks)} onToggle={handleToggle} />
        )}
        {view === "erledigt" && (
          <TaskList tasks={viewDone(tasks)} onToggle={handleToggle} />
        )}

        {creating && (
          <CreateForm
            notes={notes}
            onSubmit={(body) => void create(body)}
            onCancel={() => setCreating(false)}
          />
        )}
      </main>
    </>
  );
}
