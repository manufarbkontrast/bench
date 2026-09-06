import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AufnahmenPanel from "./AufnahmenPanel";
import type { PlaudReply, Recording } from "../types";

function recording(overrides: Partial<Recording> = {}): Recording {
  return {
    id: "fix-lampe-0901",
    titel: "Lampe für den Leuchtturm",
    start: "2026-09-01T09:00:00",
    dauer: 1523000,
    status: "neu",
    ...overrides,
  };
}
const reply = (overrides: Partial<PlaudReply> = {}): PlaudReply => ({
  source: "mcp",
  recordings: [recording()],
  nextPage: null,
  ...overrides,
});
const noop = { onFetch: vi.fn(), onReload: vi.fn(), onMore: vi.fn() };

describe("AufnahmenPanel", () => {
  it("shows Lädt … before the first reply", () => {
    render(<AufnahmenPanel reply={null} {...noop} />);
    expect(screen.getByText("Lädt …")).toBeInTheDocument();
  });
  it("renders a row with title, meta and an enabled Holen for a new recording", async () => {
    const onFetch = vi.fn();
    render(<AufnahmenPanel reply={reply()} {...noop} onFetch={onFetch} />);
    expect(screen.getByText("Lampe für den Leuchtturm")).toBeInTheDocument();
    expect(screen.getByText(/25m23s/)).toBeInTheDocument();
    const button = screen.getByRole("button", {
      name: "Holen: Lampe für den Leuchtturm",
    });
    expect(button).toBeEnabled();
    await userEvent.click(button);
    expect(onFetch).toHaveBeenCalledWith("fix-lampe-0901");
  });
  it("renders a row with a blank start without throwing", () => {
    render(
      <AufnahmenPanel
        reply={reply({ recordings: [recording({ start: "" })] })}
        {...noop}
      />,
    );
    expect(screen.getByText(/Ohne Datum/)).toBeInTheDocument();
  });
  it("disables Holen with the status as title for every other status", () => {
    render(
      <AufnahmenPanel
        reply={reply({
          recordings: [
            recording({ status: "wird_geholt" }),
            recording({ id: "b", titel: "B", status: "im_eingang" }),
            recording({ id: "c", titel: "C", status: "im_archiv" }),
            recording({ id: "d", titel: "D", status: "notiz_vorhanden" }),
          ],
        })}
        {...noop}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Holen: Lampe für den Leuchtturm" }),
    ).toHaveAttribute("title", "Wird geholt");
    expect(screen.getByRole("button", { name: "Holen: B" })).toHaveAttribute(
      "title",
      "Im Eingang",
    );
    expect(screen.getByRole("button", { name: "Holen: C" })).toHaveAttribute(
      "title",
      "Im Archiv",
    );
    expect(screen.getByRole("button", { name: "Holen: D" })).toHaveAttribute(
      "title",
      "Notiz vorhanden",
    );
    expect(screen.getByText("Wird geholt")).toBeInTheDocument();
  });
  it("shows one source line per non-mcp source and the empty state", () => {
    const { rerender } = render(
      <AufnahmenPanel
        reply={reply({ source: "off", recordings: [] })}
        {...noop}
      />,
    );
    expect(
      screen.getByText("Plaud ist nicht konfiguriert."),
    ).toBeInTheDocument();
    rerender(
      <AufnahmenPanel
        reply={reply({ source: "unauthenticated", recordings: [] })}
        {...noop}
      />,
    );
    expect(
      screen.getByText("Nicht angemeldet - im Terminal /plaud starten."),
    ).toBeInTheDocument();
    rerender(
      <AufnahmenPanel
        reply={reply({ source: "unreachable", recordings: [] })}
        {...noop}
      />,
    );
    expect(screen.getByText("Plaud nicht erreichbar.")).toBeInTheDocument();
    rerender(
      <AufnahmenPanel
        reply={reply({ source: "sample", recordings: [] })}
        {...noop}
      />,
    );
    expect(screen.getByText("Beispieldaten")).toBeInTheDocument();
    expect(screen.getByText("Keine Aufnahmen.")).toBeInTheDocument();
  });
  it("offers Neu laden always and Mehr laden only with a next page", async () => {
    const onMore = vi.fn();
    const onReload = vi.fn();
    const { rerender } = render(
      <AufnahmenPanel
        reply={reply({ nextPage: 2 })}
        {...noop}
        onMore={onMore}
        onReload={onReload}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Mehr laden" }));
    expect(onMore).toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Neu laden" }));
    expect(onReload).toHaveBeenCalled();
    rerender(<AufnahmenPanel reply={reply()} {...noop} />);
    expect(
      screen.queryByRole("button", { name: "Mehr laden" }),
    ).not.toBeInTheDocument();
  });
});
