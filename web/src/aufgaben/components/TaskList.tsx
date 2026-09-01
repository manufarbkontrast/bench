import { metaText, noteHref } from "../format";
import type { Task } from "../types";

type OnToggle = (path: string, line: number, raw: string) => void;

function TaskRow({ task, onToggle }: { task: Task; onToggle: OnToggle }) {
  const meta = metaText(task);
  return (
    <li className="aufgaben-row">
      <input
        type="checkbox"
        aria-label={task.text}
        checked={task.done}
        onChange={() => onToggle(task.path, task.line, task.raw)}
      />
      <div className="aufgaben-row-body">
        <span className="aufgaben-row-text">{task.text}</span>
        <div className="aufgaben-row-meta">
          {meta && <span>{meta}</span>}
          <a href={noteHref(task.path)}>{task.noteTitle}</a>
        </div>
      </div>
    </li>
  );
}

export default function TaskList({
  tasks,
  onToggle,
}: {
  tasks: Task[];
  onToggle: OnToggle;
}) {
  if (tasks.length === 0) {
    return <p className="aufgaben-empty">Keine Aufgaben.</p>;
  }
  return (
    <ul className="aufgaben-list">
      {tasks.map((task) => (
        <TaskRow
          key={`${task.path}:${task.line}`}
          task={task}
          onToggle={onToggle}
        />
      ))}
    </ul>
  );
}
