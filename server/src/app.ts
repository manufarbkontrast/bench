import express from "express";
import type Database from "better-sqlite3";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  aufgabenRouter,
  type AufgabenContext,
  type AufgabenSources,
} from "./aufgaben/routes.js";
import { crmRouter } from "./crm/routes.js";
import { listProjects } from "./projekte/db.js";
import { projekteRouter, type ProjekteContext } from "./projekte/routes.js";
import { rolodexRouter } from "./rolodex/routes/index.js";
import type { Repo } from "./rolodex/db/index.js";
import { vaultRouter, type VaultContext } from "./vault/routes/index.js";

const webDist = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../web/dist",
);

/** The apps with their own HTML entry point in web/dist, for deep-link fallback. */
const APPS = ["crm", "rolodex", "vault", "projekte", "aufgaben"];

export interface Dbs {
  crm: Database.Database;
  rolodex: Repo;
  vault: VaultContext;
  projekte: ProjekteContext;
  aufgaben: AufgabenSources;
}

/**
 * The GitHub labels aufgaben's issue view fetches - one per scanned project with a remote, read
 * fresh on each call rather than snapshotted once. The route dedupes; two projects can share a
 * label. Built here, not in server/src/aufgaben/, which never imports from server/src/projekte/.
 */
function githubLabelsFrom(projekteDb: Database.Database): () => string[] {
  return () =>
    listProjects(projekteDb)
      .map((project) => project.remoteLabel)
      .filter((label): label is string => label !== null);
}

function aufgabenContext(dbs: Dbs): AufgabenContext {
  return { ...dbs.aufgaben, githubLabels: githubLabelsFrom(dbs.projekte.db) };
}

/** Build the Express app around the open databases. */
export function createApp(dbs: Dbs): express.Express {
  const app = express();
  // Rolodex accepts whole address books and photos in one request, which is why this is not 2mb.
  app.use(express.json({ limit: "25mb" }));

  // Express sends an ETag with every JSON reply, and a browser that revalidates one gets 304 with
  // an empty body - which the client then tries to parse. On a machine talking to itself there is
  // nothing to save by caching a list that changes every time you touch it.
  app.use("/api", (_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });

  app.use("/api/crm", crmRouter(dbs.crm));
  app.use("/api/rolodex", rolodexRouter(dbs.rolodex));
  app.use("/api/vault", vaultRouter(dbs.vault));
  app.use("/api/projekte", projekteRouter(dbs.projekte, dbs.vault.db));
  app.use("/api/aufgaben", aufgabenRouter(aufgabenContext(dbs), dbs.vault));

  if (existsSync(webDist)) {
    app.use(express.static(webDist));
    app.use((req, res, next) => {
      if (req.method !== "GET" || req.path.startsWith("/api")) {
        next();
        return;
      }
      const owner = APPS.find(
        (name) => req.path === `/${name}` || req.path.startsWith(`/${name}/`),
      );
      res.sendFile(path.join(webDist, owner ?? "", "index.html"));
    });
  }

  // Express 5 forwards a rejected async handler here automatically. Without this, its default
  // error page answers with an HTML stack trace - absolute paths from a machine only Bench runs
  // on - instead of the JSON every other reply on /api already is.
  app.use(
    (
      err: unknown,
      _req: express.Request,
      res: express.Response,
      next: express.NextFunction,
    ) => {
      // Express's own documented rule: once headers are sent, delegate to its default handler
      // (which closes the connection) rather than trying to send a second response.
      if (res.headersSent) {
        next(err);
        return;
      }
      console.error(err);
      res.status(500).json({ error: "Internal server error" });
    },
  );

  return app;
}
