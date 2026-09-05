import type { Issue, IssueRepo } from "../types";

function IssueRow({ number, title, url, labels }: Issue) {
  return (
    <li className="aufgaben-issue-row">
      <a href={url}>
        #{number} {title}
      </a>
      {labels.length > 0 && (
        <span className="aufgaben-chips">
          {labels.map((label) => (
            <span key={label} className="aufgaben-chip">
              {label}
            </span>
          ))}
        </span>
      )}
    </li>
  );
}

function RepoSection({ repo }: { repo: IssueRepo }) {
  return (
    <section className="aufgaben-section">
      <h2>{repo.label}</h2>
      {repo.issues === null ? (
        <p className="aufgaben-empty">GitHub nicht erreichbar.</p>
      ) : (
        <ul className="aufgaben-issue-list">
          {repo.issues.map((issue) => (
            <IssueRow key={issue.number} {...issue} />
          ))}
        </ul>
      )}
    </section>
  );
}

/** The Issues tab: one section per GitHub repo label, its open issues or an unreachable hint. */
export default function IssuesPanel({
  repos,
  source,
}: {
  repos: IssueRepo[];
  source: "gh" | "off";
}) {
  if (source === "off") {
    return <p className="aufgaben-empty">GitHub-Abfrage ist ausgeschaltet.</p>;
  }
  if (repos.length === 0) {
    return <p className="aufgaben-empty">Keine GitHub-Projekte bekannt.</p>;
  }
  return (
    <div className="aufgaben-sections">
      {repos.map((repo) => (
        <RepoSection key={repo.label} repo={repo} />
      ))}
    </div>
  );
}
