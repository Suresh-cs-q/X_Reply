import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { openContext } from "../src/playwright/session.ts";

const OUT_DIR = "data";
mkdirSync(OUT_DIR, { recursive: true });

console.log("opening saved Chrome session ...");
const ctx = await openContext();

const page = ctx.pages()[0] ?? (await ctx.newPage());
await page.goto("https://x.com/home", { waitUntil: "domcontentloaded", timeout: 30_000 });
await page.waitForTimeout(4_000);

const url = page.url();
const title = await page.title();
const screenshot = join(OUT_DIR, "verify-home.png");
await page.screenshot({ path: screenshot });

const composeBtn = await page.locator('[data-testid="SideNav_NewTweet_Button"]').count();
const onLoginPage = /\/login|\/i\/flow\/login/.test(url);
const loggedIn = composeBtn > 0 && !onLoginPage;

console.log("");
console.log("---------------------------------");
console.log(`URL          : ${url}`);
console.log(`Title        : ${title}`);
console.log(`Compose btn  : ${composeBtn > 0 ? "found" : "not found"}`);
console.log(`Screenshot   : ${screenshot}`);
console.log(`Logged in?   : ${loggedIn ? "YES ✓" : "NO ✗"}`);
console.log("---------------------------------");

await ctx.close();
process.exit(loggedIn ? 0 : 1);
