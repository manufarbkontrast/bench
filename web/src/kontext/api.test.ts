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

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the kontext api client", () => {
  it.each([
    ["profil", api.profil],
    ["regeln", api.regeln],
    ["stand", api.stand],
    ["memory", api.memory],
    ["repos", api.repos],
    ["skills", api.skills],
    ["mcp", api.mcp],
  ])("reads the %s tab from its own endpoint", async (tab, call) => {
    const fetchMock = mockFetch();
    await call();
    expect(fetchMock).toHaveBeenCalledWith(`/api/kontext/${tab}`);
  });

  it("raises the error the server explains", async () => {
    mockFetch({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: "~/.claude nicht lesbar" }),
    });
    await expect(api.memory()).rejects.toThrow("~/.claude nicht lesbar");
  });

  it("falls back to the request and status when the body is not JSON", async () => {
    mockFetch({
      ok: false,
      status: 502,
      json: () => Promise.reject(new SyntaxError("Unexpected token <")),
    });
    await expect(api.skills()).rejects.toThrow(
      "GET /api/kontext/skills failed (502)",
    );
  });
});
