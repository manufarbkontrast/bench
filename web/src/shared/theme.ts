/**
 * One theme across all three apps. Each is its own document, so the choice travels in
 * localStorage rather than in React state, and every entry point calls initTheme() before it
 * renders - set after the first paint, the page would flash the wrong theme on every navigation.
 * Dark is the first-visit theme; the toggle remembers the other.
 */
export type Theme = "light" | "dark";

const KEY = "bench.theme";

export function currentTheme(): Theme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

/** The stored choice, or dark the first time you arrive. */
export function initTheme(): void {
  document.documentElement.dataset.theme = localStorage.getItem(KEY) ?? "dark";
}

export function toggleTheme(): Theme {
  const next: Theme = currentTheme() === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  localStorage.setItem(KEY, next);
  return next;
}
