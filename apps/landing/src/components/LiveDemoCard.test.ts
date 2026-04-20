import { describe, expect, it } from "vitest";
import { shouldRenderDemo } from "./shouldRenderDemo";

describe("shouldRenderDemo", () => {
  it("returns false when DEMO_URL is undefined", () => {
    expect(shouldRenderDemo(undefined)).toBe(false);
  });

  it("returns false when DEMO_URL is empty string", () => {
    expect(shouldRenderDemo("")).toBe(false);
  });

  it("returns false when DEMO_URL is whitespace", () => {
    expect(shouldRenderDemo("   ")).toBe(false);
  });

  it("returns true when DEMO_URL is an https URL", () => {
    expect(shouldRenderDemo("https://demo.rntme.com")).toBe(true);
  });

  it("returns false when DEMO_URL is not https", () => {
    expect(shouldRenderDemo("http://demo.rntme.com")).toBe(false);
  });
});
