# Bench OS Phase 0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove Groove, load machine paths from `.env`, apply the orange dark-first palette and the user's UI rules to the shared chrome and launcher, and translate the chrome to German - leaving `npm run check` and `npm run e2e` green.

**Architecture:** Bench stays a Vite multi-page app (one HTML entry per app) behind one Express server. Phase 0 touches only the shared chrome (`web/src/shared/`), the launcher (`web/src/home/`), the server entry and configuration, the e2e seams, and the docs. The three remaining apps (CRM, Space, Rolodex) are not restyled - their own accents are their own business until they are touched.

**Tech Stack:** TypeScript 6.0.3 (pinned), React 19, Vite 8, vitest 4, Express 5, Playwright, Node 24 (`nvm use 24`). No new dependencies.

## Global Constraints

- Node `^22.22.0 || >=24.0.0` - run `export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use 24` at the start of every shell.
- TypeScript `6.0.3` exactly; better-sqlite3 `12`; do not touch either.
- Before every commit: `npm run format`, then `npm run check` (typecheck, lint, prettier, gitleaks, secrets, knip, coverage ≥ 80 % statements per workspace), then `npm run e2e`. Nothing is loosened to pass.
- ESLint limits: 500 lines a file, 200 a function, complexity 15, depth 4, 5 parameters.
- Immutable data: build new objects, never mutate.
- No emails or phone-number shapes in tracked files except `example.com` / `555-01xx`.
- Commit messages: Conventional Commits (`feat:`, `fix:`, `refactor:`, `docs:`, `chore:`), one line, imperative, no attribution trailer.
- Never push. Never work on `main` - everything happens on `bench-os-phase-0`.
- Accent colour everywhere in this phase: `#ff5c00` (light-ground text variant `#b84200`, dark-ground highlight `#ff7a33`, deep `#c74800`).
- Font stack for chrome and launcher: `-apple-system, BlinkMacSystemFont, "Helvetica Neue", system-ui, sans-serif`.
- German UI strings exactly as written in the tasks below; product names (Bench, CRM, Space, Rolodex) stay.

---

## File map

| Action | File                                                                                        | Responsibility after Phase 0                                   |
| ------ | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Delete | `web/groove/`, `web/src/groove/`, `e2e/groove/`, `docs/groove/`                             | gone                                                           |
| Modify | `web/vite.config.ts`                                                                        | three entries, three-app fallback, no audio coverage exclusion |
| Modify | `server/src/app.ts`                                                                         | three-app deep-link fallback                                   |
| Modify | `server/src/index.ts`                                                                       | opens DBs, loads config, logs sources                          |
| Create | `server/src/config.ts`                                                                      | `.env` loading and the `Config` shape                          |
| Create | `server/test/config.test.ts`                                                                | config unit tests                                              |
| Create | `.env.example`                                                                              | documented keys                                                |
| Create | `.env` (untracked)                                                                          | this machine's paths                                           |
| Modify | `web/src/shared/BenchNav.tsx`                                                               | German labels, three apps, orange active state                 |
| Modify | `web/src/shared/BenchNav.test.tsx`                                                          | updated expectations                                           |
| Modify | `web/src/shared/AppIcons.tsx`                                                               | no Groove icon, recoloured Bench mark                          |
| Modify | `web/src/shared/nav.css`                                                                    | orange accent, new font stack                                  |
| Modify | `web/src/shared/theme.ts`                                                                   | dark first visit                                               |
| Create | `web/src/shared/theme.test.ts`                                                              | theme unit tests                                               |
| Modify | `web/src/home/App.tsx`                                                                      | three German cards, no eyebrow                                 |
| Modify | `web/src/home/App.test.tsx`                                                                 | updated expectations                                           |
| Modify | `web/src/home/styles.css`                                                                   | orange tokens, no transforms/pills/uppercase                   |
| Modify | `web/index.html`                                                                            | `lang="de"`, recoloured favicon                                |
| Modify | `web/src/space/test/setup.ts`                                                               | drop the Groove-only pointer-capture stub if nothing needs it  |
| Modify | `eslint.config.js`, `.jscpd.json`, `.gitignore`                                             | no Groove exceptions; ignore `screenshots/`                    |
| Modify | `e2e/smoke.spec.ts`, `e2e/theme.spec.ts`, `e2e/tools/screenshots.mjs`, `e2e/EXPLORATORY.md` | three apps, German labels                                      |
| Modify | `README.md`, `AGENTS.md`, `docs/PROJECT.md`, `docs/PROCESS.md`, `docs/CONTROLS.md`          | three apps, Bench OS decisions, `.env`                         |

---

### Task 0: Branch, commit the plan, record the baseline

**Files:**

- Create: `docs/changes/bench-os/SPEC.md`, `docs/changes/bench-os/PLAN.md`, `docs/changes/bench-os/PLAN-phase-0.md` (already written)

**Interfaces:**

- Produces: branch `bench-os-phase-0`; a known-green baseline of `npm run check` and `npm run e2e` on the untouched fork.

