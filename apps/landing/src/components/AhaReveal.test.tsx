import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AhaReveal, revealSteps } from "./AhaReveal";

describe("AhaReveal", () => {
  it("renders the blueprint JSON block", () => {
    render(<AhaReveal />);
    expect(screen.getByTestId("blueprint-json")).toBeInTheDocument();
  });

  it("renders one panel per reveal step", () => {
    render(<AhaReveal />);
    for (const step of revealSteps) {
      expect(screen.getByTestId(`panel-${step.id}`)).toBeInTheDocument();
    }
  });

  it("each step starts hidden (data-visible=false)", () => {
    render(<AhaReveal />);
    for (const step of revealSteps) {
      expect(screen.getByTestId(`panel-${step.id}`)).toHaveAttribute("data-visible", "false");
    }
  });

  it("registers an IntersectionObserver per step", () => {
    const ObserverMock = vi.fn(() => ({
      observe: vi.fn(),
      unobserve: vi.fn(),
      disconnect: vi.fn(),
    }));
    vi.stubGlobal("IntersectionObserver", ObserverMock);
    render(<AhaReveal />);
    expect(ObserverMock).toHaveBeenCalledTimes(revealSteps.length);
  });
});
