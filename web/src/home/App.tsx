/** Launcher: one card per app. Plain anchors - each app is its own document. */
import BenchNav from "../shared/BenchNav";
import {
  IconCrm,
  IconProjekte,
  IconRolodex,
  IconVault,
} from "../shared/AppIcons";

interface AppCard {
  href: string;
  name: string;
  tagline: string;
  detail: string;
  facts: string[];
  Icon: (p: { size?: number }) => React.ReactElement;
}

const APPS: AppCard[] = [
  {
    href: "/vault/",
    name: "Vault",
    tagline: "Dein Obsidian-Vault, gelesen",
    detail:
      "Ordnerbaum, Notizen mit funktionierenden Wikilinks und Rückverweisen, Volltextsuche - direkt aus den Markdown-Dateien, ohne Kopie.",
    facts: ["Notizen", "Backlinks", "Suche"],
    Icon: IconVault,
  },
  {
    href: "/projekte/",
    name: "Projekte",
    tagline: "Repos und Arbeitsordner: Stand, Dubletten, Notizen.",
    detail:
      "Jeder Checkout unter deinen Wurzeln: Branch, letzter Commit, offene Issues und PRs, dazu die Notiz, die ihn beschreibt.",
    facts: ["Scan", "GitHub", "Dubletten"],
    Icon: IconProjekte,
  },
  {
    href: "/crm/",
    name: "CRM",
    tagline: "Deals und die Menschen dahinter",
    detail:
      "Organisationen, Kontakte und eine Pipeline zum Ziehen, mit einem Dashboard, das zusammenzählt, was wirklich im Spiel ist.",
    facts: ["Pipeline", "Dashboard", "Aktivitäten"],
    Icon: IconCrm,
  },
  {
    href: "/rolodex/",
    name: "Rolodex",
    tagline: "Die Menschen in deinem Leben, nah gehalten",
    detail:
      "Wen du kontaktieren solltest, was bei ihnen los ist, welche Geburtstage anstehen und eine Timeline jedes Gesprächs.",
    facts: ["Check-ins", "Kreise", "Kalender"],
    Icon: IconRolodex,
  },
];

export default function App() {
  return (
    <>
      <BenchNav active="home" />
      <div className="home">
        <header className="home-header">
          <h1>Bench</h1>
          <p className="home-lede">
            Vier Apps, ein Server, ein Rechner. Deine Daten liegen als
            SQLite-Dateien auf dieser Platte und gehen nirgendwohin.
          </p>
        </header>

        <div className="home-grid">
          {APPS.map((app) => (
            <a className="home-card" href={app.href} key={app.href}>
              <app.Icon size={104} />
              <div className="home-card-body">
                <h2>{app.name}</h2>
                <p className="home-tagline">{app.tagline}</p>
                <p className="home-detail">{app.detail}</p>
                <ul className="home-facts">
                  {app.facts.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
              </div>
              <span className="home-open">
                Öffnen
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M5 12h13M12 5.5 18.5 12 12 18.5" />
                </svg>
              </span>
            </a>
          ))}
        </div>

        <footer className="home-footer">
          <span>
            <strong>npm run dev</strong> · API auf 8100, Vite auf 8101
          </span>
          <span>SQLite in ./data</span>
        </footer>
      </div>
    </>
  );
}
