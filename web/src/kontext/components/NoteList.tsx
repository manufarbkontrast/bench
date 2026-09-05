import { EMPTY_TEXT, noteHref } from "../format";
import type { VaultNote } from "../types";

/** A vault note's body as a preformatted block under a heading that links back into the vault -
    the shape Profil, Regeln's Workflow (Vault) subsection and Stand (rendered as a single-note
    list) all share. */
export default function NoteList({ notes }: { notes: VaultNote[] }) {
  if (notes.length === 0) {
    return <p className="kontext-empty">{EMPTY_TEXT}</p>;
  }
  return (
    <div className="kontext-notes">
      {notes.map((note) => (
        <div key={note.path} className="kontext-note">
          <h3>
            <a href={noteHref(note.path)}>{note.title}</a>
          </h3>
          <pre className="kontext-body">{note.body}</pre>
        </div>
      ))}
    </div>
  );
}
