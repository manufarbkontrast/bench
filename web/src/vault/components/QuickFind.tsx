import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { CornerDownLeft, Search } from "lucide-react";
import { api } from "../api";
import { noteUrl } from "../tree";
import type { SearchHit } from "../types";

interface Props {
  onClose: () => void;
}

export default function QuickFind({ onClose }: Props) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<SearchHit[]>([]);
  const [selected, setSelected] = useState(0);
  const results = query.trim() ? found : [];
  const inputRef = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => inputRef.current?.focus(), []);

  useEffect(() => {
    clearTimeout(timer.current);
    const q = query.trim();
    if (!q) return;
    // A short debounce: the index answers in milliseconds, the typing is what is slow.
    timer.current = setTimeout(() => {
      void api.search(q).then((hits) => {
        setFound(hits);
        setSelected(0);
      });
    }, 120);
    return () => clearTimeout(timer.current);
  }, [query]);

  const open = (hit: SearchHit) => {
    onClose();
    void navigate(noteUrl(hit.path));
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") onClose();
    if (e.key === "ArrowDown" && results.length > 0) {
      e.preventDefault();
      setSelected((s) => (s + 1) % results.length);
    }
    if (e.key === "ArrowUp" && results.length > 0) {
      e.preventDefault();
      setSelected((s) => (s - 1 + results.length) % results.length);
    }
    if (e.key === "Enter" && results[selected]) open(results[selected]);
  };

  return (
    <div
      role="presentation"
      className="overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="find" role="dialog" aria-label="Schnellsuche">
        <div className="find-input-row">
          <Search size={17} className="find-glyph" />
          <input
            ref={inputRef}
            className="find-input"
            placeholder="Notizen durchsuchen…"
            aria-label="Suche"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
          />
          <kbd className="find-kbd">esc</kbd>
        </div>
        {query.trim() && (
          <div
            className="find-results"
            role="listbox"
            aria-label="Suchergebnisse"
          >
            {results.map((r, i) => (
              <button
                key={r.path}
                type="button"
                role="option"
                aria-selected={i === selected}
                aria-label={r.title}
                className={`find-result${i === selected ? " selected" : ""}`}
                onMouseEnter={() => setSelected(i)}
                onClick={() => open(r)}
              >
                <span className="find-title">{r.title}</span>
                <span className="find-crumb">{r.folder}</span>
                <span className="find-snippet">{r.snippet}</span>
                {i === selected && (
                  <CornerDownLeft size={13} className="find-enter" />
                )}
              </button>
            ))}
            {results.length === 0 && (
              <div className="find-empty">
                Keine Treffer für „{query.trim()}“
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
