import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { Search } from "lucide-react";
import { IconVault } from "../../shared/AppIcons";
import { ancestorsOf, buildTree, noteUrl } from "../tree";
import type { TreeEntry } from "../types";
import TreeFolder from "./TreeFolder";

interface Props {
  entries: TreeEntry[];
  vaultName: string;
  onSearch: () => void;
}

const KEY = "vault.expanded";

function loadExpanded(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(KEY) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

/** The note the URL names, decoded - or undefined on any other route. */
function activePathFrom(pathname: string): string | undefined {
  const m = /^\/n\/(.+)$/.exec(pathname);
  return m ? decodeURIComponent(m[1]) : undefined;
}

export default function Sidebar({ entries, vaultName, onSearch }: Props) {
  const navigate = useNavigate();
  const activePath = activePathFrom(useLocation().pathname);
  const [expanded, setExpanded] = useState<Set<string>>(loadExpanded);
  const tree = useMemo(() => buildTree(entries), [entries]);
  // The open note's folders are shown open whatever was remembered, or the selection is invisible.
  const shown = useMemo(
    () =>
      new Set([...expanded, ...(activePath ? ancestorsOf(activePath) : [])]),
    [expanded, activePath],
  );

  const toggle = (path: string) => {
    const next = new Set(shown);
    if (next.has(path)) next.delete(path);
    else next.add(path);
    setExpanded(next);
    localStorage.setItem(KEY, JSON.stringify([...next]));
  };

  return (
    <nav className="sidebar" aria-label="Vault">
      <div className="brand">
        <IconVault size={20} />
        <span className="brand-name">Vault</span>
        <span className="brand-sub">{vaultName}</span>
      </div>
      <div className="sidebar-top">
        <button type="button" className="sidebar-action" onClick={onSearch}>
          <Search size={15} />
          Suche
          <kbd className="sidebar-kbd">⌘K</kbd>
        </button>
      </div>
      <div className="tree" role="tree" aria-label="Notizen">
        {tree.folders.map((f) => (
          <TreeFolder
            key={f.path}
            node={f}
            depth={0}
            expanded={shown}
            activePath={activePath}
            onToggle={toggle}
            onOpen={(n) => void navigate(noteUrl(n.path))}
          />
        ))}
        {tree.notes.map((n) => (
          <div
            key={n.path}
            role="treeitem"
            aria-label={n.title}
            aria-selected={n.path === activePath}
            className={`tree-row tree-note${n.path === activePath ? " active" : ""}`}
            style={{ paddingLeft: 30 }}
            tabIndex={0}
            onClick={() => void navigate(noteUrl(n.path))}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                void navigate(noteUrl(n.path));
              }
            }}
          >
            <span className="tree-label">{n.title}</span>
          </div>
        ))}
      </div>
    </nav>
  );
}
