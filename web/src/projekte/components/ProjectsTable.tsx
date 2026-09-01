import { dateText, deltaText } from "../format";
import type { Project } from "../types";
import WarningBadges from "./WarningBadges";

const EM_DASH = "—";

/** A note's link text is its basename without the .md extension - the same convention as
    web/src/vault/obsidian.ts's file names, applied here to a note the project points at rather
    than the note being viewed. */
function noteTitle(notePath: string): string {
  const base = notePath.split("/").pop() ?? notePath;
  return base.replace(/\.md$/, "");
}

function noteHref(notePath: string): string {
  return `/vault/n/${notePath.split("/").map(encodeURIComponent).join("/")}`;
}

/** Most recently active first; a checkout the pipeline never read a commit for sorts last. */
function byLastCommitDesc(a: Project, b: Project): number {
  if (a.lastCommitAt === null) return b.lastCommitAt === null ? 0 : 1;
  if (b.lastCommitAt === null) return -1;
  return b.lastCommitAt - a.lastCommitAt;
}

const HEADERS = [
  "Projekt",
  "Marke",
  "Status",
  "Branch",
  "Letzter Commit",
  "Änderungen",
  "Issues",
  "PRs",
  "Notiz",
  "Hinweise",
];

function ProjectRow({ project }: { project: Project }) {
  return (
    <tr>
      <td>
        <strong className="projekte-name">{project.name}</strong>
        <div className="projekte-path">{project.path}</div>
      </td>
      <td>{project.brand ?? EM_DASH}</td>
      <td>{project.status ?? EM_DASH}</td>
      <td>{project.branch ?? EM_DASH}</td>
      <td>{dateText(project.lastCommitAt)}</td>
      <td>{deltaText(project.dirty, project.ahead, project.behind)}</td>
      <td>{project.issues ?? EM_DASH}</td>
      <td>{project.prs ?? EM_DASH}</td>
      <td>
        {project.notePath ? (
          <a href={noteHref(project.notePath)}>{noteTitle(project.notePath)}</a>
        ) : (
          EM_DASH
        )}
      </td>
      <td>
        <WarningBadges project={project} />
      </td>
    </tr>
  );
}

export default function ProjectsTable({ projects }: { projects: Project[] }) {
  const rows = [...projects].sort(byLastCommitDesc);
  return (
    <table className="projekte-table">
      <thead>
        <tr>
          {HEADERS.map((header) => (
            <th key={header} scope="col">
              {header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((project) => (
          <ProjectRow key={project.path} project={project} />
        ))}
      </tbody>
    </table>
  );
}
