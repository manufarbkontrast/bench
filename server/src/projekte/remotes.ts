import path from "node:path";

/** Hand-rolled rather than a regex - sonarjs flags super-linear patterns for URL shapes like this. */
export function normalizeRemote(url: string): string {
  let rest = url.trim();
  for (const proto of ["ssh://", "git://", "https://", "http://"])
    if (rest.startsWith(proto)) rest = rest.slice(proto.length);
  const at = rest.indexOf("@");
  if (at !== -1) rest = rest.slice(at + 1);
  const colon = rest.indexOf(":");
  const slash = rest.indexOf("/");
  // scp-style host:path becomes host/path; a colon after the first slash is part of the path
  if (colon !== -1 && (slash === -1 || colon < slash))
    rest = `${rest.slice(0, colon)}/${rest.slice(colon + 1)}`;
  if (rest.endsWith("/")) rest = rest.slice(0, -1);
  if (rest.toLowerCase().endsWith(".git")) rest = rest.slice(0, -4);
  return rest.toLowerCase();
}

export function githubLabel(normalized: string): string | null {
  if (!normalized.startsWith("github.com/")) return null;
  return normalized.slice("github.com/".length);
}

export function groupKey(remote: string | null, dir: string): string {
  return remote ?? `name:${path.basename(dir).toLowerCase()}`;
}
