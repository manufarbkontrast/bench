import { noteUrl } from "./tree";
import type { NoteLink } from "./types";

const FENCE = /^(```|~~~)/;
const QUOTE_PREFIX = /^\s*>\s*/;
const CALLOUT_MARKER = /^\[!(\w+)\](.*)$/;

const fileUrl = (relPath: string) =>
  `/api/vault/file?path=${encodeURIComponent(relPath)}`;

/** Obsidian's link body is `target`, `target#heading`, `target|alias` or `target#heading|alias`. */
function splitLinkInner(inner: string): {
  target: string;
  heading?: string;
  alias?: string;
} {
  // Obsidian escapes the alias pipe inside tables ([[Note\|Alias]] means [[Note|Alias]]); unescape
  // only the link's own interior, not the whole line, so a stray \| elsewhere in a table cell
  // (nothing to do with a wikilink) is left for the table renderer to unescape itself.
  const unescaped = unescapePipes(inner);
  const pipeAt = unescaped.indexOf("|");
  const beforeAlias = pipeAt === -1 ? unescaped : unescaped.slice(0, pipeAt);
  const alias = pipeAt === -1 ? undefined : unescaped.slice(pipeAt + 1);
  const hashAt = beforeAlias.indexOf("#");
  const target = hashAt === -1 ? beforeAlias : beforeAlias.slice(0, hashAt);
  const heading = hashAt === -1 ? undefined : beforeAlias.slice(hashAt + 1);
  return { target, heading, alias };
}

function replaceLink(
  links: NoteLink[],
  embed: string,
  target: string,
  heading?: string,
  alias?: string,
): string {
  const t = target.trim();
  if (embed) return `![${t}](${fileUrl(t)})`;
  const resolved = links.find((l) => l.target === t && !l.embed)?.toPath;
  const label =
    alias?.trim() || (heading?.trim() ? `${t} › ${heading.trim()}` : t);
  return resolved ? `[${label}](/vault${noteUrl(resolved)})` : label;
}

/** Obsidian escapes the alias pipe inside tables: [[Note\|Alias]] means [[Note|Alias]]. */
const unescapePipes = (text: string) => text.replace(/\\\|/g, "|");

/**
 * Scans by hand rather than one regex over the whole line: a pattern with `[[…]]`'s target,
 * heading and alias as adjacent unbounded groups reads as super-linear to sonarjs, even though
 * the character classes involved cannot actually overlap.
 */
function replaceLinks(line: string, links: NoteLink[]): string {
  let out = "";
  let pos = 0;
  for (;;) {
    const open = line.indexOf("[[", pos);
    if (open === -1) return out + line.slice(pos);
    const close = line.indexOf("]]", open + 2);
    if (close === -1) return out + line.slice(pos);
    const embed = open > pos && line[open - 1] === "!";
    const before = line.slice(pos, embed ? open - 1 : open);
    const { target, heading, alias } = splitLinkInner(
      line.slice(open + 2, close),
    );
    out +=
      before + replaceLink(links, embed ? "!" : "", target, heading, alias);
    pos = close + 2;
  }
}

/**
 * Splits a line into alternating prose/inline-code segments on backtick runs, so a wikilink
 * pattern written inside `[[Code]]`-style inline code is never touched. Scanned by hand, the
 * same way replaceLinks scans for `[[…]]`, rather than with a regex over the whole line.
 */
function splitCodeSpans(line: string): { text: string; code: boolean }[] {
  const segments: { text: string; code: boolean }[] = [];
  let pos = 0;
  for (;;) {
    const open = line.indexOf("`", pos);
    if (open === -1) {
      segments.push({ text: line.slice(pos), code: false });
      return segments;
    }
    const close = line.indexOf("`", open + 1);
    if (close === -1) {
      segments.push({ text: line.slice(pos), code: false });
      return segments;
    }
    if (open > pos) segments.push({ text: line.slice(pos, open), code: false });
    segments.push({ text: line.slice(open, close + 1), code: true });
    pos = close + 1;
  }
}

function transformProse(line: string, links: NoteLink[]): string {
  const prefix = QUOTE_PREFIX.exec(line)?.[0];
  const marker = prefix ? CALLOUT_MARKER.exec(line.slice(prefix.length)) : null;
  if (prefix && marker) {
    const [, type, title] = marker;
    const shown =
      title.trim() || type[0].toUpperCase() + type.slice(1).toLowerCase();
    return `${prefix}**${shown}**`;
  }
  return splitCodeSpans(line)
    .map((seg) => (seg.code ? seg.text : replaceLinks(seg.text, links)))
    .join("");
}

/**
 * What react-markdown gets: Obsidian's wikilinks as ordinary links to this app's routes (a link
 * with no note behind it stays as plain text), embeds as images from the vault, callouts as
 * quotes with a bold first line. Fenced code passes through untouched.
 */
export function prepareMarkdown(body: string, links: NoteLink[]): string {
  let inFence = false;
  return body
    .split("\n")
    .map((line) => {
      if (FENCE.test(line.trim())) {
        inFence = !inFence;
        return line;
      }
      return inFence ? line : transformProse(line, links);
    })
    .join("\n");
}

/** A relative image path in a note is relative to the note's folder; serve it from the vault. */
export function resolveAsset(src: string, folder: string): string {
  if (/^[a-z][a-z0-9+.-]*:/i.test(src) || src.startsWith("/")) return src;
  const parts = [...(folder ? folder.split("/") : []), ...src.split("/")];
  const resolved = parts.reduce<string[]>((acc, part) => {
    if (part === "..") return acc.slice(0, -1);
    return part === "." || part === "" ? acc : [...acc, part];
  }, []);
  return fileUrl(resolved.join("/"));
}
