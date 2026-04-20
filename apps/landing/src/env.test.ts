import { describe, expect, it } from "vitest";
import { parseEnv } from "./env";

describe("parseEnv", () => {
  const valid = {
    TALLY_FORM_ID: "abc123",
    GITHUB_URL: "https://github.com/vladprrs/rntme",
    DOCS_URL: "https://docs.rntme.com",
    PLATFORM_URL: "https://platform.rntme.com",
  };

  it("returns a typed env object when all required vars are present", () => {
    const env = parseEnv(valid);
    expect(env.TALLY_FORM_ID).toBe("abc123");
    expect(env.GITHUB_URL).toBe("https://github.com/vladprrs/rntme");
    expect(env.DEMO_URL).toBeUndefined();
    expect(env.PLAUSIBLE_DOMAIN).toBeUndefined();
  });

  it("passes through DEMO_URL when provided", () => {
    const env = parseEnv({ ...valid, DEMO_URL: "https://demo.rntme.com" });
    expect(env.DEMO_URL).toBe("https://demo.rntme.com");
  });

  it("passes through PLAUSIBLE_DOMAIN when provided", () => {
    const env = parseEnv({ ...valid, PLAUSIBLE_DOMAIN: "rntme.com" });
    expect(env.PLAUSIBLE_DOMAIN).toBe("rntme.com");
  });

  it("throws a structured error listing every missing required var", () => {
    expect(() => parseEnv({})).toThrowError(
      /Missing required env vars: TALLY_FORM_ID, GITHUB_URL, DOCS_URL, PLATFORM_URL/,
    );
  });

  it("rejects non-https URLs for URL vars", () => {
    expect(() =>
      parseEnv({ ...valid, GITHUB_URL: "http://github.com/foo" }),
    ).toThrowError(/GITHUB_URL.*https/);
  });

  it("treats empty-string DEMO_URL the same as absent", () => {
    const env = parseEnv({ ...valid, DEMO_URL: "" });
    expect(env.DEMO_URL).toBeUndefined();
  });
});
