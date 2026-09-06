import { useState } from "react";
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

function ProjektSelect({
  file,
  slugs,
  projekt,
  onChange,
}: {
  file: InboxFile;
  slugs: string[];
  projekt: string;
  onChange: (value: string) => void;
}) {
  return (
    <select
      aria-label={`Projekt: ${file.name}`}
      className="eingang-row-select"
      value={projekt}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">Kein Projekt</option>
      {slugs.map((slug) => (
        <option key={slug} value={slug}>
          {slug}
        </option>
      ))}
    </select>
  );
}

function ProcessButton({
  file,
  projekt,
  onProcess,
}: {
  file: InboxFile;
  projekt: string;
  onProcess: (name: string, projekt: string | null) => void;
}) {
  const processable = isProcessable(file);
  return (
    <button
      type="button"
      aria-label={`Verarbeiten: ${file.name}`}
      disabled={!processable}
      title={processable ? undefined : "Erst einsammeln"}
      onClick={() => onProcess(file.name, projekt === "" ? null : projekt)}
    >
      Verarbeiten
    </button>
  );
}

function InboxRow({
  file,
  slugs,
  onProcess,
}: {
  file: InboxFile;
  slugs: string[];
  onProcess: (name: string, projekt: string | null) => void;
}) {
  const [projekt, setProjekt] = useState("");
  const processable = isProcessable(file);
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
        <>
          {processable && (
            <ProjektSelect
              file={file}
              slugs={slugs}
              projekt={projekt}
              onChange={setProjekt}
            />
          )}
          <ProcessButton file={file} projekt={projekt} onProcess={onProcess} />
        </>
      )}
    </li>
  );
}

/** The inbox listing: one row per watched file, newest first as the server already sorted it. */
export default function InboxList({
  files,
  slugs,
  onProcess,
}: {
  files: InboxFile[];
  slugs: string[];
  onProcess: (name: string, projekt: string | null) => void;
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
          slugs={slugs}
          onProcess={onProcess}
        />
      ))}
    </ul>
  );
}
