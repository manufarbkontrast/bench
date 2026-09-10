import { runLineText } from "../../shared/controlling";
import type { RunFolder } from "../types";

/** The archive: one aria-pressed button per run, newest first as the server already sorted it -
    the house pattern for a view toggle (see web/src/projekte/App.tsx's `projekte-view-btn`),
    reused here for a selection rather than a view. */
export default function RunsList({
  runs,
  selected,
  onSelect,
}: {
  runs: RunFolder[];
  selected: string | null;
  onSelect: (folder: string) => void;
}) {
  if (runs.length === 0) {
    return <p className="zahlen-empty">Keine Läufe.</p>;
  }
  return (
    <ul className="zahlen-archive-list">
      {runs.map((run) => (
        <li key={run.folder}>
          <button
            type="button"
            className="zahlen-archive-btn"
            aria-pressed={run.folder === selected}
            onClick={() => onSelect(run.folder)}
          >
            {runLineText(run)}
          </button>
        </li>
      ))}
    </ul>
  );
}