- [ ] **Step 1: Branch**

```bash
cd ~/Downloads/bench
export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use 24
git checkout -b bench-os-phase-0
```

- [ ] **Step 2: Install (skip if `node_modules` already exists from the setup run)**

```bash
npm ci
npx playwright install chromium
```

- [ ] **Step 3: Baseline check**

Run: `npm run check`
Expected: ends with two coverage tables and exit code 0. If it fails on the untouched fork, stop and report - the baseline is the reference for everything after.

- [ ] **Step 4: Baseline e2e**

Run: `npm run e2e`
Expected: all specs pass (about a minute). Note the count printed by Playwright.

- [ ] **Step 5: Keep the SDD workspace out of the checks**

`.superpowers/` holds this plan's briefs, reports and ledger. Git ignores it through a nested `.gitignore`, but Prettier reads only the root one and `format:check` fails on the briefs. Add `.superpowers/` to `.prettierignore` (after `e2e/.tmp/`) and to `.gitignore` (same place, with a one-line comment), then rerun `npm run check` - it must reach the coverage tables.

- [ ] **Step 6: Commit the plan documents**

```bash
npm run format
git add .prettierignore .gitignore
git commit -m "chore: keep the SDD workspace out of prettier and git"
git add docs/changes/bench-os/
git commit -m "docs: add the Bench OS spec and the phase 0 plan"
```

---

### Task 1: Remove Groove from code, config and tests

**Files:**

- Delete: `web/groove/`, `web/src/groove/`, `e2e/groove/`, `docs/groove/`
- Modify: `web/vite.config.ts:9,38,59-66`, `server/src/app.ts:17`, `web/src/shared/BenchNav.tsx:9,19,34`, `web/src/shared/AppIcons.tsx:78-85`, `web/src/home/App.tsx:5,46-56`, `eslint.config.js:112-132,151-166`, `.jscpd.json:12-13`, `web/src/space/test/setup.ts:5-8`
- Test: `web/src/shared/BenchNav.test.tsx`, `web/src/home/App.test.tsx`, `e2e/smoke.spec.ts`, `e2e/theme.spec.ts`

**Interfaces:**

- Produces: `AppKey = "home" | "crm" | "space" | "rolodex"` in `BenchNav.tsx`; `APPS = ["crm", "space", "rolodex"]` in both fallbacks. Later tasks rename labels but keep these keys.

- [ ] **Step 1: Write the failing unit tests**

In `web/src/shared/BenchNav.test.tsx`, replace the first test:

```tsx
it("offers the launcher and all three apps, in order", () => {
  render(<BenchNav active="crm" />);
  expect(
    nav()
      .getAllByRole("link")
      .map((link) => [link.textContent, link.getAttribute("href")]),
  ).toEqual([
    ["Home", "/"],
    ["CRM", "/crm/"],
    ["Space", "/space/"],
    ["Rolodex", "/rolodex/"],
  ]);
});
```

In `web/src/home/App.test.tsx`, drop the Groove row from `APPS` and add a third test:

```tsx
const APPS = [
  ["CRM", "/crm/", "Deals, and the people behind them"],
  ["Space", "/space/", "Everything you know, in one place"],
  ["Rolodex", "/rolodex/", "The people in your life, kept close"],
];
```

```tsx
it("offers exactly three apps", () => {
  render(<App />);
  expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(3);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd web && npx vitest run src/shared/BenchNav.test.tsx src/home/App.test.tsx`
Expected: FAIL - the nav still lists five links, the launcher still has four `h2`.

- [ ] **Step 3: Delete the Groove directories**

```bash
git rm -r -q web/groove web/src/groove e2e/groove docs/groove
```

- [ ] **Step 4: Remove Groove from the web build**

`web/vite.config.ts`: change line 9 to

```ts
const APPS = ["crm", "space", "rolodex"];
```

Delete the line `groove: entry("groove/index.html"),` from `rollupOptions.input`. In `test.coverage.exclude`, delete the four comment lines that begin `// jsdom has no AudioContext` and the entry `"src/groove/audio/**",` so the block reads:

```ts
      exclude: ["src/**/main.tsx", "src/**/test/**", "src/**/*.test.*"],
```

- [ ] **Step 5: Remove Groove from the server fallback**

`server/src/app.ts` line 17:

```ts
const APPS = ["crm", "space", "rolodex"];
```

- [ ] **Step 6: Remove Groove from the nav, the icons and the launcher**

`web/src/shared/BenchNav.tsx`: delete `  IconGroove,` from the import list; change the union to

```ts
type AppKey = "home" | "crm" | "space" | "rolodex";
```

and delete the line `  { key: "groove", href: "/groove/", label: "Groove", Icon: IconGroove },`.

`web/src/shared/AppIcons.tsx`: delete the whole `export const IconGroove = (p: IconProps) => ( … );` block (lines 78-85, ending just before `export const IconRolodex`).

`web/src/home/App.tsx`: delete `  IconGroove,` from the import and delete this card object from `APPS`:

