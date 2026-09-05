/** Reads the session note's body without knowing anything about vault markdown beyond one
    convention: a `## ` heading starts a section, and the next `## ` heading or EOF ends it. */

export interface Section {
  heading: string;
  text: string;
}

const SECTION_HEADING = "## ";

/** The first `## ` heading in `body` and the lines up to the next `## ` heading or EOF, left as
    plain text - what the Hier-weitermachen panel shows without rendering markdown. */
export function firstSection(body: string): Section | null {
  const lines = body.split("\n");
  const start = lines.findIndex((line) => line.startsWith(SECTION_HEADING));
  if (start === -1) return null;

  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => line.startsWith(SECTION_HEADING));
  const sectionLines = end === -1 ? rest : rest.slice(0, end);

  return {
    heading: lines[start].slice(SECTION_HEADING.length).trim(),
    text: sectionLines.join("\n").trim(),
  };
}
