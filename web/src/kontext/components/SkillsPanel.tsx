import { useState } from "react";
import { EMPTY_TEXT } from "../format";
import type { Skill } from "../types";

const EM_DASH = "—";

/** The Skills tab: a client-side name+description filter over the skill list. The counter always
    reads the API's own folder count - `count`, never `filtered.length` - so a search that matches
    nothing still reports how many skill folders exist (server/src/kontext/skills.ts's own
    criterion: the folder count, not the number of readable SKILL.md files). */
export default function SkillsPanel({
  count,
  skills,
}: {
  count: number;
  skills: Skill[];
}) {
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const filtered =
    needle === ""
      ? skills
      : skills.filter(
          (skill) =>
            skill.name.toLowerCase().includes(needle) ||
            skill.description.toLowerCase().includes(needle),
        );

  return (
    <div className="kontext-skills">
      <input
        className="kontext-skills-search"
        type="search"
        aria-label="Suchen"
        placeholder="Suchen"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <p className="kontext-skills-count">{`${count} Skills`}</p>
      {filtered.length === 0 ? (
        <p className="kontext-empty">{EMPTY_TEXT}</p>
      ) : (
        <ul className="kontext-skills-list">
          {filtered.map((skill) => (
            <li
              key={skill.name}
            >{`${skill.name} ${EM_DASH} ${skill.description}`}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
