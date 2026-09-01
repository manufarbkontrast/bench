import type Database from "better-sqlite3";
import { TASK_INBOX } from "../vault/write.js";

/**
 * This user's vault conventions, hard-coded from the aufgaben-import skill. The ÆND row is
 * widened past the brand name itself: "ænd" carries a non-ASCII letter that a plain word-boundary
 * check cannot rely on being spoken, so its meeting notes are matched by the artist- and
 * release-language they actually use instead.
 */
const RULES: { keywords: string[]; target: string }[] = [
  {
    keywords: [
      "ænd",
      "aend",
      "merch",
      "merchscene",
      "artist",
      "artists",
      "release",
      "releases",
      "tier",
    ],
    target: "30_Projekte/AEND/Merch.md",
  },
  {
    keywords: ["shoes please", "spz"],
    target: "20_Brands/Shoes_Please/Shoes_Please.md",
  },
  {
    keywords: ["machu", "machupicyou"],
    target: "20_Brands/Machu/Machu.md",
  },
  {
    keywords: [
      "automatisierung",
      "agent",
      "agents",
      "dashboard",
      "dashboards",
      "claude",
      "bench",
    ],
    target: "30_Projekte/KI_Automatisierung/Rollout_Plan.md",
  },
];

// A single-word keyword must sit between non-letter/non-digit boundaries (or the string's ends) -
// "agent" must not fire on the "agent" inside "Musikagentur". \p{L}/\p{N} need the "u" flag to
// treat umlauts and "æ" as letters the same way the keywords themselves use them.
function isWholeWord(text: string, keyword: string): boolean {
  const pattern = new RegExp(
    `(?<![\\p{L}\\p{N}])${keyword}(?![\\p{L}\\p{N}])`,
    "u",
  );
  return pattern.test(text);
}

function ruleMatches(lowerText: string, keywords: string[]): boolean {
  return keywords.some((keyword) =>
    keyword.includes(" ")
      ? lowerText.includes(keyword)
      : isWholeWord(lowerText, keyword),
  );
}

function noteExists(vaultDb: Database.Database, target: string): boolean {
  return (
    vaultDb.prepare("SELECT 1 FROM notes WHERE path = ?").get(target) !==
    undefined
  );
}

/**
 * The first rule whose keyword names the note text and whose target note is already in the vault
 * index, else the task inbox. A rule can match on its keyword and still be skipped, when the note
 * it would file under does not exist yet - the next rule gets the same chance.
 */
export function suggestTarget(
  noteText: string,
  vaultDb: Database.Database,
): string {
  const lower = noteText.toLowerCase();
  for (const rule of RULES) {
    if (ruleMatches(lower, rule.keywords) && noteExists(vaultDb, rule.target))
      return rule.target;
  }
  return TASK_INBOX;
}
