export interface Info {
  name: string;
  notes: number;
}

export interface TreeEntry {
  path: string;
  title: string;
  folder: string;
}

export interface NoteLink {
  target: string;
  heading: string | null;
  alias: string | null;
  embed: boolean;
  toPath: string | null;
}

export interface Backlink {
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
