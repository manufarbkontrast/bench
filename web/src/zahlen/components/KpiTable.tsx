import type { Kpi } from "../types";

/** The last run's KPI rows, or none - an empty run's own state (`Noch kein Lauf.`) is handled by
    the caller, so this always renders a table, even with no rows. */
export default function KpiTable({ kpis }: { kpis: Kpi[] }) {
  return (
    <table className="zahlen-kpi-table">
      <thead>
        <tr>
          <th>Kennzahl</th>
          <th>Vergleich</th>
          <th>Aktuell</th>
          <th>Veränderung</th>
        </tr>
      </thead>
      <tbody>
        {kpis.map((kpi) => (
          <tr key={kpi.kennzahl}>
            <td>{kpi.kennzahl}</td>
            <td>{kpi.vergleich}</td>
            <td>{kpi.aktuell}</td>
            <td>{kpi.veraenderung}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