```tsx
  {
    href: "/groove/",
    name: "Groove",
    tagline: "A groovebox in the browser",
    detail:
      "Four synth units, one transport and a master DJ filter. Pure Web Audio — no samples, no plugins, no latency budget.",
    facts: ["4 units", "16 steps", "Web Audio"],
    Icon: IconGroove,
  },
```

- [ ] **Step 7: Remove Groove from lint and duplication config**

`eslint.config.js`:

- Lines 112-117: replace the comment and block with

```js
  // Seed modules are literal data - rows to insert. Counting their lines measures the size of the
  // fixture, not the difficulty of the code.
  {
    files: ["server/src/**/seed.ts"],
    rules: { "max-lines": "off", "max-lines-per-function": "off" },
  },
```

- Delete lines 119-132 entirely (the comment starting `// Building a Web Audio graph` and the `web/src/groove/audio/**` block).
- Lines 151-166: change the comment's first words to `// The three apps stay separate.` and both arrays to `["crm", "space", "rolodex"]`.

`.jscpd.json`: the `ignore` array ends with `"**/seed.ts"` - delete the `"web/src/groove/patches.ts"` line and the comma before it.

- [ ] **Step 8: Drop the Groove-only test stub, if nothing else needs it**

`web/src/space/test/setup.ts` lines 5-8: delete the comment and `Element.prototype.setPointerCapture = vi.fn();`. Then run `cd web && npx vitest run`. If any test now throws on `setPointerCapture`, restore the line with a comment naming the component that needs it (dnd-kit in Space's board or Rolodex's circles); otherwise leave it deleted.

- [ ] **Step 9: Update the e2e seams**

`e2e/smoke.spec.ts`:

- Delete the `{ path: "/groove/", … }` object from `APPS`.
- In "deep links load the owning app", delete `["/groove/anything", "GROOVEBOX GX-4"],`.
- In "the launcher links into each app", the loop becomes `for (const name of ["CRM", "Space", "Rolodex"])`.
- In "the nav lists every app", the expected text list becomes `["Home", "CRM", "Space", "Rolodex"]`.
- In "the nav reaches every app", delete `["Groove", "GROOVEBOX GX-4"],`.
- Replace the whole "each app keeps its own stylesheet" test with:

```ts
test("each app keeps its own stylesheet", async ({ page }) => {
  // One bundle per document; if the apps ever share one, these backgrounds collide. Space paints
  // its body white (#ffffff / #16181c), Rolodex grey (#f5f5f7 / #14171c), in both themes.
  await page.goto("/space/");
  const spaceBody = await page
    .locator("body")
    .evaluate((el) => getComputedStyle(el).backgroundColor);
  await page.goto("/rolodex/");
  const rolodexBody = await page
    .locator("body")
    .evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(spaceBody).not.toBe(rolodexBody);
});
```

Before relying on it, confirm both bodies read their `--bg`: `grep -n "background" web/src/space/styles.css | head -5` should show `body { … background: var(--bg)` and `web/src/rolodex/styles.css` line 101 already does.

`e2e/theme.spec.ts` line 8:

```ts
const APPS = ["/", "/crm/", "/space/", "/rolodex/"];
```

- [ ] **Step 10: Run the unit tests**

Run: `cd web && npx vitest run src/shared/BenchNav.test.tsx src/home/App.test.tsx`
Expected: PASS.

- [ ] **Step 11: Look for leftovers, then the full gate**

Run: `grep -rni groove --include='*.ts' --include='*.tsx' --include='*.js' --include='*.json' --include='*.html' --include='*.css' --include='*.mjs' . | grep -v node_modules | grep -v package-lock`
Expected: no output. (Markdown mentions are Task 2.)

Run: `npm run format && npm run check`
Expected: green. If knip reports an unused dependency (a package only Groove used), remove it with `npm uninstall <name> -w web` and run `check` again. If `npm ci` afterwards complains about a missing native binding, follow CONTROLS.md: `rm -rf node_modules web/node_modules server/node_modules package-lock.json && npm install`.

Run: `npm run e2e`
Expected: green.

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "refactor: remove Groove"
```

---

### Task 2: Remove Groove from the working documents

**Files:**

- Modify: `README.md:11,178`, `AGENTS.md:3`, `docs/PROJECT.md:12,15,28,44,94,99,120,129`, `docs/PROCESS.md:24,60,74,101-116,145,169`, `docs/CONTROLS.md:72,95,196,209-210,228-232`, `e2e/EXPLORATORY.md:27,30-52,103,106`

**Interfaces:**

- Produces: docs that describe a three-app Bench. Task 6 adds the Bench OS material on top.

- [ ] **Step 1: README and AGENTS**

`README.md`: delete the Groove row from the table at the top; in section 2.3 change "through all four apps: the launcher, CRM, Space, Rolodex, Groove" to "through the launcher, CRM, Space and Rolodex". Search the file for "four" and correct each count that meant the apps.

`AGENTS.md` line 3: "Three local-first apps (CRM, Space, Rolodex) behind one Express server."

- [ ] **Step 2: PROJECT.md**

Delete the Groove row from the app table and the Groove row from the detailed-docs table. In the navigation sentence delete "and Groove". In `## Layout` delete the `groove/index.html` line. In `## Architectural decisions`: in "Multi-page, not one SPA" delete "and groove's `* { margin: 0 }`"; in "Router basenames" delete "groove has no router."; in "One shared module" delete "and Groove restyles every element and sets a monospace body font -" (keep the sentence grammatical: "each app redefines its own palette under `[data-theme]` - so every class in `nav.css` is `bench-nav`-prefixed…"); in "One theme, chosen once" delete the sentence beginning "Groove is the exception in direction only". Change "four apps" to "three apps" wherever it counts the apps ("five documents" becomes "four documents").

