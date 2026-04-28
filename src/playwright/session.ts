import type { BrowserContext } from "playwright";

export const USER_DATA_DIR = "./playwright-session";
export const DEFAULT_NAV_TIMEOUT_MS = 60_000;

export async function openContext(opts: { headless?: boolean } = {}): Promise<BrowserContext> {
  const { chromium } = await import("playwright");
  const ctx = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: opts.headless ?? false,
    channel: "chrome",
    viewport: { width: 1280, height: 800 },
    ignoreDefaultArgs: ["--enable-automation"],
    args: ["--disable-blink-features=AutomationControlled"],
  });
  ctx.setDefaultNavigationTimeout(DEFAULT_NAV_TIMEOUT_MS);
  await ctx.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
  });

  if (!(opts.headless ?? false)) {
    try {
      const page = ctx.pages()[0] ?? (await ctx.newPage());
      const cdp = await ctx.newCDPSession(page);
      const { windowId } = (await cdp.send("Browser.getWindowForTarget")) as { windowId: number };
      await cdp.send("Browser.setWindowBounds", {
        windowId,
        bounds: { windowState: "minimized" },
      });
      await cdp.detach();
    } catch (e) {
      console.warn(`[session] window minimize failed: ${(e as Error).message}`);
    }
  }

  return ctx;
}
