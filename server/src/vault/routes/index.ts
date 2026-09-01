/** Vault API: the index of one Obsidian vault, read-only. Mounted at /api/vault. */
import { Router } from "express";
import type Database from "better-sqlite3";
import { filesRouter } from "./files.js";
import { notesRouter } from "./notes.js";
import { searchRouter } from "./search.js";
import { tasksRouter } from "./tasks.js";

export interface VaultContext {
  db: Database.Database;
  /** Absolute path of the vault on disk. */
  dir: string;
  /** What Obsidian calls the vault - its folder name - for obsidian:// links. */
  name: string;
}

export function vaultRouter(ctx: VaultContext): Router {
  const router = Router();
  router.use(notesRouter(ctx));
  router.use(searchRouter(ctx));
  router.use(filesRouter(ctx));
  router.use(tasksRouter(ctx));
  return router;
}
