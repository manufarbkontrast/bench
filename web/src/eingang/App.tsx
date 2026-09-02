import { useEffect, useState } from "react";
import BenchNav from "../shared/BenchNav";
import { api, HttpError } from "./api";
import InboxList from "./components/InboxList";
import type { EingangJobKind, InboxFile } from "./types";

const CONFLICT_MESSAGE = "Läuft bereits.";

export default function App() {
  const [files, setFiles] = useState<InboxFile[]>([]);
  const [conflict, setConflict] = useState<string | null>(null);

  const refetch = () => api.inbox().then((r) => setFiles(r.files));

  useEffect(() => {
    void refetch();
  }, []);

  async function runJob(kind: EingangJobKind, args?: Record<string, unknown>) {
    setConflict(null);
    try {
      await api.startJob(kind, args);
      await refetch();
    } catch (err) {
      if (err instanceof HttpError && err.status === 409) {
        setConflict(CONFLICT_MESSAGE);
        await refetch();
        return;
      }
      // A failed start otherwise is a network or server problem the user can retry - logged so it
      // is not silently dropped, without a banner for a request nothing else here reacts to.
      console.error(err);
    }
  }

  const handleCollect = () => void runJob("plaud-sync");
  const handleProcess = (name: string) =>
    void runJob("plaud-process", { file: name });

  return (
    <>
      <BenchNav active="eingang" />
      <main className="eingang">
        <header className="eingang-header">
          <h1>Eingang</h1>
          <button
            type="button"
            className="eingang-collect"
            onClick={handleCollect}
          >
            Einsammeln
          </button>
        </header>

        {conflict && <p className="eingang-conflict">{conflict}</p>}

        <section className="eingang-section">
          <h2>Neu und unverarbeitet</h2>
          <InboxList files={files} onProcess={handleProcess} />
        </section>
      </main>
    </>
  );
}
