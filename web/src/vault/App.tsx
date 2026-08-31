import { useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router";
import BenchNav from "../shared/BenchNav";
import { api } from "./api";
import { noteUrl, startNote } from "./tree";
import type { Info, TreeEntry } from "./types";
import NoteView from "./components/NoteView";
import Sidebar from "./components/Sidebar";

export default function App() {
  const [entries, setEntries] = useState<TreeEntry[] | null>(null);
  const [info, setInfo] = useState<Info | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    void api.tree().then(setEntries);
    void api.info().then(setInfo);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const first = entries ? startNote(entries) : undefined;
  return (
    <>
      <BenchNav active="vault" />
      <div className="app">
        <Sidebar
          entries={entries ?? []}
          vaultName={info?.name ?? ""}
          onSearch={() => setSearchOpen(true)}
        />
        <main className="main">
          <Routes>
            <Route
              path="/"
              element={
                first ? <Navigate to={noteUrl(first.path)} replace /> : null
              }
            />
            <Route
              path="/n/*"
              element={<NoteView vaultName={info?.name ?? ""} />}
            />
          </Routes>
        </main>
        {searchOpen && <div hidden />}
      </div>
    </>
  );
}
