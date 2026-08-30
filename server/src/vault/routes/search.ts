import { Router } from "express";
import { queryText } from "./query.js";
import type { VaultContext } from "./index.js";

/** Each word becomes a quoted prefix term, so punctuation in the query cannot become FTS syntax. */
function ftsQuery(q: string): string {
  return q
    .split(/\s+/)
    .filter(Boolean)
    .map((term) => `"${term.replaceAll('"', '""')}"*`)
    .join(" ");
}

export function searchRouter({ db }: VaultContext): Router {
  const router = Router();

  router.get("/search", (req, res) => {
    const match = ftsQuery(queryText(req.query.q).trim());
    if (!match) {
      res.json([]);
      return;
    }
    // bm25 weights: path is unindexed, the title counts eight times a body hit.
    res.json(
      db
        .prepare(
          `SELECT n.path, n.title, n.folder, snippet(notes_fts, 2, '[', ']', '…', 12) AS snippet
           FROM notes_fts f JOIN notes n ON n.path = f.path
           WHERE notes_fts MATCH ?
           ORDER BY bm25(notes_fts, 0, 8, 1)
           LIMIT 20`,
        )
        .all(match),
    );
  });

  return router;
}
