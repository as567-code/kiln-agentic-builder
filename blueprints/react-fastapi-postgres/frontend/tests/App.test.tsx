import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import App from "../src/App";

vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("offline"))));

describe("Pantry", () => {
  it("renders the contract-backed application profile", () => {
    render(<App />);
    const scheduleHeading = screen.queryByRole("heading", { name: "This week's shifts" });
    if (scheduleHeading) {
      expect(scheduleHeading).toBeVisible();
      expect(screen.getByRole("region", { name: "Volunteer shifts" })).toBeVisible();
      expect(screen.getByText("Capacity rules are enforced by the API")).toBeVisible();
      return;
    }
    expect(screen.getByRole("heading", { name: "Today's inventory" })).toBeVisible();
    expect(screen.getByText("Bread flour")).toBeVisible();
    expect(screen.getByText("Reorder")).toBeVisible();
  });
});
