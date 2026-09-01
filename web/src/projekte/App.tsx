import { useEffect, useState } from "react";
import BenchNav from "../shared/BenchNav";
import { api } from "./api";
import ProjectsTable from "./components/ProjectsTable";
import { dateText } from "./format";
import type { ListReply } from "./types";

function summaryLine(list: ListReply): string {
  const repos = list.projects.filter((p) => p.kind === "git").length;
  const duplicates = list.projects.filter((p) => p.isDuplicate).length;
  const base = `${list.projects.length} Projekte · ${repos} Repos · ${duplicates} Dubletten`;
  return list.scannedAt === null
    ? base
    : `${base} · zuletzt ${dateText(list.scannedAt)}`;
}

export default function App() {
  const [list, setList] = useState<ListReply | null>(null);
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    void api.list().then(setList);
  }, []);

  const rescan = async () => {
    setScanning(true);
    await api.scan();
    setList(await api.list());
    setScanning(false);
  };

  return (
    <>
      <BenchNav active="projekte" />
      <main className="projekte">
        <header className="projekte-header">
          <div>
            <h1>Projekte</h1>
            <p className="projekte-summary">
              {list ? summaryLine(list) : "Noch nicht gescannt."}
            </p>
          </div>
          <div className="projekte-actions">
            <div className="projekte-view" role="tablist" aria-label="Ansicht">
              <span
                className="projekte-view-tab active"
                role="tab"
                aria-selected="true"
              >
                Tabelle
              </span>
            </div>
            <button
              type="button"
              className="projekte-scan"
              onClick={() => void rescan()}
              disabled={scanning}
            >
              {scanning ? "Scannt …" : "Neu scannen"}
            </button>
          </div>
        </header>

        {list?.projects.length === 0 && (
          <p className="projekte-empty">Keine Projekte gefunden.</p>
        )}
        {list && list.projects.length > 0 && (
          <ProjectsTable projects={list.projects} />
        )}
      </main>
    </>
  );
}
