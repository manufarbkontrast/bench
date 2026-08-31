import { useEffect, useState } from "react";
import { useParams } from "react-router";
import { api } from "../api";
import type { Note } from "../types";

interface Props {
  vaultName: string;
}

export default function NoteView({ vaultName }: Props) {
  const path = useParams()["*"] ?? "";
  const [loaded, setLoaded] = useState<{ path: string; note: Note | null }>({
    path: "",
    note: null,
  });
  useEffect(() => {
    api
      .note(path)
      .then((note) => setLoaded({ path, note }))
      .catch(() => setLoaded({ path, note: null }));
  }, [path]);
  if (loaded.path !== path) return null;
  if (!loaded.note)
    return <p className="note-missing">Notiz nicht gefunden: {path}</p>;
  const { note } = loaded;
  return (
    <article className="note" data-vault={vaultName}>
      <p className="note-folder">{note.folder || "/"}</p>
      <h1>{note.title}</h1>
      <pre className="note-raw">{note.body}</pre>
    </article>
  );
}
