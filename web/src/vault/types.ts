export interface Info {
  name: string;
  notes: number;
}

export interface TreeEntry {
  path: string;
  title: string;
  folder: string;
}

// Not exported: nothing outside this file names these types directly, only through Note's
// fields - Task 7 is expected to change that once NoteView renders links and backlinks.
interface NoteLink {
  target: string;
  heading: string | null;
  alias: string | null;
  embed: boolean;
  toPath: string | null;
}

interface Backlink {
  path: string;
  title: string;
}

export interface Note {
  path: string;
  title: string;
  folder: string;
  frontmatter: Record<string, unknown>;
  body: string;
  mtime: number;
  tags: string[];
  links: NoteLink[];
  backlinks: Backlink[];
}

export interface SearchHit {
  path: string;
  title: string;
  folder: string;
  snippet: string;
}
