import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SkillsPanel from "./SkillsPanel";
import type { Skill } from "../types";

const SKILLS: Skill[] = [
  { name: "leuchtturm-skill", description: "Ordnet Fixture-Daten ein" },
  { name: "hafen-skill", description: "Sammelt Ankunftsdaten" },
];

describe("SkillsPanel", () => {
  it("shows the API's folder count regardless of the list length", () => {
    render(<SkillsPanel count={5} skills={SKILLS} />);
    expect(screen.getByText("5 Skills")).toBeInTheDocument();
  });

  it("renders each row as name em dash description", () => {
    render(<SkillsPanel count={2} skills={SKILLS} />);
    expect(
      screen.getByText("leuchtturm-skill — Ordnet Fixture-Daten ein"),
    ).toBeInTheDocument();
  });

  it("narrows the rows on search but keeps the counter at count", async () => {
    render(<SkillsPanel count={2} skills={SKILLS} />);
    await userEvent.type(screen.getByLabelText("Suchen"), "hafen");
    expect(screen.queryByText(/leuchtturm-skill/)).not.toBeInTheDocument();
    expect(screen.getByText(/hafen-skill/)).toBeInTheDocument();
    expect(screen.getByText("2 Skills")).toBeInTheDocument();
  });

  it("matches on description too, case-insensitively", async () => {
    render(<SkillsPanel count={2} skills={SKILLS} />);
    await userEvent.type(screen.getByLabelText("Suchen"), "ANKUNFTS");
    expect(screen.getByText(/hafen-skill/)).toBeInTheDocument();
    expect(screen.queryByText(/leuchtturm-skill/)).not.toBeInTheDocument();
  });

  it("shows Nichts gefunden. when the search matches nothing", async () => {
    render(<SkillsPanel count={2} skills={SKILLS} />);
    await userEvent.type(screen.getByLabelText("Suchen"), "kein-treffer");
    expect(screen.getByText("Nichts gefunden.")).toBeInTheDocument();
    expect(screen.getByText("2 Skills")).toBeInTheDocument();
  });

  it("shows Nichts gefunden. when there are no skills at all", () => {
    render(<SkillsPanel count={0} skills={[]} />);
    expect(screen.getByText("Nichts gefunden.")).toBeInTheDocument();
    expect(screen.getByText("0 Skills")).toBeInTheDocument();
  });
});
