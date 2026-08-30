import { cpSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** @public read directly by tests arriving in later tasks; not every caller goes through copyFixture. */
export const FIXTURE_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../src/vault/fixture",
);

/** A private copy of the fixture vault, so a test that writes into it disturbs nobody. */
export function copyFixture(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "bench-vault-"));
  cpSync(FIXTURE_DIR, dir, { recursive: true });
  return dir;
}
