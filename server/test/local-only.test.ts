import request from "supertest";
import { describe, expect, it } from "vitest";
import { appWithVault, emptyVault } from "./vault/app.js";

const app = appWithVault(emptyVault());

describe("a DNS name rebound to 127.0.0.1", () => {
  it("is refused, since only localhost itself may address Bench", async () => {
    const res = await request(app)
      .get("/api/vault/info")
      .set("Host", "rebound.example:8100");
    expect(res.status).toBe(403);
  });

  it.each(["localhost:8100", "127.0.0.1:8100", "[::1]:8100", "localhost"])(
    "lets %s through",
    async (host) => {
      const res = await request(app).get("/api/vault/info").set("Host", host);
      expect(res.status).toBe(200);
    },
  );
});

describe("a request from another site in the same browser", () => {
  it("is refused on the API, whatever it asks for", async () => {
    const res = await request(app)
      .post("/api/projekte/scan")
      .set("Sec-Fetch-Site", "cross-site");
    expect(res.status).toBe(403);
  });

  it("is refused when it would embed a page in a frame", async () => {
    const res = await request(app)
      .get("/vault/")
      .set("Sec-Fetch-Site", "cross-site")
      .set("Sec-Fetch-Dest", "iframe");
    expect(res.status).toBe(403);
  });

  it("still lets a plain link open a Bench page", async () => {
    const res = await request(app)
      .get("/vault/")
      .set("Sec-Fetch-Site", "cross-site")
      .set("Sec-Fetch-Mode", "navigate")
      .set("Sec-Fetch-Dest", "document");
    expect(res.status).not.toBe(403);
  });

  it.each(["same-origin", "same-site", "none"])(
    "is let through when the browser calls it %s",
    async (site) => {
      const res = await request(app)
        .get("/api/vault/info")
        .set("Sec-Fetch-Site", site);
      expect(res.status).toBe(200);
    },
  );

  it("is let through without the header, as curl and Node send it", async () => {
    expect((await request(app).get("/api/vault/info")).status).toBe(200);
  });
});
