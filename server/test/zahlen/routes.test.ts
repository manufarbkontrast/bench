import { fileURLToPath } from "node:url";
import request from "supertest";
import { describe, expect, it } from "vitest";
import type { ZahlenContext } from "../../src/zahlen/routes.js";
import { appWithZahlen } from "./app.js";

const CONTROLLING_FIXTURE = fileURLToPath(
  new URL("../../src/eingang/fixture/controlling", import.meta.url),
);

const ctx: ZahlenContext = {
  dir: CONTROLLING_FIXTURE,
  mycraftonUrl: "https://mycrafton.example.com",
};
const app = appWithZahlen(ctx);

const nullApp = appWithZahlen({ dir: null, mycraftonUrl: null });

interface Kpi {
  kennzahl: string;
  vergleich: string;
  aktuell: string;
  veraenderung: string;
}
interface RunDetailResponse {
  run: { folder: string; stichtag: string; modus: string } | null;
  kpis?: Kpi[];
  breakEven?: string[];
  zusammenfassung?: string;
  bestellungen?: number | null;
}

describe("GET /api/zahlen/last", () => {
  it("carries the KPI rows, the raw markdown and bestellungen", async () => {
    const res = await request(app).get("/api/zahlen/last");

    expect(res.status).toBe(200);
    const body = res.body as RunDetailResponse;
    expect(body.run?.folder).toBe("2026-08-15-zwischenstand");
    expect(body.kpis).toEqual([
      {
        kennzahl: "Umsatz gesamt",
        vergleich: "51.200 €",
        aktuell: "54.300 €",
        veraenderung: "+6,1 %",
      },
      {
        kennzahl: "Google-ROAS",
        vergleich: "3,8",
        aktuell: "4,2",
        veraenderung: "+0,4",
      },
    ]);
    expect(body.zusammenfassung).toContain("Umsatz liegt bei 54.300 Euro");
    expect(body.bestellungen).toBe(123);
  });
});

describe("GET /api/zahlen/runs", () => {
  it("lists the two fixture folders newest first", async () => {
    const res = await request(app).get("/api/zahlen/runs");

    expect(res.status).toBe(200);
    const body = res.body as { runs: { folder: string }[] };
    expect(body.runs.map((run) => run.folder)).toEqual([
      "2026-08-15-zwischenstand",
      "2026-07-15-zwischenstand",
    ]);
  });
});

describe("GET /api/zahlen/run", () => {
  it("400s a traversal attempt before any read", async () => {
    const traversal = await request(app)
      .get("/api/zahlen/run")
      .query({ folder: "../2026-08-15-zwischenstand" });
    expect(traversal.status).toBe(400);

    const suffixed = await request(app)
      .get("/api/zahlen/run")
      .query({ folder: "2026-08-15-zwischenstand/x" });
    expect(suffixed.status).toBe(400);
  });

  it("answers the zusammenfassung-only folder with an empty kpis array", async () => {
    const res = await request(app)
      .get("/api/zahlen/run")
      .query({ folder: "2026-07-15-zwischenstand" });

    expect(res.status).toBe(200);
    const body = res.body as RunDetailResponse;
    expect(body.kpis).toEqual([]);
    expect(body.zusammenfassung).toContain("48.900 Euro");
  });

  it("404s a validly shaped folder that does not exist", async () => {
    const res = await request(app)
      .get("/api/zahlen/run")
      .query({ folder: "2020-01-01-abschluss" });

    expect(res.status).toBe(404);
  });
});

describe("GET /api/zahlen/file", () => {
  it("400s an out-of-allowlist name", async () => {
    const res = await request(app)
      .get("/api/zahlen/file")
      .query({ folder: "2026-08-15-zwischenstand", name: ".env" });

    expect(res.status).toBe(400);
  });

  it("400s a bad folder before any read", async () => {
    const res = await request(app)
      .get("/api/zahlen/file")
      .query({ folder: "../etc", name: "bericht.html" });

    expect(res.status).toBe(400);
  });

  it("serves bericht.html as html", async () => {
    const res = await request(app)
      .get("/api/zahlen/file")
      .query({ folder: "2026-08-15-zwischenstand", name: "bericht.html" });

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/html");
    expect(res.text).toContain("Synthetischer Bericht");
  });

  it("404s a file the allowlist permits but this folder does not have", async () => {
    const res = await request(app)
      .get("/api/zahlen/file")
      .query({ folder: "2026-07-15-zwischenstand", name: "bericht.html" });

    expect(res.status).toBe(404);
  });
});

describe("GET /api/zahlen/links", () => {
  it("returns myCrafton's base and the fixed deep-link paths", async () => {
    const res = await request(app).get("/api/zahlen/links");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      base: "https://mycrafton.example.com",
      paths: ["/", "/umlagerungen", "/nachbestellungen", "/marken"],
    });
  });
});

describe("a null dir context", () => {
  it("answers every route's empty shape, never 500", async () => {
    const last = await request(nullApp).get("/api/zahlen/last");
    expect(last.status).toBe(200);
    expect(last.body).toEqual({ run: null });

    const runs = await request(nullApp).get("/api/zahlen/runs");
    expect(runs.status).toBe(200);
    expect(runs.body).toEqual({ runs: [] });

    const run = await request(nullApp)
      .get("/api/zahlen/run")
      .query({ folder: "2026-08-15-zwischenstand" });
    expect(run.status).toBe(200);
    expect(run.body).toEqual({ run: null });

    const file = await request(nullApp)
      .get("/api/zahlen/file")
      .query({ folder: "2026-08-15-zwischenstand", name: "bericht.html" });
    expect(file.status).toBe(404);

    const links = await request(nullApp).get("/api/zahlen/links");
    expect(links.status).toBe(200);
    expect(links.body).toEqual({
      base: null,
      paths: ["/", "/umlagerungen", "/nachbestellungen", "/marken"],
    });
  });
});
