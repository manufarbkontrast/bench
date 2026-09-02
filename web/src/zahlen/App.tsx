import { useEffect, useState } from "react";
import BenchNav from "../shared/BenchNav";
import { api, fileUrl } from "./api";
import KpiTable from "./components/KpiTable";
import RunsList from "./components/RunsList";
import { breakEvenText, runLineText } from "./format";
import type { LinksReply, RunFolder, RunReply } from "./types";

/** The four myCrafton deep links routes.ts always answers, labelled - a closed catalog
    (server/src/zahlen/routes.ts DEEP_LINK_PATHS), so indexing this needs no fallback. */
const PATH_LABEL: Record<string, string> = {
  "/": "Start",
  "/umlagerungen": "Umlagerungen",
  "/nachbestellungen": "Nachbestellungen",
  "/marken": "Marken",
};

const NO_RUN: RunReply = { run: null };
const NO_LINKS: LinksReply = { base: null, paths: [] };

/** `base` is a plain prop rather than `links.base` read again here, so it stays narrowed to
    `string` inside the callback - unlike a closure over `links.base` itself, which widens back
    to `string | null` past the ternary that checked it. */
function MyCraftonLinks({ base, paths }: { base: string; paths: string[] }) {
  return (
    <div className="zahlen-links">
      {paths.map((path) => (
        <a key={path} href={base + path} target="_blank" rel="noreferrer">
          {PATH_LABEL[path]}
        </a>
      ))}
    </div>
  );
}

export default function App() {
  const [current, setCurrent] = useState<RunReply>(NO_RUN);
  const [runs, setRuns] = useState<RunFolder[]>([]);
  const [links, setLinks] = useState<LinksReply>(NO_LINKS);

  useEffect(() => {
    void api.last().then(setCurrent);
    void api.runs().then((r) => setRuns(r.runs));
    void api.links().then(setLinks);
  }, []);

  const selectRun = (folder: string) => void api.run(folder).then(setCurrent);

  return (
    <>
      <BenchNav active="zahlen" />
      <main className="zahlen">
        <header className="zahlen-header">
          <h1>Zahlen</h1>
        </header>

        <section className="zahlen-section">
          <h2>Letzter Lauf</h2>
          {current.run === null ? (
            <p className="zahlen-empty">Noch kein Lauf.</p>
          ) : (
            <>
              <p className="zahlen-run-line">{runLineText(current.run)}</p>
              <KpiTable kpis={current.kpis} />
              <p className="zahlen-breakeven">
                {breakEvenText(current.breakEven)}
              </p>
            </>
          )}
        </section>

        <section className="zahlen-section">
          <h2>Archiv</h2>
          <RunsList
            runs={runs}
            selected={current.run === null ? null : current.run.folder}
            onSelect={selectRun}
          />
        </section>

        {current.run !== null && (
          <section className="zahlen-section">
            <h2>Bericht</h2>
            <iframe
              title="Bericht"
              className="zahlen-bericht"
              src={fileUrl(current.run.folder, "bericht.html")}
            />
          </section>
        )}

        {current.run !== null && (
          <section className="zahlen-section">
            <h2>Zusammenfassung</h2>
            <pre className="zahlen-md">{current.zusammenfassung}</pre>
            <div className="zahlen-downloads">
              <a href={fileUrl(current.run.folder, "rohdaten.json")}>
                rohdaten.json
              </a>
              <a href={fileUrl(current.run.folder, "zusammenfassung.md")}>
                zusammenfassung.md
              </a>
            </div>
          </section>
        )}

        <section className="zahlen-section">
          <h2>myCrafton</h2>
          {links.base === null ? (
            <p className="zahlen-empty">Nicht konfiguriert.</p>
          ) : (
            <MyCraftonLinks base={links.base} paths={links.paths} />
          )}
        </section>
      </main>
    </>
  );
}
