import { useEffect, useState } from "react";
import BenchNav from "../shared/BenchNav";
import { api } from "./api";
import Board from "./components/Board";
import Detail from "./components/Detail";
import ProjectsTable from "./components/ProjectsTable";
import { dateText } from "./format";
import type { ListReply, ProjectDetailReply } from "./types";

type View = "table" | "board";

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
  const [view, setView] = useState<View>("table");
  const [detail, setDetail] = useState<ProjectDetailReply | null>(null);

  useEffect(() => {
    void api.list().then(setList);
  }, []);

  const rescan = async () => {
    setScanning(true);
    try {
      await api.scan();
      setList(await api.list());
    } catch (err) {
      // A failed scan is a network or server problem the user can just retry - logged so it is
      // not silently dropped, without a banner for a request nothing else here reacts to.
      console.error(err);
    } finally {
      setScanning(false);
    }
  };

  const openDetail = (path: string) => {
    void api.project(path).then(setDetail);
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
            <div className="projekte-view" role="group" aria-label="Ansicht">
              <button
                type="button"
                className="projekte-view-btn"
                aria-pressed={view === "table"}
                onClick={() => setView("table")}
              >
                Tabelle
              </button>
              <button
                type="button"
                className="projekte-view-btn"
                aria-pressed={view === "board"}
                onClick={() => setView("board")}
              >
                Board
              </button>
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
          <div className="projekte-content">
            <div className="projekte-primary">
              {view === "table" ? (
                <ProjectsTable projects={list.projects} onSelect={openDetail} />
              ) : (
                <Board projects={list.projects} onSelect={openDetail} />
              )}
            </div>
            {detail && (
              <Detail
                project={detail.project}
                duplicates={detail.duplicates}
                onClose={() => setDetail(null)}
              />
            )}
          </div>
        )}
      </main>
    </>
  );
}
