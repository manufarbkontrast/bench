import { screen } from "@testing-library/react";
import { expect, it } from "vitest";

it("lets findBy outwait a worker starved past Testing Library's 1000ms default", async () => {
  // 1.5s of real time, on purpose: the setting under test is a wall-clock budget.
  setTimeout(() => {
    document.body.insertAdjacentHTML("beforeend", "<p>arrived late</p>");
  }, 1500);
  const late = await screen.findByText("arrived late");
  expect(late).toBeInTheDocument();
  late.remove();
});
