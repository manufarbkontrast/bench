import { Router } from "express";
import type { LinkRow, NoteRow, TagRow } from "../db.js";
import { queryText } from "./query.js";
import type { VaultContext } from "./index.js";

interface Count {
  c: number;
}

export function notesRouter({ db, name }: VaultContext): Router {
  const router = Router();

  router.get("/info", (_req, res) => {
    const { c } = db.prepare("SELECT COUNT(*) AS c FROM notes").get() as Count;
    res.json({ name, notes: c });
  });

  router.get("/tree", (_req, res) => {
    res.json(
      db.prepare("SELECT path, title, folder FROM notes ORDER BY path").all(),
    );
  });

  router.get("/note", (req, res) => {
    const relPath = queryText(req.query.path);
    if (!relPath) {
      res.status(400).json({ error: "path is required" });
      return;
    }
    const note = db
      .prepare("SELECT * FROM notes WHERE path = ?")
      .get(relPath) as NoteRow | undefined;
    if (!note) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const tags = (
      db.prepare("SELECT tag FROM tags WHERE path = ?").all(relPath) as TagRow[]
    ).map((t) => t.tag);
    const links = (
      db
        .prepare("SELECT * FROM links WHERE from_path = ? ORDER BY rowid")
        .all(relPath) as LinkRow[]
    ).map((l) => ({
      target: l.target,
      heading: l.heading,
      alias: l.alias,
      embed: l.embed === 1,
      toPath: l.to_path,
    }));
    const backlinks = db
      .prepare(
        "SELECT DISTINCT n.path, n.title FROM links l JOIN notes n ON n.path = l.from_path WHERE l.to_path = ? ORDER BY n.title",
      )
      .all(relPath);
    res.json({
      path: note.path,
      title: note.title,
      folder: note.folder,
      frontmatter: JSON.parse(note.frontmatter) as Record<string, unknown>,
      body: note.body,
      mtime: note.mtime,
      tags,
      links,
      backlinks,
    });
  });

  return router;
}
