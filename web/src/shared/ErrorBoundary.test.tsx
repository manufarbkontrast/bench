import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import ErrorBoundary from "./ErrorBoundary";

function Bomb(): never {
  throw new Error("Intl kann NaN nicht");
}

describe("ErrorBoundary", () => {
  it("renders its children while nothing throws", () => {
    render(
      <ErrorBoundary active="eingang">
        <p>alles gut</p>
      </ErrorBoundary>,
    );
    expect(screen.getByText("alles gut")).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Diese Seite ist abgestürzt." }),
    ).not.toBeInTheDocument();
  });

  it("replaces a throwing tree with the strip, the message, the error text and a reload button", () => {
    // React reports every caught render error on console.error; expect the call, do not print it.
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    render(
      <ErrorBoundary active="eingang">
        <Bomb />
      </ErrorBoundary>,
    );
    const nav = within(screen.getByRole("navigation", { name: "Primary" }));
    expect(
      nav.getByRole("link", { name: "Eingang" }).getAttribute("aria-current"),
    ).toBe("page");
    expect(
      screen.getByRole("heading", { name: "Diese Seite ist abgestürzt." }),
    ).toBeInTheDocument();
    expect(screen.getByText("Intl kann NaN nicht")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Neu laden" }),
    ).toBeInTheDocument();
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("shows a thrown non-Error value as text", () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    function ThrowsString(): never {
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- the branch under test is exactly a non-Error throw
      throw "kaputt";
    }
    render(
      <ErrorBoundary active="zahlen">
        <ThrowsString />
      </ErrorBoundary>,
    );
    expect(screen.getByText("kaputt")).toBeInTheDocument();
    consoleError.mockRestore();
  });
});
