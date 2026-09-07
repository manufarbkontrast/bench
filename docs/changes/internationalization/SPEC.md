# Change: add language to the entire application

> **Inherited from upstream, and out of date. Rewrite it before building against it.** This spec
> came with the fork and describes the repository as it was before Bench OS: four products, one of
> them Grovebox, and an English interface. Bench now has nine documents, no Grovebox, and a
> deliberately German interface with English code - see
> [PROJECT.md](../../PROJECT.md). The idea is still open; the text below is not a usable brief.
> README.md section 3.2 still points here as a worked example.

## Goal

Add a selector to the UI next to the Light mode / dark mode toggle that switches all 4 products between English & Spanish.

## Constraints

Be sure that translation text is stored separately from the code.
Do not change the actual user data in the database; the translation should only affect the controls and text in the UI

## Out of scope

Grovebox patches or controls that would typically be in English.

## Success criteria

Screenshots showing the entire application translated, with screenshots fully validated.
Comprehensive e2e tests of the whole platform in both languages, switching once and twice, and validated.
