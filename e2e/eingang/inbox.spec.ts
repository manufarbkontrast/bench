/** The Eingang inbox listing: the three fixture files reconciled to their status - the
    werkstattrunde transcript unprocessed, the Hafenrunde one already noted, and the audio file
    filed rather than processed. Boot itself is smoke.spec.ts's job, not this file's. */
import { test, expect } from "../fixtures";

test("/eingang/ lists the three fixture files with their reconciled status", async ({
  page,
}) => {
  await page.goto("/eingang/");
  await expect(
    page.getByRole("heading", { name: "Neu und unverarbeitet" }),
  ).toBeVisible();

  const werkstattrunde = page
    .getByRole("listitem")
    .filter({ hasText: "2026-08-30_werkstattrunde-transcript.txt" });
  await expect(werkstattrunde).toContainText("Unverarbeitet");
  // Unprocessed, a text file and inside the watched inbox dir itself - the one combination
  // isProcessable allows, so Verarbeiten is live rather than just present.
  await expect(
    werkstattrunde.getByRole("button", {
      name: "Verarbeiten: 2026-08-30_werkstattrunde-transcript.txt",
      exact: true,
    }),
  ).toBeEnabled();

  const hafenrunde = page
    .getByRole("listitem")
    .filter({ hasText: "08-20_Besprechung_Hafenrunde-transcript.pdf" });
  await expect(hafenrunde).toContainText("Notiz vorhanden");
  // A note already carries this file's quelle, so it is no longer unverarbeitet - the button
  // stays but disabled, since re-processing an already-noted file is not offered.
  await expect(
    hafenrunde.getByRole("button", {
      name: "Verarbeiten: 08-20_Besprechung_Hafenrunde-transcript.pdf",
      exact: true,
    }),
  ).toBeDisabled();

  const aufnahme = page
    .getByRole("listitem")
    .filter({ hasText: "aufnahme-2026-08-28.m4a" });
  await expect(aufnahme).toContainText("Unverarbeitet");
  await expect(aufnahme).toContainText("Nur Ablage");
});
