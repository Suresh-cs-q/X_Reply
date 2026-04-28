import { defineConfig } from "@trigger.dev/sdk";
import { playwright } from "@trigger.dev/build/extensions/playwright";

export default defineConfig({
  project: "proj_xntuspxcqkgbblizsxdl",
  dirs: ["./src/trigger"],
  retries: {
    enabledInDev: false,
    default: {
      maxAttempts: 2,
      minTimeoutInMs: 5_000,
      maxTimeoutInMs: 30_000,
      factor: 2,
      randomize: true,
    },
  },
  maxDuration: 600,
  build: {
    external: ["playwright", "playwright-core", "chromium-bidi"],
    extensions: [playwright({ browsers: ["chromium"], headless: false })],
  },
});
