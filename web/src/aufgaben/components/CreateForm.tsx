import { useState, type SubmitEvent } from "react";
import type { CreateBody } from "../api";
import {
  TASK_INBOX,
  targetNotes,
  type Priority,
  type TreeEntry,
} from "../types";

const PRIORITY_OPTIONS: { value: Priority | ""; label: string }[] = [
  { value: "", label: "Keine" },
  { value: "highest", label: "Höchste" },
  { value: "high", label: "Hoch" },
  { value: "medium", label: "Mittel" },
  { value: "low", label: "Niedrig" },
  { value: "lowest", label: "Niedrigste" },
];

/** Only the fields with a value go into the request body - the server rejects an empty string
    for `due` or `priority` rather than treating it as absent. */
function toBody(
  path: string,
  text: string,
  due: string,
  priority: Priority | "",
): CreateBody {
  return {
    path,
    text,
    ...(due !== "" ? { due } : {}),
    ...(priority !== "" ? { priority } : {}),
  };
}

export default function CreateForm({
  notes,
  onSubmit,
  onCancel,
}: {
  notes: TreeEntry[];
  onSubmit: (body: CreateBody) => void;
  onCancel: () => void;
}) {
  const [path, setPath] = useState(TASK_INBOX);
  const [text, setText] = useState("");
  const [due, setDue] = useState("");
  const [priority, setPriority] = useState<Priority | "">("");

  const submit = (e: SubmitEvent) => {
    e.preventDefault();
    onSubmit(toBody(path, text, due, priority));
  };

  return (
    <form className="aufgaben-form" onSubmit={submit}>
      <div className="aufgaben-field">
        <label htmlFor="aufgaben-note">Notiz</label>
        <select
          id="aufgaben-note"
          value={path}
          onChange={(e) => setPath(e.target.value)}
        >
          <option value={TASK_INBOX}>Task_Inbox (Standard)</option>
          {targetNotes(notes).map((note) => (
            <option key={note.path} value={note.path}>
              {note.title}
            </option>
          ))}
        </select>
      </div>
      <div className="aufgaben-field">
        <label htmlFor="aufgaben-text">Text</label>
        <input
          id="aufgaben-text"
          required
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </div>
      <div className="aufgaben-field">
        <label htmlFor="aufgaben-due">Fällig am</label>
        <input
          id="aufgaben-due"
          type="date"
          value={due}
          onChange={(e) => setDue(e.target.value)}
        />
      </div>
      <div className="aufgaben-field">
        <label htmlFor="aufgaben-priority">Priorität</label>
        <select
          id="aufgaben-priority"
          value={priority}
          onChange={(e) => setPriority(e.target.value as Priority | "")}
        >
          {PRIORITY_OPTIONS.map((option) => (
            <option key={option.label} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      <div className="aufgaben-form-actions">
        <button type="button" onClick={onCancel}>
          Abbrechen
        </button>
        <button type="submit">Anlegen</button>
      </div>
    </form>
  );
}
