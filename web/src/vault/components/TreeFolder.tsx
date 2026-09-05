import { ChevronRight } from "lucide-react";
import type { FolderNode } from "../tree";
import type { TreeEntry } from "../types";

interface Props {
  node: FolderNode;
  depth: number;
  expanded: Set<string>;
  activePath?: string;
  onToggle: (path: string) => void;
  onOpen: (note: TreeEntry) => void;
}

/** One folder row plus, when open, its subfolders and notes. Folders first, as Obsidian does. */
export default function TreeFolder(props: Props) {
  const { node, depth, expanded, activePath, onToggle, onOpen } = props;
  const isOpen = expanded.has(node.path);
  return (
    <div role="none">
      <div
        role="treeitem"
        aria-label={node.name}
        aria-expanded={isOpen}
        aria-selected={false}
        className="tree-row tree-folder"
        style={{ paddingLeft: 8 + depth * 14 }}
        tabIndex={0}
        onClick={() => onToggle(node.path)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle(node.path);
          }
        }}
      >
        <button
          type="button"
          className={`chevron${isOpen ? " open" : ""}`}
          aria-label={
            isOpen
              ? `Ordner ${node.name} zuklappen`
              : `Ordner ${node.name} aufklappen`
          }
          onClick={(e) => {
            e.stopPropagation();
            onToggle(node.path);
          }}
        >
          <ChevronRight size={14} />
        </button>
        <span className="tree-label">{node.name}</span>
      </div>
      {isOpen && (
        <div role="group">
          {node.folders.map((f) => (
            <TreeFolder key={f.path} {...props} node={f} depth={depth + 1} />
          ))}
          {node.notes.map((n) => (
            <div
              key={n.path}
              role="treeitem"
              aria-label={n.title}
              aria-selected={n.path === activePath}
              className={`tree-row tree-note${n.path === activePath ? " active" : ""}`}
              style={{ paddingLeft: 30 + depth * 14 }}
              tabIndex={0}
              onClick={() => onOpen(n)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onOpen(n);
                }
              }}
            >
              <span className="tree-label">{n.title}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
