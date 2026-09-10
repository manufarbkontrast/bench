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

describe("the aufgaben api client", () => {
  it("unwraps the task list from its reply", async () => {
    mockFetch({ json: () => Promise.resolve({ tasks: [{ line: 3 }] }) });
    await expect(api.tasks()).resolves.toEqual([{ line: 3 }]);
  });

  it("reads the tree from the vault and the rest from its own namespace", async () => {
    const fetchMock = mockFetch();
    await api.tree();
    await api.plaud();
    await api.issues();
    expect([0, 1, 2].map((i) => callOf(fetchMock, i)[0])).toEqual([
      "/api/vault/tree",
      "/api/aufgaben/plaud",
      "/api/aufgaben/issues",
    ]);
  });

  it("toggles a task with a JSON PATCH naming the line it expects", async () => {
    const fetchMock = mockFetch();
    await api.toggle("Inbox.md", 4, "- [ ] Angebot schicken");
    const [url, init] = callOf(fetchMock);
    expect(url).toBe("/api/vault/tasks");
    expect(init?.method).toBe("PATCH");
    expect(init?.headers).toEqual({ "Content-Type": "application/json" });
    expect(JSON.parse(init?.body as string)).toEqual({
      path: "Inbox.md",
      line: 4,
      raw: "- [ ] Angebot schicken",
    });
  });

  it("creates a task and imports a Plaud item with JSON POSTs", async () => {
    const fetchMock = mockFetch();
    await api.create({ text: "Rückruf", due: "2026-09-12" });
    await api.importItem("call.md", "abc123", "Inbox.md");
    const [createUrl, create] = callOf(fetchMock, 0);
    const [importUrl, imported] = callOf(fetchMock, 1);
    expect([createUrl, create?.method]).toEqual(["/api/vault/tasks", "POST"]);
    expect(JSON.parse(create?.body as string)).toEqual({
      text: "Rückruf",
      due: "2026-09-12",
    });
    expect([importUrl, imported?.method]).toEqual([
      "/api/aufgaben/import",
      "POST",
    ]);
    expect(JSON.parse(imported?.body as string)).toEqual({
      file: "call.md",
      rowHash: "abc123",
      targetPath: "Inbox.md",
    });
  });

  it("carries the status on a failed write, so a conflict can be told apart", async () => {
    mockFetch({
      ok: false,
      status: 409,
      json: () => Promise.resolve({ error: "Zeile hat sich geändert" }),
    });
    const failure = api.toggle("Inbox.md", 4, "- [ ] x");
    await expect(failure).rejects.toBeInstanceOf(HttpError);
    await expect(failure).rejects.toMatchObject({
      status: 409,
      message: "Zeile hat sich geändert",
    });
  });

  it("falls back to the method, request and status when a write's body is not JSON", async () => {
    mockFetch({
      ok: false,
      status: 500,
      json: () => Promise.reject(new SyntaxError("Unexpected token <")),
    });
    await expect(api.create({ text: "x" })).rejects.toThrow(
      "POST /api/vault/tasks failed (500)",
    );
  });

  it("raises a plain error for a failed read, with the server's message or the fallback", async () => {
    mockFetch({
      ok: false,
      status: 502,
      json: () => Promise.resolve({ error: "gh nicht angemeldet" }),
    });
    await expect(api.issues()).rejects.toThrow("gh nicht angemeldet");
    mockFetch({
      ok: false,
      status: 500,
      json: () => Promise.reject(new SyntaxError("Unexpected token <")),
    });
    await expect(api.plaud()).rejects.toThrow(
      "GET /api/aufgaben/plaud failed (500)",
    );
  });
});
