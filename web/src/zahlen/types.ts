export interface RunFolder {
  folder: string;
  stichtag: string;
  modus: "zwischenstand" | "abschluss";
}

export interface Kpi {
  kennzahl: string;
  vergleich: string;
  aktuell: string;
  veraenderung: string;
}

/** GET /api/zahlen/last and GET /api/zahlen/run answer the same shape: no run at all, or one run
    with everything the detail view needs - server/src/zahlen/routes.ts's RunDetail. */
export type RunReply =
  | { run: null }
  | {
      run: RunFolder;
      kpis: Kpi[];
      breakEven: string[];
      zusammenfassung: string;
      bestellungen: number | null;
    };

export interface LinksReply {
  base: string | null;
  paths: string[];
}