- [ ] **Step 3: PROCESS.md**

Delete `[groove/](./groove/)` from the docs list. In section 4 delete "with `web/src/groove/audio/**` excluded because jsdom has no `AudioContext`" (the coverage numbers themselves are refreshed in Task 6). In the e2e layout sentence delete "`groove/`". Delete the whole bullet that begins "**Never poll a periodic value for a one-off reading.**" (it is Groove's playhead). Delete the bullet "Driving Groove with a visible browser **plays sound out loud**". In section 5 change "Groove's audio is the standing example" to "Space's board drag is the standing example - see EXPLORATORY.md".

- [ ] **Step 4: CONTROLS.md**

Line 72: delete "and stay strict everywhere outside Groove's audio" (keep "and stay strict"). Delete the table row for `web/src/groove/audio/**`. Line 196: delete "and Groove's audio". Delete the two `web/src/groove…` rows of the coverage table. Under "What is not covered, and why" delete the paragraph beginning "**`web/src/groove/audio/**` is excluded outright**".

- [ ] **Step 5: EXPLORATORY.md**

Delete "Groove's lit steps against a pale panel" from the themes bullet. Delete the whole `## Groove - the big one` section up to (not including) `## CRM`. In "Cross-app": delete "and over Groove's dark rack"; change "identical in all four documents" to "identical in all four documents (launcher and three apps)"; change "CRM light, Space light/dark, Groove dark" to "CRM light, Space light/dark, Rolodex light/dark".

- [ ] **Step 6: Verify and commit**

Run: `grep -rni groove --include='*.md' . | grep -v node_modules | grep -v docs/changes/bench-os`
Expected: no output.

```bash
npm run format && npm run lint
git add -A
git commit -m "docs: drop Groove from the working documents"
```

---

### Task 3: Orange, dark-first, and the UI rules on the chrome and launcher

**Files:**

- Modify: `web/src/shared/nav.css`, `web/src/home/styles.css`, `web/src/home/App.tsx`, `web/src/shared/theme.ts`, `web/src/shared/AppIcons.tsx:36-51`, `web/index.html`
- Test: `web/src/shared/theme.test.ts` (new), `e2e/theme.spec.ts` (unchanged, must stay green)

**Interfaces:**

- Consumes: `currentTheme()`, `initTheme()`, `toggleTheme()` from `web/src/shared/theme.ts` (signatures unchanged).
- Produces: `initTheme()` sets `dark` when nothing is stored. CSS tokens `--accent` / `--accent-deep` in `web/src/home/styles.css`.

- [ ] **Step 1: Write the failing theme test**

Create `web/src/shared/theme.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { currentTheme, initTheme, toggleTheme } from "./theme";

beforeEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.theme;
});

describe("theme", () => {
  it("is dark on the first visit", () => {
    initTheme();
    expect(currentTheme()).toBe("dark");
  });

  it("keeps the stored choice", () => {
    localStorage.setItem("bench.theme", "light");
    initTheme();
    expect(currentTheme()).toBe("light");
  });

  it("toggles and remembers the choice", () => {
    initTheme();
    expect(toggleTheme()).toBe("light");
    expect(localStorage.getItem("bench.theme")).toBe("light");
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd web && npx vitest run src/shared/theme.test.ts`
Expected: FAIL - jsdom has no `window.matchMedia`, so `initTheme()` throws.

- [ ] **Step 3: Make the first visit dark**

Replace `initTheme` in `web/src/shared/theme.ts` with:

```ts
/** The stored choice, or dark the first time you arrive. */
export function initTheme(): void {
  document.documentElement.dataset.theme = localStorage.getItem(KEY) ?? "dark";
}
```

Change the module docstring's last sentence to end "…flash the wrong theme on every navigation. Dark is the first-visit theme; the toggle remembers the other."

- [ ] **Step 4: Run the theme tests**

Run: `cd web && npx vitest run src/shared/theme.test.ts src/shared/BenchNav.test.tsx`
Expected: PASS.

- [ ] **Step 5: Recolour the nav strip**

`web/src/shared/nav.css`:

- Lines 2-6 (the header comment) become:

```css
/**
 * The navigation strip. Loaded into all four documents (launcher and three apps), so every class
 * is prefixed and every value is literal: the app stylesheets collide on .brand and :root, and
 * each redefines its palette under [data-theme="dark"]. The strip can inherit none of it and must
 * look the same over all of them - which is why the theme is read from the document element here
 * too, rather than from a variable.
 */
```

- Line 18: `border-top: 3px solid #ff5c00;`
- Lines 20-22: `font-family: -apple-system, BlinkMacSystemFont, "Helvetica Neue", system-ui, sans-serif;` (Prettier will wrap it.)
- Line 86 comment: `/* Orange is the one accent, and it means "you are here" - not "this is the CRM". */`
- Lines 88-89: `color: #b84200;` and `background: rgba(255, 92, 0, 0.12);`
- Lines 93-94: `color: #ff7a33;` and `background: rgba(255, 92, 0, 0.16);`

- [ ] **Step 6: Recolour and calm the launcher**

`web/src/home/styles.css`:

- Header comment: replace "amber marks what you are about to open" with "orange marks what you are about to open".
- Lines 8-9 become `--accent: #ff5c00;` and `--accent-deep: #c74800;`
- Lines 18-20: the same font stack as the nav.
- Delete the whole `.home-eyebrow { … }` rule (lines 62-69).
- `.home-card`: replace the two-line `transition:` with `transition: border-color 120ms ease;`
- `.home-card:hover`: `border-color: var(--accent);` and delete `transform: translateY(-2px);`
- `.home-card:hover > svg:first-child`: `color: rgba(255, 92, 0, 0.16);`
- `.home-card:focus-visible`: `outline: 2px solid var(--accent);`
- `.home-facts li`: `border-radius: 6px;`
- `.home-open`: delete `letter-spacing: 0.04em;` and `text-transform: uppercase;`
- `.home-card:hover .home-open`: `color: var(--accent-deep);` and the dark variant `color: var(--accent);`
- Delete the rules `.home-card:hover .home-open svg { transform… }` and `.home-open svg { transition… }`.

`web/src/home/App.tsx`: delete the line `<p className="home-eyebrow">Local-first · no login · no cloud</p>`.

- [ ] **Step 7: Recolour the Bench mark and the favicon**

`web/src/shared/AppIcons.tsx` lines 44-46 (the three seat segments):

```tsx
    <rect x="2" y="6.5" width="6.67" height="4.8" fill="#ff5c00" />
    <rect x="8.67" y="6.5" width="6.66" height="4.8" fill="#6f7884" />
    <rect x="15.33" y="6.5" width="6.67" height="4.8" fill="#6f7884" />
```

and in the file's header comment replace "carries the palette itself: a bench whose seat is one segment per app" with "carries the one accent: a bench whose seat is one orange segment and two grey ones".

`web/index.html`: in the favicon data URI replace `%23ecad0a` with `%23ff5c00`, and both `%23209dd7` and `%23a066d8` with `%236f7884`.

- [ ] **Step 8: Check there is no amber left in the chrome**

Run: `grep -n "ecad0a\|236, 173, 10\|a97d05\|f0b81f\|amber" web/src/shared/nav.css web/src/home/styles.css web/src/shared/AppIcons.tsx web/index.html web/src/home/App.tsx`
Expected: no output.

- [ ] **Step 9: Gate and commit**

Run: `npm run format && npm run check && npm run e2e`
Expected: green.

```bash
git add -A
git commit -m "feat: orange dark-first chrome and a calmer launcher"
```

---

### Task 4: German chrome and launcher copy

**Files:**

- Modify: `web/src/shared/BenchNav.tsx`, `web/src/home/App.tsx`, `web/index.html`
- Test: `web/src/shared/BenchNav.test.tsx`, `web/src/home/App.test.tsx`, `e2e/smoke.spec.ts`, `e2e/theme.spec.ts`, `e2e/tools/screenshots.mjs`

**Interfaces:**

- Produces: nav link texts `Start`, `CRM`, `Space`, `Rolodex`; theme button names `Zum hellen Design wechseln` (shown in dark) and `Zum dunklen Design wechseln` (shown in light); launcher action `Öffnen`. Later phases' specs select by these names.

- [ ] **Step 1: Write the failing tests**

`web/src/shared/BenchNav.test.tsx`: in the first test replace `["Home", "/"]` with `["Start", "/"]`; in the toggle test replace both `/Switch to/` with `/Design wechseln/`.

`web/src/home/App.test.tsx`: replace the `APPS` table with

```tsx
const APPS = [
  ["CRM", "/crm/", "Deals und die Menschen dahinter"],
  ["Space", "/space/", "Alles, was du weißt, an einem Ort"],
  ["Rolodex", "/rolodex/", "Die Menschen in deinem Leben, nah gehalten"],
];
```

and in "marks itself as the current page" replace `{ name: "Home" }` with `{ name: "Start" }`.

- [ ] **Step 2: Run them to see them fail**

Run: `cd web && npx vitest run src/shared/BenchNav.test.tsx src/home/App.test.tsx`
Expected: FAIL on the labels.

- [ ] **Step 3: Translate the nav**

`web/src/shared/BenchNav.tsx`: change the home entry to `{ key: "home", href: "/", label: "Start", Icon: IconHome },` and the button's `aria-label` and `title` to

```tsx
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
```

- [ ] **Step 4: Translate the launcher**

`web/src/home/App.tsx`: replace the three card objects and the header/footer copy:

```tsx
const APPS: AppCard[] = [
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
    href: "/space/",
    name: "Space",
    tagline: "Alles, was du weißt, an einem Ort",
    detail:
      "Seiten und Blöcke, beliebig tief verschachtelt, Datenbanken als Tabelle, Board und Liste, und eine Suche über alles.",
    facts: ["Seiten", "Datenbanken", "Suche"],
    Icon: IconSpace,
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
```

Header: keep `<h1>Bench</h1>`; the lede becomes

```tsx
<p className="home-lede">
  Drei Apps, ein Server, ein Rechner. Deine Daten liegen als SQLite-Dateien auf
  dieser Platte und gehen nirgendwohin.
</p>
```

The card action text `Open` becomes `Öffnen`. Footer: `<strong>npm run dev</strong> · API auf 8100, Vite auf 8101` and `SQLite in ./data`.

`web/index.html`: `<html lang="de">`.

- [ ] **Step 5: Update the e2e seams and the screenshot tool**

`e2e/smoke.spec.ts`: in `APPS` the launcher entry's `tab` becomes `"Start"`; in "the nav lists every app" the expected texts become `["Start", "CRM", "Space", "Rolodex"]`; in "the nav reaches every app" replace `["Home", "Bench"]` with `["Start", "Bench"]`.

`e2e/theme.spec.ts`: replace all three `/Switch to/` with `/Design wechseln/`.

`e2e/tools/screenshots.mjs`: the toggle lookup becomes

```js
const toggle = page.getByRole("button", {
  name:
    theme === "dark"
      ? "Zum dunklen Design wechseln"
      : "Zum hellen Design wechseln",
});
```

- [ ] **Step 6: Run the unit tests**

Run: `cd web && npx vitest run src/shared/BenchNav.test.tsx src/home/App.test.tsx`
Expected: PASS.

- [ ] **Step 7: Gate and commit**

Run: `npm run format && npm run check && npm run e2e`
Expected: green.

```bash
git add -A
git commit -m "feat: German labels on the nav strip and the launcher"
```

---

### Task 5: The vault path from `.env`

**Files:**

- Create: `server/src/config.ts`, `server/test/config.test.ts`, `.env.example`, `.env` (untracked)
- Modify: `server/src/index.ts:10-30`

**Interfaces:**

- Produces:

```ts
export interface Config {
  vaultDir?: string;
}
export function configFrom(env: NodeJS.ProcessEnv): Config;
export function loadConfig(root: string): Config; // reads <root>/.env if present
export function describeSources(config: Config): string[]; // one line per source
```

Phase 1 consumes `config.vaultDir`. Later phases add one key each to `Config`, `configFrom`, `describeSources` and `.env.example` when the app that reads it arrives (`PLAUD_HOME`, `PROJECT_ROOTS`, `CONTROLLING_DIR`, `INBOX_WATCH`) - not before. STANDARDS.md forbids configuration nothing reads, and that decision was taken deliberately.

- [ ] **Step 1: Write the failing tests**

Create `server/test/config.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { configFrom, describeSources, loadConfig } from "../src/config.js";

describe("configFrom", () => {
  it("reads the vault path", () => {
    expect(configFrom({ VAULT_DIR: "/v" }).vaultDir).toBe("/v");
  });

  it("treats a missing or blank value as unset", () => {
    expect(configFrom({}).vaultDir).toBeUndefined();
    expect(configFrom({ VAULT_DIR: "   " }).vaultDir).toBeUndefined();
  });
});

describe("loadConfig", () => {
  it("reads .env from the root when it exists", () => {
    const root = mkdtempSync(path.join(tmpdir(), "bench-config-"));
    writeFileSync(path.join(root, ".env"), "VAULT_DIR=/from-file\n");
    delete process.env.VAULT_DIR;
    expect(loadConfig(root).vaultDir).toBe("/from-file");
    delete process.env.VAULT_DIR;
  });

  it("copes without a .env", () => {
    const root = mkdtempSync(path.join(tmpdir(), "bench-config-"));
    delete process.env.VAULT_DIR;
    expect(loadConfig(root).vaultDir).toBeUndefined();
  });
});

describe("describeSources", () => {
  it("names the vault and says when it is not configured", () => {
    expect(describeSources(configFrom({ VAULT_DIR: "/v" }))).toEqual([
      "Vault: /v",
    ]);
    expect(describeSources(configFrom({}))).toEqual(["Vault: not configured"]);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd server && npx vitest run test/config.test.ts`
Expected: FAIL - `../src/config.js` does not exist.

- [ ] **Step 3: Write the config module**

Create `server/src/config.ts`:

```ts
import { existsSync } from "node:fs";
import path from "node:path";

/**
 * Where Bench finds the sources it reads. Every value is a path on this machine, so none of it
 * belongs in the repo: `.env` is gitignored and `.env.example` documents the keys. A key that is
 * missing or blank means "not configured", and the app that needs it falls back to its sample.
 * A key is added here when the app that reads it arrives, not before.
 */
export interface Config {
  vaultDir?: string;
}

function optional(value: string | undefined): string | undefined {
  return value?.trim() || undefined;
}

export function configFrom(env: NodeJS.ProcessEnv): Config {
  return { vaultDir: optional(env.VAULT_DIR) };
}

/** Read `<root>/.env` into the environment if it exists, then build the config from it. */
export function loadConfig(root: string): Config {
  const file = path.join(root, ".env");
  if (existsSync(file)) process.loadEnvFile(file);
  return configFrom(process.env);
}

/** One line per source for the startup log, so a missing `.env` is visible rather than silent. */
export function describeSources(config: Config): string[] {
  return [`Vault: ${config.vaultDir ?? "not configured"}`];
}
```

- [ ] **Step 4: Run the tests**

Run: `cd server && npx vitest run test/config.test.ts`
Expected: PASS.

- [ ] **Step 5: Log the sources at startup**

`server/src/index.ts`: add `import { describeSources, loadConfig } from "./config.js";` with the other imports, add `const config = loadConfig(root);` directly after `const root = …;`, and change the listen callback to

```ts
createApp({ crm, space, rolodex }).listen(port, () => {
  console.log(`Bench running at http://localhost:${port}`);
  for (const line of describeSources(config)) console.log(`  ${line}`);
});
```

- [ ] **Step 6: Document the keys and configure this machine**

Create `.env.example` (tracked):

```
# Where Bench finds what it reads. Copy to .env and fill in - .env is gitignored.
# A missing or blank key means "not configured"; the app that needs it then uses its bundled sample.
# More keys arrive with the apps that read them (Plaud, project roots, controlling, inbox).
VAULT_DIR=/Users/you/path/to/your-obsidian-vault
```

Create `.env` (already gitignored - confirm with `git check-ignore .env`):

```
VAULT_DIR=/Users/you/path/to/your-obsidian-vault
```

- [ ] **Step 7: Prove both startup paths**

Run: `npm run build && (PORT=8177 npm run start -w server & sleep 4; curl -s localhost:8177/api/space/tree | head -c 80; echo; kill %1)`
Expected: the server prints `Bench running at http://localhost:8177` followed by one indented line `Vault: /Users/you/path/to/your-obsidian-vault`, and the curl returns JSON.

