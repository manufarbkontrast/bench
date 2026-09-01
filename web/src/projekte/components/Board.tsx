import { deltaText } from "../format";
import type { Project } from "../types";
import WarningBadges from "./WarningBadges";

interface StatusColumn {
  status: string | null;
  label: string;
  projects: Project[];
}

interface BrandSection {
  brand: string | null;
  label: string;
  columns: StatusColumn[];
}

function ordinal(a: string, b: string): number {
  return Number(a > b) - Number(a < b);
}

/** One column per status, ascending; a checkout with no status sorts last under Unzugeordnet. */
function groupByStatus(projects: Project[]): StatusColumn[] {
  const byStatus = new Map<string | null, Project[]>();
  for (const project of projects) {
    const group = byStatus.get(project.status) ?? [];
    group.push(project);
    byStatus.set(project.status, group);
  }
  const named = [...byStatus.keys()]
    .filter((status): status is string => status !== null)
    .sort(ordinal);
  const order = byStatus.has(null) ? [...named, null] : named;
  return order.map((status) => ({
    status,
    label: status ?? "Unzugeordnet",
    projects: byStatus.get(status) ?? [],
  }));
}

/** One section per Marke, ascending; an uncoupled checkout sorts last under Ohne Marke. */
function groupByBrand(projects: Project[]): BrandSection[] {
  const byBrand = new Map<string | null, Project[]>();
  for (const project of projects) {
    const group = byBrand.get(project.brand) ?? [];
    group.push(project);
    byBrand.set(project.brand, group);
  }
  const named = [...byBrand.keys()]
    .filter((brand): brand is string => brand !== null)
    .sort(ordinal);
  const order = byBrand.has(null) ? [...named, null] : named;
  return order.map((brand) => ({
    brand,
    label: brand ?? "Ohne Marke",
    columns: groupByStatus(byBrand.get(brand) ?? []),
  }));
}

function BoardCard({
  project,
  onSelect,
}: {
  project: Project;
  onSelect: (path: string) => void;
}) {
  return (
    <button
      type="button"
      className="projekte-card"
      onClick={() => onSelect(project.path)}
    >
      <span className="projekte-card-name">{project.name}</span>
      <span className="projekte-card-delta">
        {deltaText(project.dirty, project.ahead, project.behind)}
      </span>
      <WarningBadges project={project} />
    </button>
  );
}

export default function Board({
  projects,
  onSelect,
}: {
  projects: Project[];
  onSelect: (path: string) => void;
}) {
  const sections = groupByBrand(projects);
  return (
    <div className="projekte-board">
      {sections.map((section) => (
        <section
          key={section.brand ?? "ohne-marke"}
          className="projekte-board-section"
        >
          <h2 className="projekte-board-brand">{section.label}</h2>
          <div className="projekte-board-columns">
            {section.columns.map((column) => (
              <div
                key={column.status ?? "unzugeordnet"}
                className="projekte-board-column"
              >
                <h3 className="projekte-board-status">{column.label}</h3>
                <div className="projekte-board-cards">
                  {column.projects.map((project) => (
                    <BoardCard
                      key={project.path}
                      project={project}
                      onSelect={onSelect}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
