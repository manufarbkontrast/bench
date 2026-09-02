import { scheduledRunText } from "../format";
import type { ScheduledRun } from "../types";

/** The launchd entries this machine already runs Eingang's jobs from - Bench only reads them,
    it never schedules anything itself. */
export default function SchedulePanel({ runs }: { runs: ScheduledRun[] }) {
  return (
    <section className="eingang-section">
      <h2>Geplante Läufe</h2>
      {runs.length === 0 ? (
        <p className="eingang-empty">Keine geplanten Läufe gefunden.</p>
      ) : (
        <ul className="eingang-schedule-list">
          {runs.map((run) => (
            <li key={run.label}>{scheduledRunText(run)}</li>
          ))}
        </ul>
      )}
      <p className="eingang-schedule-note">
        Bench plant nichts; das sind die launchd-Einträge dieser Maschine.
      </p>
    </section>
  );
}
