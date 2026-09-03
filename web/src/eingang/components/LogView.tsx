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
    let timer: ReturnType<typeof setInterval> | undefined;

    async function poll(): Promise<string> {
      const res = await api.job(job.id);
      if (!cancelled) {
        setCurrent(res.job);
        setLog(res.log);
      }
      return res.job.status;
    }

    async function tick(): Promise<void> {
      try {
        const status = await poll();
        if (status !== "running" && timer !== undefined) clearInterval(timer);
      } catch {
        // A dead server will not come back mid-panel, and would otherwise tick forever with an
        // unhandled rejection every 2s - closing and reopening the log re-polls from scratch.
        if (timer !== undefined) clearInterval(timer);
      }
    }

    async function run(): Promise<void> {
      // Gating the interval on this first poll's own result, rather than the `job` prop passed
      // in at mount, means a job that already turned terminal by the time this resolves costs no
      // interval at all - the old stale-prop check still started one, wasting a 2s tick only to
      // self-stop on its first fire.
      const status = await poll();
      if (cancelled || status !== "running") return;
      // A 2s tick reads as a human-watchable tail, not a stream - fast enough to feel live, slow
      // enough not to hammer the log file while a job runs.
      timer = setInterval(() => void tick(), 2000);
    }

    void run();

    return () => {
      cancelled = true;
      if (timer !== undefined) clearInterval(timer);
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