Run: `mv .env .env.local-backup && (PORT=8178 npm run start -w server & sleep 4; kill %1); mv .env.local-backup .env`
Expected: the server starts and the line reads `Vault: not configured`.

- [ ] **Step 8: Gate and commit**

Run: `npm run format && npm run check`
Expected: green - `.env` is not tracked, so check-secrets stays quiet; `.env.example` is allowed explicitly.

```bash
git add -A
git status --short   # .env must NOT appear
git commit -m "feat: load the vault path from .env and log the sources at startup"
```

---

### Task 6: Document Bench OS in the working documents

**Files:**

- Modify: `docs/PROJECT.md`, `README.md`, `AGENTS.md`, `docs/CONTROLS.md`, `docs/STANDARDS.md`

**Interfaces:**

- Consumes: the decisions in `docs/changes/bench-os/SPEC.md`.

- [ ] **Step 0: STANDARDS.md commit rule**

In `docs/STANDARDS.md` under `## Commits`, replace the bullet that begins `- **Write the message in the commit,**` with:

```markdown
- **Write the message in the commit,** not in your reply. One line in Conventional Commits form -
  `feat:`, `fix:`, `refactor:`, `docs:`, `chore:`, `test:` - imperative, under 72 characters, with
  a wrapped body only when the why does not fit on that line; no emoji. Say what changed and why.
```

