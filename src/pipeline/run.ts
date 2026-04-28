import { openContext } from "../playwright/session.ts";
import { discoverCandidates } from "../playwright/discover.ts";
import { fetchTweetContext } from "../playwright/context.ts";
import { postReply } from "../playwright/post.ts";
import { draftReply } from "../llm/draft.ts";
import { humanizeReply } from "../llm/humanize.ts";
import { rankCandidates } from "../llm/rank.ts";
import { isSeen, markSeen, getTodayCount, incrementTodayCount, logPosted } from "../db/store.ts";

export type RunOutcome =
  | { status: "posted"; tweetId: string; author: string; reply: string; quotaToday: number }
  | { status: "skipped"; reason: string }
  | { status: "errored"; reason: string };

export type RunOpts = {
  dailyCap?: number;
  dryRun?: boolean;
  headless?: boolean;
};

const MIN_SCORE = 6;

export async function runOnce(opts: RunOpts = {}): Promise<RunOutcome> {
  const dailyCap = opts.dailyCap ?? 5;
  const dryRun = opts.dryRun ?? false;

  const today = getTodayCount();
  if (today >= dailyCap) {
    return { status: "skipped", reason: `daily cap reached (${today}/${dailyCap})` };
  }

  const ctx = await openContext({ headless: opts.headless });
  try {
    const page = ctx.pages()[0] ?? (await ctx.newPage());
    const candidates = await discoverCandidates(page);
    if (candidates.length === 0) {
      return { status: "skipped", reason: "no candidates from discovery" };
    }

    const fresh = candidates.filter((c) => !isSeen(c.tweetId));
    if (fresh.length === 0) {
      return { status: "skipped", reason: "all candidates already seen" };
    }

    const ranked = await rankCandidates(fresh);
    const sorted = [...ranked].sort((a, b) => b.score - a.score);
    console.log(`[pipeline] ranked ${sorted.length} candidates. top 5:`);
    for (const r of sorted.slice(0, 5)) {
      console.log(`  score=${r.score} @${r.author} :: ${r.reason} :: ${r.text.slice(0, 80)}`);
    }

    const pick = sorted[0];
    if (!pick || pick.score < MIN_SCORE) {
      for (const r of sorted) {
        if (r.score < MIN_SCORE) markSeen(r.tweetId);
      }
      return {
        status: "skipped",
        reason: `no candidate above minScore=${MIN_SCORE} (top=${pick?.score ?? "n/a"})`,
      };
    }

    console.log(`[pipeline] picked @${pick.author} (id=${pick.tweetId}, score=${pick.score})`);
    console.log(`[pipeline] tweet: ${pick.text.slice(0, 200)}`);

    const threadCtx = await fetchTweetContext(page, pick.url);
    if (threadCtx.parent) {
      console.log(`[pipeline] parent: @${threadCtx.parent.author}: ${threadCtx.parent.text.slice(0, 120)}`);
    }
    if (threadCtx.quoted) {
      console.log(`[pipeline] quoted: @${threadCtx.quoted.author}: ${threadCtx.quoted.text.slice(0, 120)}`);
    }

    const draft = await draftReply(pick.text, threadCtx);
    console.log(`[pipeline] draft (${draft.provider}): ${draft.text}`);

    if (draft.text.trim().toUpperCase() === "SKIP") {
      markSeen(pick.tweetId);
      return { status: "skipped", reason: "LLM chose SKIP (out of persona lane)" };
    }

    const humanized = await humanizeReply(draft.text, pick.text);
    console.log(`[pipeline] humanized (${humanized.provider}, changed=${humanized.changed}): ${humanized.text}`);

    if (humanized.text.trim().toUpperCase() === "SKIP") {
      markSeen(pick.tweetId);
      return { status: "skipped", reason: "humanizer chose SKIP (draft had no substance after strip)" };
    }

    const finalText = humanized.text;
    const wordCount = finalText.trim().split(/\s+/).length;
    if (wordCount < 1 || wordCount > 25 || finalText.length > 280) {
      markSeen(pick.tweetId);
      return { status: "skipped", reason: `reply failed sanity (${wordCount} words, ${finalText.length} chars)` };
    }

    if (dryRun) {
      markSeen(pick.tweetId);
      return { status: "skipped", reason: "dry-run (not posted)" };
    }

    const result = await postReply(page, pick.url, finalText);
    if (!result.ok) {
      return { status: "errored", reason: result.reason };
    }

    markSeen(pick.tweetId);
    const quotaToday = incrementTodayCount();
    logPosted({
      tweetId: pick.tweetId,
      author: pick.author,
      tweetText: pick.text,
      replyText: finalText,
      postedAt: new Date().toISOString(),
    });

    return {
      status: "posted",
      tweetId: pick.tweetId,
      author: pick.author,
      reply: finalText,
      quotaToday,
    };
  } finally {
    await ctx.close();
  }
}
