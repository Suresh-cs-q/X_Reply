import { discoverCandidates } from "../src/playwright/discover.ts";
import { openContext } from "../src/playwright/session.ts";

const ctx = await openContext();

const page = ctx.pages()[0] ?? (await ctx.newPage());
const candidates = await discoverCandidates(page);

console.log(`\nfound ${candidates.length} candidates after filters\n`);
for (const [i, c] of candidates.slice(0, 15).entries()) {
  console.log(`[${i + 1}] @${c.author}  replies=${c.replyCount}  age=${c.ageHours?.toFixed(1) ?? "?"}h`);
  console.log(`    ${c.text.replace(/\n/g, " ").slice(0, 200)}`);
  console.log(`    ${c.url}`);
  console.log("");
}

await ctx.close();
