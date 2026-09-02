import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import KpiTable from "./KpiTable";
import type { Kpi } from "../types";

function kpi(overrides: Partial<Kpi> = {}): Kpi {
  return {
    kennzahl: "Umsatz gesamt",
    vergleich: "51.200 €",
    aktuell: "54.300 €",
    veraenderung: "+6,1 %",
    ...overrides,
  };
}

describe("KpiTable", () => {
  it("renders the German column headers", () => {
    render(<KpiTable kpis={[]} />);
    expect(
      screen.getByRole("columnheader", { name: "Kennzahl" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "Vergleich" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "Aktuell" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "Veränderung" }),
    ).toBeInTheDocument();
  });

  it("renders one row per KPI", () => {
    render(
      <KpiTable
        kpis={[
          kpi(),
          kpi({
            kennzahl: "Google-ROAS",
            vergleich: "3,8",
            aktuell: "4,2",
            veraenderung: "+0,4",
          }),
        ]}
      />,
    );
    expect(screen.getByText("Umsatz gesamt")).toBeInTheDocument();
    expect(screen.getByText("Google-ROAS")).toBeInTheDocument();
    expect(screen.getByText("+6,1 %")).toBeInTheDocument();
  });

  it("renders no rows for an empty list", () => {
    render(<KpiTable kpis={[]} />);
    expect(screen.queryAllByRole("row")).toHaveLength(1);
  });
});
