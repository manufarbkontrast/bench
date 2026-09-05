import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  listProjects,
  openProjekteDb,
  replaceProjects,
  type ProjectRow,
} from "../../src/projekte/db.js";
import { scratchDir } from "./tmp.js";

const scratch = scratchDir("bench-projekte-db-");
afterAll(scratch.cleanup);

const leuchtfeuer: ProjectRow = {
  path: "/werkstatt/leuchtfeuer",
  name: "leuchtfeuer",
  kind: "git",
  remote: "git@example.com:leuchtfeuer.git",
  remoteLabel: "origin",
  branch: "main",
  lastCommitAt: 1_700_000_000,
  lastCommitSubject: "feat: raise the tower",
  dirty: 1,
  ahead: 1,
  behind: 0,
  notePath: "40_Projekte/leuchtfeuer.md",
  brand: "leuchtfeuer",
  status: "aktiv",
  issues: 2,
  prs: 1,
  groupKey: "werkstatt",
  scannedAt: 1_700_000_100,
};

const strandgut: ProjectRow = {
  path: "/atelier/strandgut",
  name: "strandgut",
  kind: "folder",
  remote: null,
  remoteLabel: null,
  branch: null,
  lastCommitAt: null,
  lastCommitSubject: null,
  dirty: 0,
  ahead: null,
  behind: null,
  notePath: null,
  brand: null,
  status: null,
  issues: null,
  prs: null,
  groupKey: "atelier",
  scannedAt: 1_700_000_100,
};

const treibgut: ProjectRow = {
  path: "/werkstatt/treibgut",
  name: "treibgut",
  kind: "git",
  remote: null,
  remoteLabel: null,
  branch: "main",
  lastCommitAt: 1_700_000_050,
  lastCommitSubject: "feat: collect flotsam",
  dirty: 0,
  ahead: null,
  behind: null,
  notePath: null,
  brand: null,
  status: null,
  issues: null,
  prs: null,
  groupKey: "werkstatt",
  scannedAt: 1_700_000_200,
};

describe("projekte db", () => {
  it("replaces the full set on each scan and round-trips camelCase fields, including nulls", () => {
    const db = openProjekteDb(path.join(scratch.dir, "projekte.sqlite"));

    const ordinal = (a: string, b: string): number =>
      Number(a > b) - Number(a < b);
    replaceProjects(db, [leuchtfeuer, strandgut]);
    expect(
      listProjects(db)
        .map((r) => r.path)
        .sort(ordinal),
    ).toEqual([leuchtfeuer.path, strandgut.path].sort(ordinal));

    replaceProjects(db, [treibgut]);
    const rows = listProjects(db);
    expect(rows).toEqual([treibgut]);
    expect(rows[0].remote).toBeNull();
    expect(rows[0].ahead).toBeNull();
    expect(rows[0].issues).toBeNull();
  });
});
