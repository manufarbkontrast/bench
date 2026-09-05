/** A query-string value as text; arrays and objects (`?path[]=`) become the empty string. */
export function queryText(value: unknown): string {
  return typeof value === "string" ? value : "";
}
