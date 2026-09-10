import { afterEach, describe, expect, it, vi } from "vitest";
import { api, fileUrl } from "./api";

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

describe("the zahlen api client", () => {
  it("reads each list endpoint under the app's own namespace", async () => {
    const fetchMock = mockFetch();
    await api.last();
    await api.runs();
    await api.links();
    expect([0, 1, 2].map((i) => urlOf(fetchMock, i))).toEqual([
      "/api/zahlen/last",
      "/api/zahlen/runs",
      "/api/zahlen/links",
    ]);
  });

  it("encodes the run folder into the query rather than the path", async () => {
    const fetchMock = mockFetch();
    await api.run("2026-08 Zwischenstand & mehr");
    expect(urlOf(fetchMock)).toBe(
      "/api/zahlen/run?folder=2026-08+Zwischenstand+%26+mehr",
    );
  });

  it("builds a file URL without fetching it", () => {
    const fetchMock = mockFetch();
    expect(fileUrl("2026-08 Lauf", "bericht.html")).toBe(
      "/api/zahlen/file?folder=2026-08+Lauf&name=bericht.html",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("raises the error the server explains", async () => {
    mockFetch({
      ok: false,
      status: 404,
      json: () => Promise.resolve({ error: "Kein Lauf in diesem Ordner" }),
    });
    await expect(api.run("x")).rejects.toThrow("Kein Lauf in diesem Ordner");
  });

  it("falls back to the request and status when the body is not JSON", async () => {
    mockFetch({
      ok: false,
      status: 500,
      json: () => Promise.reject(new SyntaxError("Unexpected token <")),
    });
    await expect(api.last()).rejects.toThrow(
      "GET /api/zahlen/last failed (500)",
    );
  });
});
