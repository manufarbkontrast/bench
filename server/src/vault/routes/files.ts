import { Router } from "express";
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { queryText } from "./query.js";
import type { VaultContext } from "./index.js";
import { skipped } from "../index/scan.js";

/** Attachments (images, PDFs) referenced from notes, served from inside the vault and nowhere else. */
export function filesRouter({ dir }: VaultContext): Router {
  const root = path.resolve(dir);
  const router = Router();

  router.get("/file", (req, res) => {
    const relPath = queryText(req.query.path);
    const abs = path.resolve(root, relPath);
    const rel = path.relative(root, abs);
    // The route must not serve what the index refuses to see: mirror the scanner's ignore rule.
    const hidden = rel.split(path.sep).some(skipped);
    if (
      !relPath ||
      !rel ||
      rel.startsWith("..") ||
      path.isAbsolute(rel) ||
      hidden
    ) {
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
