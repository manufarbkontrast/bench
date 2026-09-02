import { useEffect, useState } from "react";
import BenchNav from "../shared/BenchNav";
import { api, HttpError } from "./api";
import InboxList from "./components/InboxList";
import JobsPanel from "./components/JobsPanel";
import LogView from "./components/LogView";
import SchedulePanel from "./components/SchedulePanel";
import type { EingangJobKind, InboxFile, JobRow, ScheduledRun } from "./types";

const CONFLICT_MESSAGE = "Läuft bereits.";

export default function App() {
  const [files, setFiles] = useState<InboxFile[]>([]);
  const [jobs, setJobs] = useState<JobRow[]>([]);
  // The moment the jobs list was fetched - JobsPanel's Dauer column reads it instead of calling
  // Date.now() itself, which would run during render and break React's purity rule.
  const [jobsFetchedAt, setJobsFetchedAt] = useState(0);
  const [runs, setRuns] = useState<ScheduledRun[]>([]);
  const [conflict, setConflict] = useState<string | null>(null);
  const [selectedJob, setSelectedJob] = useState<JobRow | null>(null);

  const refetchInbox = () => api.inbox().then((r) => setFiles(r.files));
  const refetchJobs = () =>
    api.jobs().then((r) => {
      setJobs(r.jobs);
      setJobsFetchedAt(Date.now());
    });

  useEffect(() => {
    void refetchInbox();
    void refetchJobs();
    void api.schedule().then((r) => setRuns(r.runs));
  }, []);

  async function runJob(kind: EingangJobKind, args?: Record<string, unknown>) {
    setConflict(null);
    try {
      await api.startJob(kind, args);
      await Promise.all([refetchInbox(), refetchJobs()]);
    } catch (err) {
      if (err instanceof HttpError && err.status === 409) {
        setConflict(CONFLICT_MESSAGE);
        await Promise.all([refetchInbox(), refetchJobs()]);
        return;
      }
      // A failed start otherwise is a network or server problem the user can retry - logged so it
      // is not silently dropped, without a banner for a request nothing else here reacts to.
      console.error(err);
    }
  }

  async function handleKill(id: number) {
    try {
      await api.killJob(id);
    } catch (err) {
      // A kill can lose a race against the job finishing on its own (409 "not running") - the
      // refetch below shows the real state either way, so nothing else reacts to this.
      console.error(err);
    }
    await refetchJobs();
  }

  const handleProcess = (name: string) =>
    void runJob("plaud-process", { file: name });

  return (
    <>
      <BenchNav active="eingang" />
      <main className="eingang">
        <header className="eingang-header">
          <h1>Eingang</h1>
        </header>

        {conflict && <p className="eingang-conflict">{conflict}</p>}

        <section className="eingang-section">
          <h2>Neu und unverarbeitet</h2>
          <InboxList files={files} onProcess={handleProcess} />
        </section>

        <JobsPanel
          jobs={jobs}
          now={jobsFetchedAt}
          onStart={(kind, args) => void runJob(kind, args)}
          onKill={(id) => void handleKill(id)}
          onSelect={setSelectedJob}
        />

        {selectedJob && (
          <LogView job={selectedJob} onClose={() => setSelectedJob(null)} />
        )}

        <SchedulePanel runs={runs} />
      </main>
    </>
  );
}
