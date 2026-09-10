import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import TimelinePage from "./TimelinePage";
import CalendarPage from "./CalendarPage";
import { api } from "../api";
import { StoreContext, ToastContext } from "../store";
import { person, timelineEntry, upcoming } from "../test/helpers";
import { format } from "date-fns";

vi.mock("../api");

const maya = person({ id: 1, name: "Maya Chen" });

function renderWithStore(ui: React.ReactElement) {
  return render(
    <MemoryRouter>
      <StoreContext.Provider
        value={{ people: [maya], tags: [], loaded: true, refresh: vi.fn() }}
      >
        <ToastContext.Provider value={vi.fn()}>{ui}</ToastContext.Provider>
      </StoreContext.Provider>
    </MemoryRouter>,
  );
}

describe("Timeline", () => {
  it("lists what was logged, and counts it", async () => {
    vi.mocked(api.timeline).mockResolvedValue([
      timelineEntry({ id: "i1", text: "Talked about the move" }),
      timelineEntry({
        id: "n1",
        kind: "news",
        interaction_type: null,
        text: "Moved to Berlin",
      }),
    ]);
    renderWithStore(<TimelinePage />);
    expect(
      await screen.findByText("2 entries across everyone, newest first"),
    ).toBeInTheDocument();
    expect(screen.getByText("Talked about the move")).toBeInTheDocument();
    expect(screen.getByText("News recorded")).toBeInTheDocument();
  });

  it("asks the API for one person or one kind when the filters change", async () => {
    vi.mocked(api.timeline).mockResolvedValue([]);
    renderWithStore(<TimelinePage />);
    await screen.findByText(/0 entries/);

    await userEvent.selectOptions(screen.getByLabelText("Person"), "1");
    expect(api.timeline).toHaveBeenLastCalledWith(1, null);

    await userEvent.selectOptions(screen.getByLabelText("Activity"), "news");
    expect(api.timeline).toHaveBeenLastCalledWith(1, "news");
  });

  it("says when the filters match nothing", async () => {
    vi.mocked(api.timeline).mockResolvedValue([]);
    renderWithStore(<TimelinePage />);
    expect(
      await screen.findByText("Nothing matches these filters."),
    ).toBeInTheDocument();
  });
});

describe("Calendar", () => {
  it("shows the month's dates and what is coming up", async () => {
    vi.mocked(api.calendar).mockResolvedValue({
      year: 2026,
      month: 8,
      events: [upcoming({ date: "2026-08-21", person_name: "Maya Chen" })],
      upcoming: [upcoming({ date: "2026-08-21", person_name: "Maya Chen" })],
    });
    renderWithStore(<CalendarPage />);
    expect(
      await screen.findByText("Coming up — next 30 days"),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Maya Chen").length).toBeGreaterThan(0);
  });

  it("says when a month is quiet", async () => {
    vi.mocked(api.calendar).mockResolvedValue({
      year: 2026,
      month: 8,
      events: [],
      upcoming: [],
    });
    renderWithStore(<CalendarPage />);
    expect(
      await screen.findByText("Nothing in the next 30 days — a quiet month."),
    ).toBeInTheDocument();
  });

  // The page opens on the real current month, so events dated in it land on a visible tile.
  const inThisMonth = (day: number) =>
    `${format(new Date(), "yyyy-MM")}-${String(day).padStart(2, "0")}`;

  it("puts a day's first three events on its tile and counts the rest", async () => {
    const onThe15th = (id: number, person_name: string) =>
      upcoming({ id, person_name, date: inThisMonth(15), age_turning: null });
    vi.mocked(api.calendar).mockResolvedValue({
      year: 2026,
      month: 9,
      events: [
        onThe15th(1, "Maya Chen"),
        onThe15th(2, "Ben Ortiz"),
        onThe15th(3, "Cara Diaz"),
        onThe15th(4, "Dan Wu"),
      ],
      upcoming: [],
    });
    renderWithStore(<CalendarPage />);
    for (const first of ["Maya", "Ben", "Cara"])
      expect(
        await screen.findByRole("link", { name: first }),
      ).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Dan" })).not.toBeInTheDocument();
    expect(screen.getByText("+1 more")).toBeInTheDocument();
  });

  it("titles a milestone birthday with the age it brings", async () => {
    vi.mocked(api.calendar).mockResolvedValue({
      year: 2026,
      month: 9,
      events: [
        upcoming({ date: inThisMonth(15), milestone: true, age_turning: 40 }),
        upcoming({ id: 2, date: inThisMonth(20), person_name: "Ben Ortiz" }),
      ],
      upcoming: [],
    });
    renderWithStore(<CalendarPage />);
    expect(
      await screen.findByTitle("Birthday — Maya Chen turns 40!"),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ben · 35" })).toHaveAttribute(
      "title",
      "Birthday",
    );
  });

  it("asks for the next month when the page turns", async () => {
    vi.mocked(api.calendar).mockResolvedValue({
      year: 2026,
      month: 9,
      events: [],
      upcoming: [],
    });
    renderWithStore(<CalendarPage />);
    await userEvent.click(
      await screen.findByRole("button", { name: "Next month" }),
    );
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    expect(api.calendar).toHaveBeenLastCalledWith(
      next.getFullYear(),
      next.getMonth() + 1,
    );
  });

  it("says so when the calendar cannot be loaded", async () => {
    vi.mocked(api.calendar).mockRejectedValue(new Error("Server unreachable"));
    renderWithStore(<CalendarPage />);
    expect(
      await screen.findByText("Couldn’t load the calendar: Server unreachable"),
    ).toBeInTheDocument();
  });
});
