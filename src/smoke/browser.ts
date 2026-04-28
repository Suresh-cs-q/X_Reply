import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const OUT_DIR = "data";
mkdirSync(OUT_DIR, { recursive: true });

const browser = await chromium.launch({ headless: false });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();

console.log("opening x.com ...");
await page.goto("https://x.com", { waitUntil: "domcontentloaded", timeout: 30_000 });
await page.waitForTimeout(3_000);

const screenshot = join(OUT_DIR, "x-home.png");
await page.screenshot({ path: screenshot, fullPage: false });
console.log(`screenshot saved -> ${screenshot}`);
console.log(`page title -> ${await page.title()}`);

await browser.close();
console.log("OK");
