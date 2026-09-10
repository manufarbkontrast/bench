import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "./api";

function mockFetch(response: Partial<Response> = {}) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve({}),
    ...response,
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const urlOf = (mock: ReturnType<typeof mockFetch>, i = 0) =>
  mock.mock.calls[i][0] as string;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the vault api client", () => {
  it("reads the info and the tree under the app's own namespace", async () => {
    const fetchMock = mockFetch();
    await api.info();
    await api.tree();
    expect([urlOf(fetchMock, 0), urlOf(fetchMock, 1)]).toEqual([
      "/api/vault/info",
      "/api/vault/tree",
    ]);
  });

  it("encodes a note's path and a search query into the query string", async () => {
    const fetchMock = mockFetch();
    await api.note("30_Projekte/Leuchtturm/Calls/2026-08-01 Call Hafen.md");
    await api.search("Hafen & Kran");
    expect([urlOf(fetchMock, 0), urlOf(fetchMock, 1)]).toEqual([
      "/api/vault/note?path=30_Projekte%2FLeuchtturm%2FCalls%2F2026-08-01+Call+Hafen.md",
      "/api/vault/search?q=Hafen+%26+Kran",
    ]);
  });

  it("raises the error the server explains", async () => {
    mockFetch({
      ok: false,
      status: 404,
      json: () => Promise.resolve({ error: "Notiz nicht gefunden" }),
    });
    await expect(api.note("weg.md")).rejects.toThrow("Notiz nicht gefunden");
  });

  it("falls back to the request and status when the body is not JSON", async () => {
    mockFetch({
      ok: false,
      status: 500,
      json: () => Promise.reject(new SyntaxError("Unexpected token <")),
    });
    await expect(api.tree()).rejects.toThrow(
      "GET /api/vault/tree failed (500)",
    );
  });
});
