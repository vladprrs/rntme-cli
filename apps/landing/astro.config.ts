import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import mdx from "@astrojs/mdx";
import { parseEnv } from "./src/env.ts";

// Fail-fast: if any required env is missing at build time, the build aborts here.
parseEnv(process.env as Record<string, string | undefined>);

export default defineConfig({
  site: "https://rntme.com",
  output: "static",
  integrations: [react(), mdx()],
  build: {
    inlineStylesheets: "auto",
  },
  vite: {
    build: {
      cssMinify: true,
    },
  },
});