- [ ] **Step 1: PROJECT.md**

Add, directly under the first paragraph, a short paragraph:

```markdown
This fork is becoming **Bench OS**: a window onto one person's Obsidian vault, Plaud notes, local
repositories and controlling reports. The plan is in [changes/bench-os/](./changes/bench-os/):
`SPEC.md` for what, `PLAN.md` for the phases. Groove was removed in Phase 0; the apps below are
what remain of the original four, and the new ones arrive one phase at a time.
```

In `## Layout`, add after the `data/` line:

```
.env                  this machine's source paths (gitignored); .env.example lists the keys
server/src/config.ts  loads .env and describes the sources at startup
```

In `## Architectural decisions`, replace the "Colour means state, not identity" bullet's first sentence with "In the strip and on the launcher, **orange `#ff5c00`** marks the app you are in and nothing else" and change "One theme, chosen once" so that "The first visit follows the operating system" reads "The first visit is dark". Then append a new bullet list under a heading `## Bench OS decisions`:

```markdown
## Bench OS decisions

Settled in [changes/bench-os/SPEC.md](./changes/bench-os/SPEC.md); listed here because they bend
the rules above.

- **Bench reads outside `data/`.** The vault, the repositories and the Plaud folder are the truth
  and stay where they are; Bench indexes them into `data/` and can rebuild every index. Paths come
  from `.env`, never from code.
- **Two write paths into the vault, guarded.** Toggling or creating a task, and importing a Plaud
  work item. Nothing else writes to a source.
- **Local CLIs are fair game.** `git`, `gh` and `claude` run as processes on this machine, the way
  Bench already runs `gitleaks`. No cloud call is made directly and no token is held.
- **`aufgaben` reads the vault index.** A task is a line in a vault note, so the Aufgaben app reads
  `vault.sqlite` through `server/src/vault/` - the one exception to "one database per app", and a
  one-way dependency.
- **German interface, English code.** Routes and labels are German (`/projekte`, `Aufgaben`); the
  code, the docs and the commits stay English.
- **Immutable data.** New code builds new objects rather than mutating - the user's standing rule,
  on top of STANDARDS.md.
```

