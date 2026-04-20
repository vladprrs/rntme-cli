export interface LandingEnv {
  TALLY_FORM_ID: string;
  GITHUB_URL: string;
  DOCS_URL: string;
  PLATFORM_URL: string;
  DEMO_URL?: string;
  PLAUSIBLE_DOMAIN?: string;
}

const REQUIRED = ["TALLY_FORM_ID", "GITHUB_URL", "DOCS_URL", "PLATFORM_URL"] as const;
const URL_VARS = ["GITHUB_URL", "DOCS_URL", "PLATFORM_URL", "DEMO_URL"] as const;

export function parseEnv(raw: Record<string, string | undefined>): LandingEnv {
  const missing = REQUIRED.filter((key) => !raw[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required env vars: ${missing.join(", ")}`);
  }

  for (const key of URL_VARS) {
    const value = raw[key];
    if (value && !value.startsWith("https://")) {
      throw new Error(`${key} must be an https:// URL (got: ${value})`);
    }
  }

  return {
    TALLY_FORM_ID: raw.TALLY_FORM_ID!,
    GITHUB_URL: raw.GITHUB_URL!,
    DOCS_URL: raw.DOCS_URL!,
    PLATFORM_URL: raw.PLATFORM_URL!,
    DEMO_URL: raw.DEMO_URL || undefined,
    PLAUSIBLE_DOMAIN: raw.PLAUSIBLE_DOMAIN || undefined,
  };
}

export function loadEnv(): LandingEnv {
  return parseEnv(import.meta.env as Record<string, string | undefined>);
}
