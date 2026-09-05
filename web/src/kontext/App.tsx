import { useEffect, useState } from "react";
import BenchNav from "../shared/BenchNav";
import { api } from "./api";
import NoteList from "./components/NoteList";
import SkillsPanel from "./components/SkillsPanel";
import { dateText, EMPTY_TEXT } from "./format";
import type {
  ClaudeFile,
  MemoryProject,
  RegelnReply,
  Repo,
  SkillsReply,
  VaultNote,
} from "./types";

type Tab =
  "profil" | "regeln" | "stand" | "memory" | "repos" | "skills" | "mcp";

const TABS: { key: Tab; label: string }[] = [
  { key: "profil", label: "Profil" },
  { key: "regeln", label: "Regeln" },
  { key: "stand", label: "Stand" },
  { key: "memory", label: "Memory" },
  { key: "repos", label: "Repos" },
  { key: "skills", label: "Skills" },
  { key: "mcp", label: "MCP" },
];

const NO_REGELN: RegelnReply = { claude: [], vault: [] };
const NO_SKILLS: SkillsReply = { count: 0, skills: [] };

function Empty() {
  return <p className="kontext-empty">{EMPTY_TEXT}</p>;
}

/** A Claude-side file's body under its name and mtime - the shape Regeln's Claude-Regeln
    subsection and Memory's per-project notes both share (server/src/kontext/readers.ts's
    ClaudeFile: name, body, mtime, no vault path to link). */
function ClaudeFileBlock({ file }: { file: ClaudeFile }) {
  return (
    <div className="kontext-note">
      <h3>{file.name}</h3>
      <p className="kontext-note-meta">{dateText(file.mtime)}</p>
      <pre className="kontext-body">{file.body}</pre>
    </div>
  );
}

function RegelnView({ regeln }: { regeln: RegelnReply }) {
  return (
    <div className="kontext-sections">
      <section className="kontext-section">
        <h2>Claude-Regeln</h2>
        {regeln.claude.length === 0 ? (
          <Empty />
        ) : (
          <div className="kontext-notes">
            {regeln.claude.map((file) => (
              <ClaudeFileBlock key={file.name} file={file} />
            ))}
          </div>
        )}
      </section>
      <section className="kontext-section">
        <h2>Workflow (Vault)</h2>
        <NoteList notes={regeln.vault} />
      </section>
    </div>
  );
}

function MemoryView({ projects }: { projects: MemoryProject[] }) {
  if (projects.length === 0) return <Empty />;
  return (
    <div className="kontext-sections">
      {projects.map((project) => (
        <section key={project.dir} className="kontext-section">
          <h2>{project.dir}</h2>
          {project.notes.length === 0 ? (
            <Empty />
          ) : (
            <div className="kontext-notes">
              {project.notes.map((note) => (
                <ClaudeFileBlock key={note.name} file={note} />
              ))}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}

function ReposView({ repos }: { repos: Repo[] }) {
  if (repos.length === 0) return <Empty />;
  return (
    <div className="kontext-sections">
      {repos.map((repo) => (
        <section key={repo.name} className="kontext-section">
          <h2>{repo.name}</h2>
          {repo.files.length === 0 ? (
            <Empty />
          ) : (
            <div className="kontext-notes">
              {repo.files.map((file) => (
                <div key={file.name} className="kontext-note">
                  <h3>{file.name}</h3>
                  <pre className="kontext-body">{file.body}</pre>
                </div>
              ))}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}

function McpView({ servers }: { servers: string[] }) {
  if (servers.length === 0) return <Empty />;
  return (
    <ul className="kontext-mcp-list">
      {servers.map((server) => (
        <li key={server}>{server}</li>
      ))}
    </ul>
  );
}

export default function App() {
  const [view, setView] = useState<Tab>("profil");
  const [profil, setProfil] = useState<VaultNote[]>([]);
  const [regeln, setRegeln] = useState<RegelnReply>(NO_REGELN);
  const [stand, setStand] = useState<VaultNote | null>(null);
  const [memoryProjects, setMemoryProjects] = useState<MemoryProject[]>([]);
  const [repos, setRepos] = useState<Repo[]>([]);
  const [skills, setSkills] = useState<SkillsReply>(NO_SKILLS);
  const [mcpServers, setMcpServers] = useState<string[]>([]);

  useEffect(() => {
    void api.profil().then((r) => setProfil(r.notes));
    void api.regeln().then(setRegeln);
    void api.stand().then((r) => setStand(r.note));
    void api.memory().then((r) => setMemoryProjects(r.projects));
    void api.repos().then((r) => setRepos(r.repos));
    void api.skills().then(setSkills);
    void api.mcp().then((r) => setMcpServers(r.servers));
  }, []);

  return (
    <>
      <BenchNav active="kontext" />
      <main className="kontext">
        <header className="kontext-header">
          <h1>Kontext</h1>
        </header>

        <div className="kontext-tabs" role="group" aria-label="Ansicht">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              className="kontext-tab"
              aria-pressed={view === tab.key}
              onClick={() => setView(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {view === "profil" && <NoteList notes={profil} />}
        {view === "regeln" && <RegelnView regeln={regeln} />}
        {view === "stand" && <NoteList notes={stand === null ? [] : [stand]} />}
        {view === "memory" && <MemoryView projects={memoryProjects} />}
        {view === "repos" && <ReposView repos={repos} />}
        {view === "skills" && (
          <SkillsPanel count={skills.count} skills={skills.skills} />
        )}
        {view === "mcp" && <McpView servers={mcpServers} />}
      </main>
    </>
  );
}
