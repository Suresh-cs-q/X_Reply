import { mkdirSync, existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { openContext, USER_DATA_DIR } from "../src/playwright/session.ts";

const SIGNAL_FILE = join(USER_DATA_DIR, ".logged-in");

mkdirSync(USER_DATA_DIR, { recursive: true });
if (existsSync(SIGNAL_FILE)) unlinkSync(SIGNAL_FILE);

console.log("launching real Chrome with persistent session ...");
const ctx = await openContext();

const page = ctx.pages()[0] ?? (await ctx.newPage());
await page.goto("https://x.com/login", { waitUntil: "domcontentloaded" });

console.log("");
console.log("=================================================================");
console.log("Chromium is open. Log into X manually in that window.");
console.log("Handle 2FA / captcha / any prompts X shows you.");
console.log("");
console.log("When you're fully logged in (you can see your home timeline),");
console.log("tell Claude 'I'm logged in' and Claude will signal this script");
console.log("to close cleanly and save your session.");
console.log("=================================================================");
console.log("");

while (!existsSync(SIGNAL_FILE)) {
  await new Promise((r) => setTimeout(r, 2000));
}

console.log("login confirmed -> closing browser cleanly ...");
await ctx.close();
unlinkSync(SIGNAL_FILE);
console.log(`session saved to ${USER_DATA_DIR}`);
