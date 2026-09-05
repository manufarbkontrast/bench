import { Link } from "react-router";
import { noteUrl } from "../tree";
import type { Backlink } from "../types";

export default function Backlinks({ items }: { items: Backlink[] }) {
  return (
    <section className="note-backlinks" aria-labelledby="backlinks-heading">
      <h2 id="backlinks-heading">Verweise auf diese Notiz</h2>
      {items.length === 0 ? (
        <p className="note-empty">Keine Verweise.</p>
      ) : (
        <ul>
          {items.map((b) => (
            <li key={b.path}>
              <Link to={noteUrl(b.path)}>{b.title}</Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
