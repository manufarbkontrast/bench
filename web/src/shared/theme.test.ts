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
