/**
 * The primary navigation, identical in all four documents - the launcher and the three apps.
 * Each app is its own page, so these are plain anchors rather than router links.
 */
import { useState } from "react";
import {
  BenchMark,
  IconCrm,
  IconHome,
  IconMoon,
  IconRolodex,
  IconSun,
  IconVault,
} from "./AppIcons";
import { currentTheme, toggleTheme, type Theme } from "./theme";
import "./nav.css";

type AppKey = "home" | "vault" | "crm" | "rolodex";

/** Colour marks the active app and nothing else: one orange chip, wherever you are. An app is
    told apart by its glyph, which is what still works once there are more of them than there
    are brand colours. */
const APPS: {
  key: AppKey;
  href: string;
  label: string;
  Icon: (p: { size?: number }) => React.ReactElement;
}[] = [
  { key: "home", href: "/", label: "Start", Icon: IconHome },
  { key: "vault", href: "/vault/", label: "Vault", Icon: IconVault },
  { key: "crm", href: "/crm/", label: "CRM", Icon: IconCrm },
  { key: "rolodex", href: "/rolodex/", label: "Rolodex", Icon: IconRolodex },
];

export default function BenchNav({ active }: { active: AppKey }) {
  const [theme, setTheme] = useState<Theme>(currentTheme);
  return (
    <header className="bench-nav">
      <span className="bench-nav-brand">
        <BenchMark size={21} />
        Bench
      </span>
      <nav className="bench-nav-links" aria-label="Primary">
        {APPS.map(({ key, href, label, Icon }) => (
          <a
            key={key}
            className="bench-nav-link"
            href={href}
            aria-current={key === active ? "page" : undefined}
          >
            <Icon size={16} />
            {label}
          </a>
        ))}
      </nav>
      <button
        type="button"
        className="bench-nav-theme"
        onClick={() => setTheme(toggleTheme())}
        aria-label={
          theme === "dark"
            ? "Zum hellen Design wechseln"
            : "Zum dunklen Design wechseln"
        }
        title={
          theme === "dark"
            ? "Zum hellen Design wechseln"
            : "Zum dunklen Design wechseln"
        }
      >
        {theme === "dark" ? <IconSun size={16} /> : <IconMoon size={16} />}
      </button>
    </header>
  );
}
