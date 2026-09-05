import { useEffect, useState } from "react";
import BenchNav from "../shared/BenchNav";
import { api } from "./api";
import Board from "./components/Board";
import Detail from "./components/Detail";
import ProjectsTable from "./components/ProjectsTable";
import ProjektView from "./components/ProjektView";
import { dateText } from "./format";
import type { ListReply, ProjectDetailReply, StandReply } from "./types";

type View = "projekte" | "table" | "board";

function summaryLine(list: ListReply): string {
  const repos = list.projects.filter((p) => p.kind === "git").length;
  const duplicates = list.projects.filter((p) => p.isDuplicate).length;
  const base = `${list.projects.length} Projekte · ${repos} Repos · ${duplicates} Dubletten`;
  return list.scannedAt === null
    ? base
    : `${base} · zuletzt ${dateText(list.scannedAt)}`;
}

/** The viewer's own calendar day, so a handoff's age never shifts by their UTC offset - the
    getter-based counterpart to server/src/projekte/stand.ts's localDay. */
function todayLocal(): string {
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${String(now.getFullYear())}-${mm}-${dd}`;
}

function Primary({
  view,
  list,
  stand,
  today,
  onSelect,
}: {
  view: View;
  list: ListReply;
  stand: StandReply;
  today: string;
  onSelect: (path: string) => void;
}) {
  if (view === "projekte") {
    return <ProjektView stand={stand} today={today} onSelect={onSelect} />;
  }
  if (list.projects.length === 0) {
    return <p className="projekte-empty">Keine Projekte gefunden.</p>;
  }
  return view === "table" ? (
    <ProjectsTable projects={list.projects} onSelect={onSelect} />
  ) : (
    <Board projects={list.projects} onSelect={onSelect} />
  );
}

export default function App() {
  const [list, setList] = useState<ListReply | null>(null);
  const [stand, setStand] = useState<StandReply | null>(null);
  const [scanning, setScanning] = useState(false);
  const [view, setView] = useState<View>("projekte");
  const [detail, setDetail] = useState<ProjectDetailReply | null>(null);
  const today = todayLocal();

  useEffect(() => {
    void api.list().then(setList);
    void api.stand().then(setStand);
  }, []);

  const rescan = async () => {
    setScanning(true);
    try {
      await api.scan();
      setList(await api.list());
      setStand(await api.stand());
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
                aria-pressed={view === "projekte"}
                onClick={() => setView("projekte")}
              >
                Projekte
              </button>
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

        {list && stand && (
          <div className="projekte-content">
            <div className="projekte-primary">
              <Primary
                view={view}
                list={list}
                stand={stand}
                today={today}
                onSelect={openDetail}
              />
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
