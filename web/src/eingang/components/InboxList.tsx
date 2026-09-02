import { fileMetaText } from "../format";
import { isProcessable, type InboxFile } from "../types";

const STATUS_LABEL: Record<InboxFile["status"], string> = {
  unverarbeitet: "Unverarbeitet",
  in_arbeit: "In Arbeit",
  notiz_vorhanden: "Notiz vorhanden",
};

function StatusChip({ status }: { status: InboxFile["status"] }) {
  return <span className="eingang-chip">{STATUS_LABEL[status]}</span>;
}

function ProcessButton({
  file,
  onProcess,
}: {
  file: InboxFile;
  onProcess: (name: string) => void;
}) {
  const processable = isProcessable(file);
  return (
    <button
      type="button"
      aria-label={`Verarbeiten: ${file.name}`}
      disabled={!processable}
      title={processable ? undefined : "Erst einsammeln"}
      onClick={() => onProcess(file.name)}
    >
      Verarbeiten
    </button>
  );
}

function InboxRow({
  file,
  onProcess,
}: {
  file: InboxFile;
  onProcess: (name: string) => void;
}) {
  return (
    <li className="eingang-row">
      <div className="eingang-row-body">
        <span className="eingang-row-name">{file.name}</span>
        <div className="eingang-row-meta">
          <StatusChip status={file.status} />
          <span>{fileMetaText(file)}</span>
        </div>
      </div>
      {file.kind === "audio" ? (
        <span className="eingang-row-audio">Nur Ablage</span>
      ) : (
        <ProcessButton file={file} onProcess={onProcess} />
      )}
    </li>
  );
}

/** The inbox listing: one row per watched file, newest first as the server already sorted it. */
export default function InboxList({
  files,
  onProcess,
}: {
  files: InboxFile[];
  onProcess: (name: string) => void;
}) {
  if (files.length === 0) {
    return <p className="eingang-empty">Nichts Neues.</p>;
  }
  return (
    <ul className="eingang-list">
      {files.map((file) => (
        <InboxRow
          key={`${file.dir}/${file.name}`}
          file={file}
          onProcess={onProcess}
        />
      ))}
    </ul>
  );
}
