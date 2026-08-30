import { test as base, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

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
export const test = base.extend<object, { appServer: string }>({
  appServer: [
    async ({}, use, workerInfo) => {
      const port = 8150 + workerInfo.workerIndex;
      const dataDir = path.join("e2e", ".tmp", `w${workerInfo.workerIndex}`);
      rmSync(path.join(root, dataDir), { recursive: true, force: true });

      // Each worker indexes its own copy of the fixture vault, so a spec that adds a note never
      // shows up in another worker's tree.
      const vaultDir = path.join(root, dataDir, "vault");
      mkdirSync(vaultDir, { recursive: true });
      const fixture = path.join(root, "server", "src", "vault", "fixture");
      if (existsSync(fixture)) cpSync(fixture, vaultDir, { recursive: true });

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
  baseURL: async ({ appServer }, use) => {
    await use(appServer);
  },
});

export { expect };