- [ ] **Step 2: README.md**

Replace the opening line "Four local-first apps behind one server." with "Three local-first apps behind one server, growing into a personal workbench - see `docs/changes/bench-os/`." Add to section 1, after `npm ci`, a subsection:

```markdown
## 1.4 Point Bench at your files (optional)

Copy `.env.example` to `.env` and fill in the paths. Without it Bench runs on bundled samples.
The server prints, on start, which sources it found.
```

- [ ] **Step 3: AGENTS.md**

After the golden rules add:

```markdown
- **Bench OS work follows [docs/changes/bench-os/PLAN.md](docs/changes/bench-os/PLAN.md)** phase
  by phase; the task plan for the current phase sits beside it.
- **German UI, English code.** Labels, routes and copy in German; identifiers, comments, docs and
  commit messages in English.
```

- [ ] **Step 4: CONTROLS.md coverage table**

Run `npm run coverage` and replace the numbers in the "Where it stands" table with the ones printed (server overall, each web directory that still exists, web overall). Add a row `web/src/shared` if the table lacks one and the run prints it.

- [ ] **Step 5: Format, lint, commit**

```bash
npm run format && npm run lint
git add -A
git commit -m "docs: describe the three-app Bench and the Bench OS decisions"
```

---

### Task 7: Final gate, screenshots, exploratory notes

