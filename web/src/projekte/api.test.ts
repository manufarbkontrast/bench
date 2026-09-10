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

const callOf = (mock: ReturnType<typeof mockFetch>, i = 0) =>
  mock.mock.calls[i] as [string, RequestInit | undefined];

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the projekte api client", () => {
  it("reads the list and the Stand view under the app's own namespace", async () => {
    const fetchMock = mockFetch();
    await api.list();
    await api.stand();
    expect([0, 1].map((i) => callOf(fetchMock, i)[0])).toEqual([
      "/api/projekte/list",
      "/api/projekte/stand",
    ]);
  });

  it("encodes a checkout's path into the query, slashes and spaces included", async () => {
    const fetchMock = mockFetch();
    await api.project("~/Projekte/Leuchtturm Web");
    expect(callOf(fetchMock)[0]).toBe(
      "/api/projekte/project?path=~%2FProjekte%2FLeuchtturm%20Web",
    );
  });

  it("starts a scan with a POST and hands back only its summary", async () => {
    const fetchMock = mockFetch({
      json: () => Promise.resolve({ summary: { found: 3 } }),
    });
    await expect(api.scan()).resolves.toEqual({ found: 3 });
    expect(callOf(fetchMock)).toEqual([
      "/api/projekte/scan",
      { method: "POST" },
    ]);
  });

  it("raises the error the server explains", async () => {
    mockFetch({
      ok: false,
      status: 404,
      json: () => Promise.resolve({ error: "Kein registriertes Projekt" }),
    });
    await expect(api.project("x")).rejects.toThrow(
      "Kein registriertes Projekt",
    );
  });

  it("falls back to the method, request and status when the body is not JSON", async () => {
    mockFetch({
      ok: false,
      status: 500,
      json: () => Promise.reject(new SyntaxError("Unexpected token <")),
    });
    await expect(api.scan()).rejects.toThrow(
      "POST /api/projekte/scan failed (500)",
    );
    await expect(api.list()).rejects.toThrow(
      "GET /api/projekte/list failed (500)",
    );
  });
});
