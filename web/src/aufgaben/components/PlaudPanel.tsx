import { useEffect, useState } from "react";
import { api } from "../api";
import { dateText, noteHref } from "../format";
import {
  TASK_INBOX,
  targetNotes,
  type PlaudItem,
  type PlaudNote,
  type TreeEntry,
} from "../types";

type OnImport = (file: string, rowHash: string, targetPath: string) => void;

function TargetSelect({
  item,
  target,
  onChange,
  targets,
}: {
  item: PlaudItem;
  target: string;
  onChange: (value: string) => void;
  targets: TreeEntry[];
}) {
  const id = `plaud-target-${item.rowHash}`;
  return (
    <>
      <label htmlFor={id} className="aufgaben-visually-hidden">
        Ziel für {item.was}
      </label>
      <select id={id} value={target} onChange={(e) => onChange(e.target.value)}>
        <option value={TASK_INBOX}>Task_Inbox (Standard)</option>
        {targets.map((note) => (
          <option key={note.path} value={note.path}>
            {note.title}
          </option>
        ))}
      </select>
    </>
  );
}

function PlaudItemRow({
  file,
  item,
  suggestedTarget,
  targets,
  onImport,
}: {
  file: string;
  item: PlaudItem;
  suggestedTarget: string;
  targets: TreeEntry[];
  onImport: OnImport;
}) {
  const [target, setTarget] = useState(suggestedTarget);
  return (
    <tr className="aufgaben-plaud-row">
      <td>{item.wer}</td>
      <td>{item.was}</td>
      <td>{item.bis}</td>
      <td>{item.zeitmarke}</td>
      <td>
        {item.imported ? (
          <a href={noteHref(item.imported.targetPath)}>Übernommen</a>
        ) : (
          <>
            <TargetSelect
              item={item}
              target={target}
              onChange={setTarget}
              targets={targets}
            />
            <button
              type="button"
              aria-label={`In Vault übernehmen: ${item.was}`}
              onClick={() => onImport(file, item.rowHash, target)}
            >
              In Vault übernehmen
            </button>
          </>
        )}
        {item.existing && (
          <p className="aufgaben-plaud-dedup">
            Ähnliche Aufgabe vorhanden:{" "}
            <a href={noteHref(item.existing.path)}>{item.existing.text}</a>
          </p>
        )}
      </td>
    </tr>
  );
}

function BulletList({ heading, items }: { heading: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="aufgaben-plaud-list">
      <h4>{heading}</h4>
      <ul>
        {items.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </div>
  );
}

function PlaudNoteCard({
  note,
  targets,
  onImport,
}: {
  note: PlaudNote;
  targets: TreeEntry[];
  onImport: OnImport;
}) {
  return (
    <article className="aufgaben-plaud-note">
      <h3>{note.title}</h3>
      <p className="aufgaben-plaud-meta">
        {dateText(note.date)} · Quelle: {note.source ?? "—"}
      </p>
      <table className="aufgaben-plaud-table">
        <thead>
          <tr>
            <th>Wer</th>
            <th>Was</th>
            <th>Bis wann</th>
            <th>Zeitmarke</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {note.items.map((item) => (
            <PlaudItemRow
              key={item.rowHash}
              file={note.file}
              item={item}
              suggestedTarget={note.suggestedTarget}
              targets={targets}
              onImport={onImport}
            />
          ))}
        </tbody>
      </table>
      <BulletList heading="Offene Fragen" items={note.openQuestions} />
      <BulletList heading="Direkt erledigbar" items={note.direct} />
    </article>
  );
}

/** The Unzugeordnet view's Plaud half: every processed note with its Arbeitsaufträge table, a
    target select reused from Task 6's create-form helper, and the dedup hint per row. */
export default function PlaudPanel({
  notes,
  onImport,
}: {
  notes: PlaudNote[];
  onImport: OnImport;
}) {
  const [tree, setTree] = useState<TreeEntry[]>([]);

  useEffect(() => {
    void api.tree().then(setTree);
  }, []);

  const targets = targetNotes(tree);

  return (
    <div className="aufgaben-plaud">
      {notes.map((note) => (
        <PlaudNoteCard
          key={note.file}
          note={note}
          targets={targets}
          onImport={onImport}
        />
      ))}
    </div>
  );
}