**Files:**

- Modify: `.gitignore`, `e2e/EXPLORATORY.md`

- [ ] **Step 1: Ignore screenshot output**

Append to `.gitignore` under "# Test output":

```
screenshots/
```

- [ ] **Step 2: Build and serve the production bundle**

Run: `npm start` in a second terminal (or `npm start &`), wait for `Bench running at http://localhost:8100`.

- [ ] **Step 3: Capture the chrome in both themes**

Create `e2e/tools/chrome-shots.mjs`:

```js
/**
 * Launcher and nav strip in both themes, for reviewing the shared chrome after a visual change.
 * Usage: node e2e/tools/chrome-shots.mjs [baseURL]
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const base = process.argv[2] ?? "http://localhost:8100";
mkdirSync("screenshots", { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

for (const theme of ["dark", "light"]) {
  for (const path of ["/", "/crm/", "/space/", "/rolodex/"]) {
    await page.goto(base + path);
    await page.evaluate((t) => {
      localStorage.setItem("bench.theme", t);
    }, theme);
    await page.reload();
    await page.waitForTimeout(350);
    const name = path === "/" ? "start" : path.replaceAll("/", "");
    await page.screenshot({ path: `screenshots/${name}-${theme}.png` });
    console.log("captured", name, theme);
  }
}

await browser.close();
```

Run: `node e2e/tools/chrome-shots.mjs`
Expected: eight files in `screenshots/`. Open each (the Read tool renders PNGs) and check: the strip is 47 px with an orange top line, the active tab is orange, the launcher has no uppercase label above `Bench`, cards do not lift on hover (static image - confirm in the CSS), text is legible in both themes.

Register the new script in `knip.json` root `entry` so knip does not report it: change `"e2e/tools/*.mjs"` - already a glob, so nothing to do; confirm with `npm run knip`.

- [ ] **Step 4: Record what automation cannot see**

In `e2e/EXPLORATORY.md` "Cross-app", replace "same amber line" with "same orange line" and add a bullet:

```markdown
- After a chrome change, run `node e2e/tools/chrome-shots.mjs` against `npm start` and look at
  all eight images. The suite asserts labels and the current tab; whether orange on the dark strip
  is legible next to CRM's light sidebar is a judgement.
```

- [ ] **Step 5: The full gate, one last time**

Run: `npm run format && npm run check && npm run e2e`
Expected: green.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: chrome screenshot tool and the exploratory notes for it"
```

- [ ] **Step 7: Report**

Summarise for the user: commits on `bench-os-phase-0`, the coverage figures, the e2e count, which of the six Phase 0 success criteria in `PLAN.md` are met and which need their action (pushing the branch, enabling Actions in the fork). Do not push.
