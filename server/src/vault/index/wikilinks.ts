export interface Wikilink {
  target: string;
  heading: string | null;
  alias: string | null;
  embed: boolean;
}

const FENCE = /^(```|~~~)/;

/**
 * Blank out fenced code blocks line by line, so what follows can read links and tasks without
 * seeing examples inside code - and line numbers stay those of the original file.
 */
export function stripCodeBlocks(body: string): string {
  let inFence = false;
  return body
    .split("\n")
    .map((line) => {
      if (FENCE.test(line.trim())) {
        inFence = !inFence;
        return "";
      }
      return inFence ? "" : line;
    })
    .join("\n");
}

const INLINE_CODE = /`[^`\n]*`/g;
// Three optional groups over near-identical classes (target/heading/alias, each excluding only
// what its own delimiter needs) is what sonarjs flags as super-linear; capture the whole interior
// with one class instead and split it in code, where the target#heading|alias grammar is explicit.
// The class also excludes `[`, not just `]`: letting it match `[` would let the capture pretend to
// be more `[[` delimiter, which is the other shape this rule flags - it forces the engine to retry
// the same run of brackets from every later start position once a match fails.
// The `!` embed marker is read from the source position rather than captured, so this is the
// pattern's only quantifier.
const LINK = /\[\[([^\][]+)\]\]/g;

/** `target#heading|alias`, already inside the [[...]] - split rather than matched further. */
function parseLinkInner(
  inner: string,
): Pick<Wikilink, "target" | "heading" | "alias"> {
  // Obsidian tables escape the alias pipe as `\|` so it is not read as a column separator;
  // unescape before splitting so the target does not end up with a trailing backslash.
  const [main, ...aliasParts] = inner.replace(/\\\|/g, "|").split("|");
  const alias = aliasParts.length ? aliasParts.join("|").trim() || null : null;
  const [target, ...headingParts] = main.split("#");
  const heading = headingParts.length
    ? headingParts.join("#").trim() || null
    : null;
  return { target: target.trim(), heading, alias };
}

/** Every [[link]] in the prose, in document order; code is not prose. */
export function extractWikilinks(body: string): Wikilink[] {
  const prose = stripCodeBlocks(body).replace(INLINE_CODE, "");
  return [...prose.matchAll(LINK)].map((m) => ({
    ...parseLinkInner(m[1]),
    embed: prose[m.index - 1] === "!",
  }));
}
