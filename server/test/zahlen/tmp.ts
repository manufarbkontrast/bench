import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

/** A per-suite scratch directory, removed in afterAll. */
export function scratchDir(prefix: string): {
  dir: string;
  cleanup: () => void;
} {
  const dir = mkdtempSync(path.join(os.tmpdir(), prefix));
  return {
    dir,
    cleanup: () => {
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
