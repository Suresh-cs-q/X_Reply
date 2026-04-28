import { runOnce } from "../src/pipeline/run.ts";

const dryRun = process.argv.includes("--dry");
const cap = Number(process.env.DAILY_CAP ?? "5");

console.log(`[run] dryRun=${dryRun} dailyCap=${cap}`);
const outcome = await runOnce({ dryRun, dailyCap: cap });
console.log("\n[run] outcome:");
console.log(JSON.stringify(outcome, null, 2));
process.exit(outcome.status === "errored" ? 1 : 0);
