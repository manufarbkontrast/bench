import { EM_DASH, dateText, deltaText, noteHref } from "../format";
import { ageDays, ageText, dayText, standHints } from "../stand";
import type { ProjectDetail, ProjektStand } from "../types";

/** A repo's row inside a Stand card's own list and inside Ohne Projekt's - one shape, two
    callers, so it lives here rather than twice. */
export function RepoRow({
  repo,
  onSelect,
}: {
  repo: ProjectDetail;
  onSelect: (path: string) => void;
}) {
  return (
    <li>
      <button type="button" onClick={() => onSelect(repo.path)}>
        {repo.name}
      </button>
      <span>
        {repo.branch ?? EM_DASH} ·{" "}
        {deltaText(repo.dirty, repo.ahead, repo.behind)} ·{" "}
        {dateText(repo.lastCommitAt)}
      </span>
    </li>
  );
}

function headerLine(updated: string | null, today: string): string {
  if (updated === null) return "Datum fehlt";
  return `Handoff vom ${dayText(updated)} · ${ageText(ageDays(updated, today))}`;
}

export default function ProjektCard({
  projekt,
  today,
  onSelect,
}: {
  projekt: ProjektStand;
  today: string;
  onSelect: (path: string) => void;
}) {
  const hints = standHints(projekt);
  return (
    <article className="projekte-stand-card">
      <h2>{projekt.title}</h2>
      <p className="projekte-stand-meta">
        {headerLine(projekt.updated, today)}
      </p>
      {hints.length > 0 && (
        <ul className="projekte-badges">
          {hints.map((hint) => (
            <li key={hint} className="projekte-badge">
              {hint}
            </li>
          ))}
        </ul>
      )}
      {projekt.zustand !== "" && (
        <pre className="projekte-stand-text">{projekt.zustand}</pre>
      )}
      <a href={noteHref(projekt.notePath)}>Handoff im Vault</a>
      <ul className="projekte-stand-repos">
        {projekt.repos.map((repo) => (
          <RepoRow key={repo.path} repo={repo} onSelect={onSelect} />
        ))}
      </ul>
    </article>
  );
}
