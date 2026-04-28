# X Reply Bot

Autonomous X (Twitter) reply bot. Posts to a single X account on a randomized ~10-minute cron via Playwright + a local Chrome session. LLM (GPT-5.5 via OpenAI direct, Gemini 2.5 Pro fallback) ranks candidates, writes a draft, and runs a humanize/safety pass before posting.

**Risk acknowledged**: browser automation violates X ToS. Account is treated as disposable.

---

## Stack

- **Runtime**: Trigger.dev v3 (dev mode — runs on laptop, not cloud)
- **Process supervisor**: pm2 (auto-restart, persists across reboots via LaunchAgent)
- **Automation**: Playwright + real Chrome (channel: 'chrome', non-headless, persistent profile in `playwright-session/`). Each launch CDP-minimizes the window so it docks immediately after a brief flash and does not steal foreground focus.
- **LLM**: `gpt-5.5` via OpenAI direct (primary) → Gemini 2.5 Pro (fallback). Used at three steps: rank, draft, humanize.
- **State**: local JSON files (`data/seen.json`, `data/quota.json`, `data/posted.json`) — no DB
- **Discovery source**: user's X home timeline (no target list configured)
- **Language**: TypeScript

---

## Where it runs

The bot runs **on Suresh's MacBook**, not the cloud. The autonomy chain:

1. **Trigger.dev cloud** dispatches the `reply-tick` cron every 10 min UTC to the local worker
2. **pm2** (`/opt/homebrew/bin/pm2`) keeps `npx trigger.dev@latest dev --profile xreply` alive forever, auto-restarts on crash. Config: `ecosystem.config.cjs`
3. **LaunchAgent** at `~/Library/LaunchAgents/com.suresh.x-reply-bot.plist` runs `pm2 resurrect` on user login → bot auto-starts after every reboot
4. **`sudo pmset -c sleep 0`** prevents sleep on AC power
5. **Amphetamine app** (App Store) prevents lid-close sleep when on AC

If any link breaks, the bot stops posting.

---

## Trigger.dev project

- Project: `proj_xntuspxcqkgbblizsxdl` (new account, moved from old `proj_nrmkijalnyzgkohlerdq` on 2026-04-19 to escape free-tier contention)
- CLI profile: `xreply` (always pass `--profile xreply`) — isolated from the `linkedin` profile used by other bots
- Dashboard: https://cloud.trigger.dev/projects/v3/proj_xntuspxcqkgbblizsxdl

---

## Pipeline

`src/pipeline/run.ts → runOnce()`:

1. **Quota check**: skip if `data/quota.json` count ≥ `dailyCap` (currently 250)
2. **Discover** (`src/playwright/discover.ts`): scroll home timeline, collect candidates, filter (≥10 words, ≤500 replies, ≤24h old, no hard-no keywords (word-boundary match), no ads)
3. **Dedup**: drop any tweetId already in `data/seen.json`
4. **Rank** (`src/llm/rank.ts`): score each remaining candidate 0–10 with the LLM. Sort desc. Skip if top score < `minScore` (currently 6); markSeen all candidates that fell below the threshold so we don't re-rank them
5. **Fetch tweet context** (`src/playwright/context.ts`): on the picked tweet's page, scrape parent tweet (if reply), quoted tweet (if QT), and author bio
6. **Draft** (`src/llm/draft.ts`): persona prompt + thread context + last 5 reply skeletons-to-avoid → LLM. Output may be the literal token `SKIP` (out of lane / no anchor) — if so, markSeen and skip
7. **Humanize** (`src/llm/humanize.ts`): final-pass editor LLM strips residual AI tells; may return draft unchanged, rewritten, or `SKIP`
8. **Sanity-check final reply** (1–25 words, ≤280 chars)
9. **Post** (`src/playwright/post.ts`): navigate → click reply box → type with human-like delay → submit → wait for the textarea to clear or detach (real success signal). On post failure, do NOT markSeen — let the candidate retry next cycle
10. **Log**: append to `data/posted.json`, markSeen, increment quota

---

## Cron schedule

`src/trigger/reply-tick.ts`:
- Self-scheduling task, no cron. Each run finishes by calling `replyTick.trigger(..., { delay })` on itself with a random delay in [1 min, 9 min]. Delayed runs sit in the Trigger.dev queue and consume no compute while waiting.
- Net effect: real gap between posts is uniformly random in [1 min, 9 min]. Task fires ~150 times/day instead of 1,440 — saves CPU wake-bursts on the laptop.
- Task has `queue: { concurrencyLimit: 1 }` — only one run executes at a time. Prevents the persistent Chrome profile-lock collision when chains overlap (the "second tab blinks" symptom).
- Reschedule call is wrapped in retry-with-backoff (3 attempts, 1s/4s waits). On total failure, logs `CHAIN DIED` loudly so you know to re-kick.
- Bootstrap: the chain does not self-start. After first deploy (or if the loop ever dies), trigger the task manually once from the Trigger.dev dashboard to kick it off. **Do NOT manually trigger while a chain is already alive** — every manual trigger spawns a separate self-scheduling chain that runs forever in parallel. If you need to test, cancel the existing delayed run first (dashboard or `mcp__trigger__cancel_run`).
- Daily cap: 250

