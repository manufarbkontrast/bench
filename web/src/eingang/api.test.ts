import { afterEach, describe, expect, it, vi } from "vitest";
import { api, HttpError } from "./api";

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

describe("the eingang api client", () => {
  it("reads each list endpoint under the app's own namespace", async () => {
    const fetchMock = mockFetch();
    await api.inbox();
    await api.jobs();
    await api.job(7);
    await api.schedule();
    await api.plaud(2);
    await api.projekte();
    expect([0, 1, 2, 3, 4, 5].map((i) => callOf(fetchMock, i)[0])).toEqual([
      "/api/eingang/inbox",
      "/api/eingang/jobs",
      "/api/eingang/jobs/7",
      "/api/eingang/schedule",
      "/api/eingang/plaud?page=2",
      "/api/eingang/projekte",
    ]);
  });

  it("starts a job with only its kind, or with its arguments when given", async () => {
    const fetchMock = mockFetch();
    await api.startJob("vault-reindex");
    await api.startJob("plaud-process", { file: "call.txt" });
    const bodies = [0, 1].map((i) => {
      const [url, init] = callOf(fetchMock, i);
      expect([url, init?.method]).toEqual(["/api/eingang/jobs", "POST"]);
      return JSON.parse(init?.body as string) as unknown;
    });
    expect(bodies).toEqual([
      { kind: "vault-reindex" },
      { kind: "plaud-process", args: { file: "call.txt" } },
    ]);
  });

  it("kills a job with an empty POST to its own kill route", async () => {
    const fetchMock = mockFetch();
    await api.killJob(12);
    const [url, init] = callOf(fetchMock);
    expect(url).toBe("/api/eingang/jobs/12/kill");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(init?.body as string)).toEqual({});
  });

  it("carries the status on a refused start, so a running job can be told apart", async () => {
    mockFetch({
      ok: false,
      status: 409,
      json: () => Promise.resolve({ error: "Läuft bereits" }),
    });
    const failure = api.startJob("vault-reindex");
    await expect(failure).rejects.toBeInstanceOf(HttpError);
    await expect(failure).rejects.toMatchObject({
      status: 409,
      message: "Läuft bereits",
    });
  });

  it("falls back to the request and status when a body is not JSON", async () => {
    mockFetch({
      ok: false,
      status: 500,
      json: () => Promise.reject(new SyntaxError("Unexpected token <")),
    });
    await expect(api.killJob(3)).rejects.toThrow(
      "POST /api/eingang/jobs/3/kill failed (500)",
    );
    await expect(api.jobs()).rejects.toThrow(
      "GET /api/eingang/jobs failed (500)",
    );
  });

  it("raises the server's own message for a failed read", async () => {
    mockFetch({
      ok: false,
      status: 404,
      json: () => Promise.resolve({ error: "Job nicht gefunden" }),
    });
    await expect(api.job(99)).rejects.toThrow("Job nicht gefunden");
  });
});
