import {
  EM_DASH,
  dateTimeText,
  durationText,
  jobKindLabel,
  jobStatusLabel,
} from "../format";
import { canCancel, type EingangJobKind, type JobRow } from "../types";

const HEADERS = ["Job", "Status", "Gestartet", "Dauer", "Ende"];

interface StartButton {
  label: string;
  kind: EingangJobKind;
  args?: Record<string, unknown>;
}

/** The one place jobs get started from - Task 6's header Einsammeln button moved here so a
    running or finished job of every kind, including it, shows up in the same table below. */
const START_BUTTONS: StartButton[] = [
  { label: "Einsammeln", kind: "plaud-sync" },
  {
    label: "Controlling Zwischenstand",
    kind: "controlling",
    args: { modus: "zwischenstand" },
  },
  {
    label: "Controlling Abschluss",
    kind: "controlling",
    args: { modus: "abschluss" },
  },
  { label: "Vault neu indexieren", kind: "vault-reindex" },
  { label: "Projekte scannen", kind: "projekte-scan" },
];

function JobRowView({
  job,
  now,
  onKill,
  onSelect,
}: {
  job: JobRow;
  now: number;
  onKill: (id: number) => void;
  onSelect: (job: JobRow) => void;
}) {
  const label = jobKindLabel(job);
  const showAbbrechen = job.status === "running" && canCancel(job.kind);
  return (
    <tr>
      <td>
        <button
          type="button"
          className="eingang-jobs-name"
          aria-label={`Protokoll: ${label}`}
          onClick={() => onSelect(job)}
        >
          {label}
        </button>
      </td>
      <td>
        <span className="eingang-jobs-status">
          {jobStatusLabel(job.status)}
        </span>
        {showAbbrechen && (
          <button
            type="button"
            className="eingang-kill-btn"
            onClick={() => onKill(job.id)}
          >
            Abbrechen
          </button>
        )}
      </td>
      <td>{dateTimeText(job.startedAt)}</td>
      <td>{durationText(job, now)}</td>
      <td>
        {job.finishedAt === null ? EM_DASH : dateTimeText(job.finishedAt)}
      </td>
    </tr>
  );
}

/** Jobs: the start buttons for every kind Eingang can run, and the last 50 runs the server
    tracked - selecting a row's name opens its live log. `now` is the moment `jobs` was fetched
    (App.tsx captures it alongside the fetch itself, not here) rather than read fresh with
    Date.now() during render, which React's purity rule forbids. */
export default function JobsPanel({
  jobs,
  now,
  onStart,
  onKill,
  onSelect,
}: {
  jobs: JobRow[];
  now: number;
  onStart: (kind: EingangJobKind, args?: Record<string, unknown>) => void;
  onKill: (id: number) => void;
  onSelect: (job: JobRow) => void;
}) {
  return (
    <section className="eingang-section">
      <h2>Jobs</h2>
      <div className="eingang-jobs-actions">
        {START_BUTTONS.map((button) => (
          <button
            key={button.label}
            type="button"
            className="eingang-btn"
            onClick={() => onStart(button.kind, button.args)}
          >
            {button.label}
          </button>
        ))}
      </div>
      {jobs.length === 0 ? (
        <p className="eingang-empty">Keine Jobs.</p>
      ) : (
        <table className="eingang-jobs-table">
          <thead>
            <tr>
              {HEADERS.map((header) => (
                <th key={header} scope="col">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => (
              <JobRowView
                key={job.id}
                job={job}
                now={now}
                onKill={onKill}
                onSelect={onSelect}
              />
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
