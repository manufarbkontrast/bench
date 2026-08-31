import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Link, useParams } from "react-router";
import { api } from "../api";
import { prepareMarkdown, resolveAsset } from "../markdown";
import { obsidianUrl } from "../obsidian";
import type { Note } from "../types";
import Backlinks from "./Backlinks";

interface Props {
  vaultName: string;
}

const APP_PREFIX = "/vault";
const FULL_DAY = /^\d{4}-\d{2}-\d{2}T00:00:00\.000Z$/;

/**
 * Obsidian notes conventionally repeat the filename as the body's own first heading; rendered
 * as markdown that becomes a second <h1> with the same text as the page's own title. Strip it
 * only on an exact match, so a heading that happens to differ from the filename still shows.
 */
function withoutLeadingTitle(body: string, title: string): string {
  const lines = body.split("\n");
  const first = lines.findIndex((line) => line.trim() !== "");
  if (first === -1 || lines[first].trim() !== `# ${title}`) return body;
  return lines.slice(first + 1).join("\n");
}

/** Frontmatter as text, one value per row; tags have their own list. */
function valueText(value: unknown): string {
  if (Array.isArray(value)) return value.map(valueText).join(", ");
  if (typeof value === "string" && FULL_DAY.test(value))
    return value.slice(0, 10);
  if (value !== null && typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function Frontmatter({ data }: { data: Record<string, unknown> }) {
  const rows = Object.entries(data).filter(([key]) => key !== "tags");
  if (rows.length === 0) return null;
  return (
    <table className="note-frontmatter" aria-label="Frontmatter">
      <tbody>
        {rows.map(([key, value]) => (
          <tr key={key}>
            <th scope="row">{key}</th>
            <td>{valueText(value)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function NoteView({ vaultName }: Props) {
  const path = useParams()["*"] ?? "";
  const [loaded, setLoaded] = useState<{ path: string; note: Note | null }>({
    path: "",
    note: null,
  });
  const [raw, setRaw] = useState(false);

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
    <article className="note">
      <header className="note-header">
        <p className="note-folder">{note.folder || "/"}</p>
        <h1>{note.title}</h1>
        <div className="note-actions">
          <a className="note-action" href={obsidianUrl(vaultName, note.path)}>
            In Obsidian öffnen
          </a>
          <button
            type="button"
            className="note-action"
            onClick={() => setRaw((v) => !v)}
          >
            {raw ? "Ansicht" : "Rohtext"}
          </button>
        </div>
        {note.tags.length > 0 && (
          <ul className="note-tags" aria-label="Tags">
            {note.tags.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        )}
        <Frontmatter data={note.frontmatter} />
      </header>
      {raw ? (
        <pre className="note-raw">{note.body}</pre>
      ) : (
        <div className="note-body">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              a: ({ href, children }) =>
                href?.startsWith(`${APP_PREFIX}/`) ? (
                  <Link to={href.slice(APP_PREFIX.length)}>{children}</Link>
                ) : (
                  <a href={href}>{children}</a>
                ),
              img: ({ src, alt }) => (
                <img
                  src={resolveAsset(src ?? "", note.folder)}
                  alt={alt ?? ""}
                />
              ),
            }}
          >
            {prepareMarkdown(
              withoutLeadingTitle(note.body, note.title),
              note.links,
            )}
          </ReactMarkdown>
        </div>
      )}
      <Backlinks items={note.backlinks} />
    </article>
  );
}
