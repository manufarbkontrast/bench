import type { Project } from "../types";

/** What is worth a second look about a row: an exact or possible duplicate, or a checkout the
    pipeline could not fully read - never more than one duplicate badge at a time. */
function hintsFor(project: Project): string[] {
  const hints: string[] = [];
  if (project.isDuplicate) hints.push("Dublette");
  else if (project.sameName) hints.push("Mögliche Dublette");
  if (project.kind === "git" && !project.remote) hints.push("Kein Remote");
  if (project.kind === "folder") hints.push("Ohne Git");
  return hints;
}

export default function WarningBadges({ project }: { project: Project }) {
  const hints = hintsFor(project);
  if (hints.length === 0) return null;
  return (
    <ul className="projekte-badges">
      {hints.map((hint) => (
        <li key={hint} className="projekte-badge">
          {hint}
        </li>
      ))}
    </ul>
  );
}
