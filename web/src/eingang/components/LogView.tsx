import { useEffect, useState } from "react";
import { api } from "../api";
import { jobKindLabel, jobStatusLabel } from "../format";
import type { JobRow } from "../types";

/** The log panel for one job: the label, a status line and the raw log text, polling
    GET /jobs/:id while the job is still running - closed with Schließen or Escape. */
export default function LogView({
  job,
  onClose,
}: {
  job: JobRow;
  onClose: () => void;
}) {
  const [current, setCurrent] = useState(job);
  const [log, setLog] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function poll(): Promise<string> {
      const res = await api.job(job.id);
      if (!cancelled) {
        setCurrent(res.job);
        setLog(res.log);
      }
      return res.job.status;
    }

    void poll();

    if (job.status !== "running") {
      return () => {
        cancelled = true;
      };
    }

    // A 2s tick reads as a human-watchable tail, not a stream - fast enough to feel live, slow
    // enough not to hammer the log file while a job runs.
    const timer = setInterval(() => {
      void poll().then((status) => {
        if (status !== "running") clearInterval(timer);
      });
    }, 2000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [job.id, job.status]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <section className="eingang-logview" aria-label="Protokoll">
      <div className="eingang-logview-header">
        <h2>{jobKindLabel(current)}</h2>
        <button type="button" className="eingang-btn" onClick={onClose}>
          Schließen
        </button>
      </div>
      <p className="eingang-logview-status">
        Status: {jobStatusLabel(current.status)}
      </p>
      <pre className="eingang-logview-log">{log}</pre>
    </section>
  );
}
