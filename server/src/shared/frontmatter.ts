const FENCE = "---";
const SEPARATOR = ": ";

/**
 * The "key: value" line scanner four modules used to carry a copy of each - aufgaben's Plaud
 * notes, eingang's inbox and fetched recordings, kontext's SKILL.md files, projekte's Plaud
 * notes. It reads the lines between an opening `---` (line one, exactly) and the next line that
 * is exactly `---`, splitting each at its first ": " - deliberately without YAML semantics: every
 * one of those inputs is machine-written, and a `titel:` or `description:` there can carry its
 * own ": " ("08-18 Besprechung: Q4"), which a YAML parser rejects as an incomplete mapping and a
 * line scanner reads as written. Human-written vault notes go through gray-matter in
 * vault/index/frontmatter.ts instead - a different input and a different tool. Lines are split on
 * `\n` only: a CRLF file's first line is `---\r`, which opens nothing and yields an empty map -
 * the four copies behaved the same, and no input Bench reads is CRLF.
 */
export function scanFrontmatter(text: string): {
  fields: ReadonlyMap<string, string>;
  body: string;
} {
  const lines = text.split("\n");
  const closing = lines[0] === FENCE ? lines.indexOf(FENCE, 1) : -1;
  if (closing === -1) return { fields: new Map(), body: text };
  const fields = new Map<string, string>();
  for (const line of lines.slice(1, closing)) {
    const sep = line.indexOf(SEPARATOR);
    if (sep === -1) continue;
    const key = line.slice(0, sep);
    // First occurrence wins. A machine-written note never repeats a key; two of the four copies
    // this replaces overwrote on repeat, two returned the first, and nothing depended on either.
    if (!fields.has(key))
      fields.set(key, line.slice(sep + SEPARATOR.length).trim());
  }
  return { fields, body: lines.slice(closing + 1).join("\n") };
}
