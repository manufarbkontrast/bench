import os from "node:os";
import path from "node:path";
import { expandTilde } from "../config.js";

export interface LocatedKontext {
  claudeDir: string;
}

/**
 * Unlike the other locate modules, this one never falls back to a bundled sample: the real
 * machine reads the real ~/.claude, which is the point of the app. Tests and e2e point
 * BENCH_CLAUDE_DIR at the committed fixture instead of teaching this function about a fixture
 * path of its own.
 */
export function locateKontext(env: NodeJS.ProcessEnv): LocatedKontext {
  const override = env.BENCH_CLAUDE_DIR?.trim();
  return {
    claudeDir: override
      ? expandTilde(override)
      : path.join(os.homedir(), ".claude"),
  };
}
