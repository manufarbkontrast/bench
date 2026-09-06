import ProjektCard, { RepoRow } from "./ProjektCard";
import type { StandReply } from "../types";

export default function ProjektView({
  stand,
  today,
  onSelect,
}: {
  stand: StandReply;
  today: string;
  onSelect: (path: string) => void;
}) {
  return (
    <div className="projekte-stand">
      {stand.warnings.length > 0 && (
        <ul className="projekte-stand-warnings">
          {stand.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      )}
      {stand.projekte.length === 0 ? (
        <p className="projekte-empty">Keine Handoffs.</p>
      ) : (
        <div className="projekte-stand-cards">
          {stand.projekte.map((projekt) => (
            <ProjektCard
              key={projekt.slug}
              projekt={projekt}
              today={today}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
      <section className="projekte-stand-rest">
        <h2>Ohne Projekt</h2>
        {stand.ohneProjekt.length === 0 ? (
          <p className="projekte-empty">
            Alle Repos sind einem Projekt zugeordnet.
          </p>
        ) : (
          <ul className="projekte-stand-repos">
            {stand.ohneProjekt.map((repo) => (
              <RepoRow key={repo.path} repo={repo} onSelect={onSelect} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