---

## Persona (lives in `src/llm/draft.ts`)

Voice: short, lowercase-leaning, specific, dry. Hard rules baked into prompt:
- 3–18 words typically, hard max 22
- No em-dash, no exclamation marks, no hashtags, no emojis, no @-mentions, no links
- No fluff/intro phrases ("Great point", "I think", "Honestly")
- No marketing tone, no generic praise
- Avoid politics, religion, profanity, controversy
- Out-of-lane posts → LLM outputs `SKIP` and pipeline drops the candidate

Hard-no keyword filter in `src/playwright/discover.ts` drops candidate tweets containing politics, religion, profanity, etc.

---

## Operating commands

```bash
pm2 status                       # is the bot alive?
pm2 logs x-reply-bot             # live logs
pm2 restart x-reply-bot          # force restart (pick up code changes)
pm2 stop x-reply-bot             # pause the bot
pm2 start x-reply-bot            # resume

cat data/posted.json             # every reply ever posted
cat data/quota.json              # today's post count
cat data/seen.json               # all tweet IDs seen (dedup state)

npm run discover                 # one-shot: print candidate tweets, no posting
npm run draft -- "<tweet-url>"   # one-shot: scrape tweet, generate 3 draft replies
npm run dry                      # one-shot: full pipeline but skip posting
npm run run                      # one-shot: full pipeline including posting
npm run reply -- "<url>" "<txt>" # post a specific reply to a specific tweet
npm run bootstrap                # re-login to X (when session expires)
npm run verify                   # check saved session still works
```

---

## When the bot will / won't work

### ✅ Works
- VS Code closed
- Terminal closed
- Display asleep
- Lid closed (if AC power + Amphetamine on)
- Laptop reboot (LaunchAgent + pm2 resurrect)
- Brief wifi outage (cron retries)

### ❌ Stops working
- Laptop powered off (until next login)
- Wifi off / no internet (cron can't dispatch, posts can't reach X)
- On battery for too long (eventually battery dies → laptop sleeps)
- Lid closed without Amphetamine (macOS forces sleep)
- Trigger.dev cloud outage
- X session cookies expire → re-run `npm run bootstrap`
- X bans the account → bot keeps trying but posts fail silently

---

## Project structure

```
x-reply-bot/
  CLAUDE.md                          ← this file
  .env / .env.example                ← API keys + Trigger.dev credentials
  ecosystem.config.cjs               ← pm2 config
  trigger.config.ts                  ← Trigger.dev config (project ref, build extensions)
  package.json
  tsconfig.json
  src/
    db/store.ts                      ← JSON-file dedup, quota, posted-log
    llm/
      rank.ts                        ← LLM scores candidates 0–10
      draft.ts                       ← persona prompt + LLM router (GPT-5.5 → Gemini)
      humanize.ts                    ← final-pass editor strips AI tells
    playwright/
      session.ts                     ← Chrome launcher with stealth flags
      discover.ts                    ← scrape home timeline → candidates
      context.ts                     ← scrape parent / quoted / author bio
      post.ts                        ← navigate → type → submit → verify clear
    pipeline/run.ts                  ← orchestration: discover → dedup → rank → context → draft → humanize → post → log
    trigger/reply-tick.ts            ← self-scheduling task with random jitter and reschedule retry
    smoke/{llm,browser}.ts           ← Phase-0 smoke tests
  scripts/                           ← one-shot operator scripts (bootstrap, verify, draft, discover, run, post-reply)
  playwright-session/                ← Chrome user data dir (gitignored — has X login cookies)
  data/                              ← runtime state (gitignored)
```

---

## Known gaps / future work

- **Cloud deploy not done.** Currently runs on the laptop. Real cloud deploy would need: switch to bundled Chromium + `playwright-extra` stealth plugin, store `playwright-session/` in remote storage, download/upload on each run.
- **No engagement tracking.** No shadowban detection, no "are our replies getting likes" check.
- **No wake-hour window.** Cron fires 24/7. Original plan had a 14-hour waking window; not implemented.
- **Hard-no keyword filter is small.** Add more if posts to bad topics slip through.
- **`posted.json` grows unbounded** — full-file rewrite per post. Fine at current scale (~600 KB); will need NDJSON/rotation past 10 MB.

---

## Working style (rules for Claude)

These guidelines bias toward caution over speed. For trivial tasks, use judgment.

### 1. Think Before Coding

Don't assume. Don't hide confusion. Surface tradeoffs.

Before implementing:

- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### 2. Simplicity First

Minimum code that solves the problem. Nothing speculative.

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

### 3. Surgical Changes

Touch only what you must. Clean up only your own mess.

When editing existing code:

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it — don't delete it.

When your changes create orphans:

- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: every changed line should trace directly to the user's request.

### 4. Goal-Driven Execution

Define success criteria. Loop until verified.

Transform tasks into verifiable goals:

- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:

```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.
