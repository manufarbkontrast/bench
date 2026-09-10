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

describe("the Cockpit's api client", () => {
  it("unwraps the task list and the inbox files from their replies", async () => {
    mockFetch({ json: () => Promise.resolve({ tasks: [{ line: 1 }] }) });
    await expect(api.tasks()).resolves.toEqual([{ line: 1 }]);
    mockFetch({ json: () => Promise.resolve({ files: [{ name: "a.pdf" }] }) });
    await expect(api.inbox()).resolves.toEqual([{ name: "a.pdf" }]);
  });

  it("reads each sibling app from that app's own namespace", async () => {
    const fetchMock = mockFetch();
    await api.tasks();
    await api.stand();
    await api.inbox();
    await api.zahlenLast();
    expect([0, 1, 2, 3].map((i) => urlOf(fetchMock, i))).toEqual([
      "/api/aufgaben/tasks",
      "/api/projekte/stand",
      "/api/eingang/inbox",
      "/api/zahlen/last",
    ]);
  });

  it("warms the project table through /list and hands back nothing", async () => {
    const fetchMock = mockFetch({ json: () => Promise.resolve([{ id: 1 }]) });
    await expect(api.warmProjects()).resolves.toBeUndefined();
    expect(urlOf(fetchMock)).toBe("/api/projekte/list");
  });

  it("asks the vault for the session note by its encoded path", async () => {
    const fetchMock = mockFetch({
      json: () => Promise.resolve({ body: "# Stand" }),
    });
    await expect(api.sessionNote()).resolves.toEqual({ body: "# Stand" });
    expect(urlOf(fetchMock)).toBe(
      "/api/vault/note?path=00_Index%2FSession_Context.md",
    );
  });

  it("reads a missing session note as none, not as a failure", async () => {
    mockFetch({ ok: false, status: 404 });
    await expect(api.sessionNote()).resolves.toBeNull();
  });

  it("still raises any other failure reading the session note", async () => {
    mockFetch({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: "Vault nicht erreichbar" }),
    });
    await expect(api.sessionNote()).rejects.toThrow("Vault nicht erreichbar");
  });

  it("falls back to the request and status when the body is not JSON", async () => {
    mockFetch({
      ok: false,
      status: 503,
      json: () => Promise.reject(new SyntaxError("Unexpected token <")),
    });
    await expect(api.stand()).rejects.toThrow(
      "GET /api/projekte/stand failed (503)",
    );
    await expect(api.sessionNote()).rejects.toThrow(
      "GET /api/vault/note?path=00_Index%2FSession_Context.md failed (503)",
    );
  });
});
