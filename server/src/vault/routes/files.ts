import { Router } from "express";
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { queryText } from "./query.js";
import type { VaultContext } from "./index.js";

/** Attachments (images, PDFs) referenced from notes, served from inside the vault and nowhere else. */
export function filesRouter({ dir }: VaultContext): Router {
  const root = path.resolve(dir);
  const router = Router();

  router.get("/file", (req, res) => {
    const relPath = queryText(req.query.path);
    const abs = path.resolve(root, relPath);
    const rel = path.relative(root, abs);
    if (!relPath || !rel || rel.startsWith("..") || path.isAbsolute(rel)) {
      res.status(400).json({ error: "path must stay inside the vault" });
      return;
    }
    if (!existsSync(abs) || !statSync(abs).isFile()) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.sendFile(abs);
  });

  return router;
}
