import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { openContext } from "../src/playwright/session.ts";

const [, , tweetUrl, replyText] = process.argv;
if (!tweetUrl || !replyText) {
  console.error('usage: npm run reply -- "<tweet-url>" "<reply-text>"');
  process.exit(1);
}

const OUT_DIR = "data";
mkdirSync(OUT_DIR, { recursive: true });

console.log("opening saved Chrome session ...");
const ctx = await openContext();

const page = ctx.pages()[0] ?? (await ctx.newPage());
console.log(`navigating to ${tweetUrl}`);
await page.goto(tweetUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
await page.waitForTimeout(4_000);

const tweetText = await page
  .locator("article")
  .first()
  .innerText()
  .catch(() => "(could not read tweet)");
console.log("");
console.log("--- TWEET ---");
console.log(tweetText.slice(0, 400));
console.log("--- REPLY ---");
console.log(replyText);
console.log("-------------");

await page.screenshot({ path: join(OUT_DIR, "reply-pre.png") });

const replyBox = page.locator('[data-testid="tweetTextarea_0"]').first();
try {
  await replyBox.waitFor({ timeout: 15_000 });
} catch {
  console.error("reply textbox not found — tweet may be deleted, protected, or X layout changed");
  await page.screenshot({ path: join(OUT_DIR, "reply-error.png") });
  await ctx.close();
  process.exit(2);
}

await replyBox.click();
await page.waitForTimeout(700 + Math.random() * 600);

console.log("typing reply with human-like delay ...");
await replyBox.pressSequentially(replyText, { delay: 70 + Math.random() * 70 });
await page.waitForTimeout(2000);

console.log("pausing 3s before submit (look at Chrome window) ...");
await page.waitForTimeout(3_000);

const submitBtn = page.locator('[data-testid="tweetButtonInline"]').first();
try {
  await submitBtn.waitFor({ state: "visible", timeout: 8_000 });
} catch {
  console.error("submit button not visible — abort");
  await page.screenshot({ path: join(OUT_DIR, "reply-error.png") });
  await ctx.close();
  process.exit(3);
}

await submitBtn.click();
console.log("submit clicked, waiting for confirmation ...");
await page.waitForTimeout(6_000);
await page.screenshot({ path: join(OUT_DIR, "reply-post.png") });

console.log("done");
console.log(`pre-screenshot:  ${join(OUT_DIR, "reply-pre.png")}`);
console.log(`post-screenshot: ${join(OUT_DIR, "reply-post.png")}`);

await ctx.close();
