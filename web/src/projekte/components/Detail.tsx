import { Fragment, useEffect, useRef } from "react";
import { EM_DASH, dateText, deltaText, noteHref } from "../format";
import type { ProjectDetail } from "../types";

function fieldRows(project: ProjectDetail): { label: string; value: string }[] {
  return [
    { label: "Pfad", value: project.path },
    { label: "Branch", value: project.branch ?? EM_DASH },
    { label: "Letzter Commit", value: dateText(project.lastCommitAt) },
    {
      label: "Änderungen",
      value: deltaText(project.dirty, project.ahead, project.behind),
    },
    {
      label: "Issues",
      value: project.issues === null ? EM_DASH : String(project.issues),
    },
    {
      label: "PRs",
      value: project.prs === null ? EM_DASH : String(project.prs),
    },
    { label: "Marke", value: project.brand ?? EM_DASH },
    { label: "Status", value: project.status ?? EM_DASH },
  ];
}

export default function Detail({
  project,
  duplicates,
  onClose,
}: {
  project: ProjectDetail;
  duplicates: ProjectDetail[];
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <aside
      className="projekte-detail"
      aria-label={`Details zu ${project.name}`}
    >
      <div className="projekte-detail-header">
        <h2>{project.name}</h2>
        <button
          type="button"
          ref={closeRef}
          className="projekte-detail-close"
          onClick={onClose}
        >
          Schließen
        </button>
      </div>
      <dl className="projekte-detail-fields">
        {fieldRows(project).map((row) => (
          <Fragment key={row.label}>
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </Fragment>
        ))}
      </dl>
      {(project.remoteLabel !== null || project.notePath !== null) && (
        <div className="projekte-detail-links">
          {project.remoteLabel !== null && (
            <a
              href={`https://github.com/${project.remoteLabel}`}
              target="_blank"
              rel="noreferrer"
            >
              In GitHub öffnen
            </a>
          )}
          {project.notePath !== null && (
            <a href={noteHref(project.notePath)}>Notiz im Vault</a>
          )}
        </div>
      )}
      {duplicates.length > 0 && (
        <div className="projekte-detail-duplicates">
          <h3>Duplikate</h3>
          <ul>
            {duplicates.map((duplicate) => (
              <li key={duplicate.path}>{duplicate.path}</li>
            ))}
          </ul>
        </div>
      )}
    </aside>
  );
}
