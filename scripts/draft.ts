import { draftReply } from "../src/llm/draft.ts";
import { humanizeReply } from "../src/llm/humanize.ts";
import { fetchTweetContext } from "../src/playwright/context.ts";
import { openContext } from "../src/playwright/session.ts";

const [, , tweetUrl] = process.argv;
if (!tweetUrl) {
  console.error('usage: npm run draft -- "<tweet-url>"');
  process.exit(1);
}

const ctx = await openContext();

const page = ctx.pages()[0] ?? (await ctx.newPage());
await page.goto(tweetUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
await page.waitForTimeout(3_500);

const tweetText = await page
  .locator('article [data-testid="tweetText"]')
  .first()
  .innerText()
  .catch(() => "");

if (!tweetText) {
  console.error("could not extract tweet text");
  await ctx.close();
  process.exit(2);
}

console.log("");
console.log("--- TWEET TEXT ---");
console.log(tweetText);
console.log("------------------");

const threadCtx = await fetchTweetContext(page, tweetUrl);
if (threadCtx.parent) {
  console.log(`--- PARENT (@${threadCtx.parent.author}) ---`);
  console.log(threadCtx.parent.text);
  console.log("------------------");
}
if (threadCtx.quoted) {
  console.log(`--- QUOTED (@${threadCtx.quoted.author}) ---`);
  console.log(threadCtx.quoted.text);
  console.log("------------------");
}

console.log("\ngenerating 3 draft variations (draft -> humanize) ...\n");
for (let i = 1; i <= 3; i++) {
  const r = await draftReply(tweetText, threadCtx);
  console.log(`[${i}] draft (${r.provider}, ${r.text.length}c, ${r.text.split(/\s+/).length}w)`);
  console.log(`    ${r.text}`);
  if (r.text.trim().toUpperCase() !== "SKIP") {
    const h = await humanizeReply(r.text, tweetText);
    const marker = h.changed ? "CHANGED" : "unchanged";
    console.log(`    humanized (${h.provider}, ${marker}): ${h.text}`);
  }
  console.log("");
}

await ctx.close();
