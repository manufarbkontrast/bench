import "@testing-library/jest-dom/vitest";
import { cleanup, configure } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";

// findBy* and waitFor give up after 1000ms of wall-clock time, and a worker starved by a second
// vitest process can exceed that: a 37ms test once took 3.7s and failed a whole check. The same
// reasoning as testTimeout in vite.config.ts - five times the default, and a third of that 15s,
// so a query that genuinely fails still reports its own message before the test times out.
configure({ asyncUtilTimeout: 5000 });

// jsdom's Blob has no text(), which is how Rolodex reads a file the moment you choose one. The
// FileReader it does implement would only be a longer way of doing the same thing.
// The cast is what makes the check legal: the DOM types say the method is always there.
if (!(Blob.prototype.text as unknown))
  Blob.prototype.text = function (this: Blob) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        resolve(reader.result as string);
      };
      reader.onerror = () => {
        reject(reader.error ?? new Error("could not read the file"));
      };
      reader.readAsText(this);
    });
  };

beforeEach(() => {
  // Some components flush a request on unmount with a raw keepalive fetch. Node's fetch rejects
  // relative URLs, so keep every test off the real one; suites that assert on requests stub it
  // again themselves.
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
    }),
  );
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  delete document.documentElement.dataset.theme;
});
