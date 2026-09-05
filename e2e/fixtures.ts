import { test as base, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Relative, because it is handed to the spawned server as DATA_DIR with cwd: root - the single
// source both the vault and projects fixtures below resolve against, rather than each
// recomputing the worker's data directory on its own.
const workerDataDir = (index: number) => path.join("e2e", ".tmp", `w${index}`);
const workerVault = (index: number) =>
  path.join(root, workerDataDir(index), "vault");
// Read in place, unlike the vault: nothing ever writes to the Kontext claude-home fixture, so
// every worker can point straight at the committed copy without one of its own.
const kontextClaudeDir = path.join(
  root,
  "server",
  "src",
  "kontext",
  "fixture",
  "claude",
);

/** Poll the API until the server answers, so tests never race the boot. */
async function waitForServer(url: string, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // not listening yet
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`server at ${url} did not start within ${timeoutMs}ms`);
}

/**
 * One server per worker, each with its own freshly seeded databases, so specs running in
 * parallel never share state. Ports start at 8150.
 */
export const test = base.extend<
  object,
  { appServer: string; vaultDir: string; projectsDir: string }
>({
  appServer: [
    async ({}, use, workerInfo) => {
      const port = 8150 + workerInfo.workerIndex;
      const dataDir = workerDataDir(workerInfo.workerIndex);
      rmSync(path.join(root, dataDir), { recursive: true, force: true });

      // Each worker indexes its own copy of the fixture vault, so a spec that adds a note never
      // shows up in another worker's tree.
      const vaultDir = workerVault(workerInfo.workerIndex);
      mkdirSync(vaultDir, { recursive: true });
      // The fixture is committed, so it always exists - no guard needed before the unconditional
      // handoff rewrite below, which reads a file straight back out of vaultDir.
      const fixture = path.join(root, "server", "src", "vault", "fixture");
      cpSync(fixture, vaultDir, { recursive: true });

      // The committed Handoff_leuchtturm.md names a synthetic path (~/Projekte/leuchtturm) that
      // couples to nothing, so npm start and the unit tests show "Repo nicht gefunden: leuchtturm"
      // - see server/src/vault/fixture/50_Workflow/Handoffs/Handoff_leuchtturm.md. Only this
      // worker's own copy is rewritten to point at the sample workshop's leuchtfeuer checkout
      // (server/src/projekte/sample.ts), which server/src/index.ts builds under
      // <DATA_DIR>/sample-projekte at the first scan - the exact join findRepos itself produces,
      // so stand.ts's lowercased path comparison couples the two without a realpath step.
      const handoffPath = path.join(
        vaultDir,
        "50_Workflow",
        "Handoffs",
        "Handoff_leuchtturm.md",
      );
      const leuchtfeuerPath = path.join(
        root,
        workerDataDir(workerInfo.workerIndex),
        "sample-projekte",
        "werkstatt",
        "leuchtfeuer",
      );
      writeFileSync(
        handoffPath,
        readFileSync(handoffPath, "utf8").replace(
          "~/Projekte/leuchtturm",
          leuchtfeuerPath,
        ),
      );

      // npx is a .cmd on Windows, which child_process cannot execute by its bare name.
      const npx = process.platform === "win32" ? "npx.cmd" : "npx";
      const server = spawn(npx, ["tsx", "server/src/index.ts"], {
        cwd: root,
        env: {
          ...process.env,
          PORT: String(port),
          DATA_DIR: dataDir,
          // BENCH_DOTENV=off keeps a developer's .env out of every e2e server whatever keys it
          // gains; VAULT_DIR then points at this worker's own copy of the fixture vault.
          BENCH_DOTENV: "off",
          VAULT_DIR: vaultDir,
          BENCH_GH: "off",
          // ...process.env above still carries a developer's own shell exports, and config.ts
          // reads PROJECT_ROOTS straight from process.env with no .env file involved - so a
          // real PROJECT_ROOTS exported in the shell would otherwise flip every worker onto the
          // real machine instead of the sample workshop the suite expects.
          PROJECT_ROOTS: "",
          // Same rationale: a real PLAUD_HOME exported in the shell would otherwise flip every
          // worker onto the real machine instead of the bundled fixture note.
          PLAUD_HOME: "",
          // Same rationale: real INBOX_WATCH / CONTROLLING_DIR exported in the shell would
          // otherwise flip every worker onto the real machine instead of the bundled Eingang
          // fixtures.
          INBOX_WATCH: "",
          CONTROLLING_DIR: "",
          // Points every worker at the committed Kontext fixture rather than a developer's real
          // ~/.claude, which locateKontext would otherwise read directly.
          BENCH_CLAUDE_DIR: kontextClaudeDir,
          // Same rationale as PLAUD_HOME above: a real MYCRAFTON_URL exported in the shell would
          // otherwise flip every worker onto a live host instead of leaving the deep-links panel
          // "not configured".
          MYCRAFTON_URL: "",
        },
        stdio: "ignore",
      });
      const base = `http://localhost:${port}`;
      await waitForServer(`${base}/api/vault/tree`);

      await use(base);

      server.kill();
    },
    { scope: "worker", auto: true },
  ],
  vaultDir: [
    async ({}, use, workerInfo) => {
      await use(workerVault(workerInfo.workerIndex));
    },
    { scope: "worker" },
  ],
  // server/src/index.ts joins "sample-projekte" onto the same DATA_DIR the server above was
  // spawned with - this mirrors that join rather than guessing the path independently.
  projectsDir: [
    async ({}, use, workerInfo) => {
      await use(
        path.join(
          root,
          workerDataDir(workerInfo.workerIndex),
          "sample-projekte",
        ),
      );
    },
    { scope: "worker" },
  ],
  baseURL: async ({ appServer }, use) => {
    await use(appServer);
  },
});

export { expect };
