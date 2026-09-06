import { recordingMetaText } from "../format";
import type {
  PlaudReply,
  PlaudSource,
  Recording,
  RecordingStatus,
} from "../types";

const STATUS_LABEL: Record<RecordingStatus, string> = {
  neu: "Neu",
  wird_geholt: "Wird geholt",
  im_eingang: "Im Eingang",
  im_archiv: "Im Archiv",
  notiz_vorhanden: "Notiz vorhanden",
};

const SOURCE_LINE: Record<Exclude<PlaudSource, "mcp">, string> = {
  sample: "Beispieldaten",
  off: "Plaud ist nicht konfiguriert.",
  unauthenticated: "Nicht angemeldet - im Terminal /plaud starten.",
  unreachable: "Plaud nicht erreichbar.",
};

function RecordingRow({
  recording,
  onFetch,
}: {
  recording: Recording;
  onFetch: (id: string) => void;
}) {
  const fetchable = recording.status === "neu";
  return (
    <li className="eingang-row">
      <div className="eingang-row-body">
        <span className="eingang-row-name">{recording.titel}</span>
        <div className="eingang-row-meta">
          <span className="eingang-chip">{STATUS_LABEL[recording.status]}</span>
          <span>{recordingMetaText(recording)}</span>
        </div>
      </div>
      <button
        type="button"
        aria-label={`Holen: ${recording.titel}`}
        disabled={!fetchable}
        title={fetchable ? undefined : STATUS_LABEL[recording.status]}
        onClick={() => onFetch(recording.id)}
      >
        Holen
      </button>
    </li>
  );
}

/** The recordings Plaud holds, marked by what is already local; nothing here polls the MCP. */
export default function AufnahmenPanel({
  reply,
  onFetch,
  onReload,
  onMore,
}: {
  reply: PlaudReply | null;
  onFetch: (id: string) => void;
  onReload: () => void;
  onMore: () => void;
}) {
  return (
    <section className="eingang-section" aria-labelledby="eingang-aufnahmen">
      <h2 id="eingang-aufnahmen">Plaud-Aufnahmen</h2>
      {reply === null ? (
        <p className="eingang-empty">Lädt …</p>
      ) : (
        <>
          {reply.source !== "mcp" && (
            <p className="eingang-source">{SOURCE_LINE[reply.source]}</p>
          )}
          {reply.recordings.length === 0 ? (
            <p className="eingang-empty">Keine Aufnahmen.</p>
          ) : (
            <ul className="eingang-list">
              {reply.recordings.map((r) => (
                <RecordingRow key={r.id} recording={r} onFetch={onFetch} />
              ))}
            </ul>
          )}
          <div className="eingang-section-actions">
            <button type="button" className="eingang-btn" onClick={onReload}>
              Neu laden
            </button>
            {reply.nextPage !== null && (
              <button type="button" className="eingang-btn" onClick={onMore}>
                Mehr laden
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
}
