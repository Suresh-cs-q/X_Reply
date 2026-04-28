# x-reply-bot

Autonomous X (Twitter) reply bot. Posts to a single X account on a randomized 1–9 minute cadence via Playwright + a local Chrome session. An LLM ranks candidate tweets from your home timeline, drafts a reply in a defined persona, and runs a humanize pass to strip AI tells before posting.

> **Risk acknowledged.** Browser automation violates X's Terms of Service. Treat the account this drives as disposable. This is personal automation — not a product. No support, no warranty.

## Stack

- **Runtime:** [Trigger.dev](https://trigger.dev) v4 (dev mode — runs locally on your machine, not their cloud)
- **Process supervisor:** pm2
- **Browser:** Playwright + real Chrome (channel `chrome`, persistent profile, non-headless, CDP-minimized after launch)
- **LLM:** OpenAI `gpt-5.5` (primary) → Gemini 2.5 Pro (fallback)
- **State:** flat JSON files in `data/` (no DB)
- **Language:** TypeScript

See [CLAUDE.md](./CLAUDE.md) for full architectural detail — pipeline steps, persona rules, operational gotchas.

## Setup

### 1. Prerequisites

- Node.js 20+
- [Google Chrome](https://www.google.com/chrome/) installed system-wide (the bot uses Playwright's `channel: "chrome"`, not a bundled Chromium)
- A Trigger.dev account and project

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment

```bash
cp .env.example .env
```

Then fill in `.env`:

- `TRIGGER_PROJECT_REF`, `TRIGGER_SECRET_KEY` — from your own Trigger.dev project dashboard
- `OPENAI_API_KEY` — required (primary LLM)
- `GEMINI_API_KEY` — fallback LLM, recommended

Also update [trigger.config.ts](./trigger.config.ts) — replace the `project` field with your own Trigger.dev project ref.

### 4. Bootstrap the X session

This logs you into X once and saves the cookies into `playwright-session/` for the bot to reuse.

```bash
npm run bootstrap
```

A real Chrome window will open. Log in manually, handle 2FA / captcha, navigate to your home timeline, then tell the script "I'm logged in" so it closes cleanly.

### 5. Verify the saved session

```bash
npm run verify
```

Should print `Logged in? : YES`.

## Persona

The bot writes as a specific persona defined in [src/llm/draft.ts](./src/llm/draft.ts). The prompt names specific lanes ("AI automation", "model evaluation", "voice agents", "scholarships") and grounds replies in a named individual's experience.

**If you fork this, rewrite the persona in `src/llm/draft.ts` to match your own background.** The same applies to [src/llm/rank.ts](./src/llm/rank.ts), where the lane definitions also hardcode personal context. Otherwise the bot will reference experiences that aren't yours and replies will read as fake.

## Running

### One-shot scripts (useful for tuning, no autonomous posting)

```bash
npm run discover                   # print candidate tweets from your timeline, no posting
npm run draft -- "<tweet-url>"     # generate 3 draft replies for a specific tweet
npm run dry                        # full pipeline but skip the actual post
npm run run                        # full pipeline including post
npm run reply -- "<url>" "<text>"  # post a specific reply directly to a specific tweet
```

### Autonomous mode via pm2

```bash
pm2 start ecosystem.config.cjs
pm2 logs x-reply-bot
pm2 restart x-reply-bot
pm2 stop x-reply-bot
```

The first time after deployment you must manually trigger the `reply-tick` task once from the Trigger.dev dashboard to start the chain. After that, each run schedules its own next run with random jitter. **Don't manually trigger again while a chain is alive** — every manual trigger spawns a separate self-scheduling chain that runs in parallel forever. See CLAUDE.md "Cron schedule" for full details.

## Pipeline

```
discover (home timeline scrape)
  → dedup (drop tweets already replied to)
  → rank (LLM scores 0–10, skip if top < 6)
  → fetch context (parent / quoted tweet / author bio)
  → draft (persona prompt + thread context → LLM)
  → humanize (final-pass editor strips AI tells)
  → sanity check (1–25 words, ≤280 chars)
  → post (Playwright types + submits + verifies textarea cleared)
  → log (append to data/posted.json, mark seen, increment quota)
```

## Project structure

```
src/
  db/store.ts             flat-file dedup, quota, posted log
  llm/
    rank.ts               LLM scores candidates 0–10
    draft.ts              persona prompt + LLM router
    humanize.ts           final-pass editor strips AI tells
  playwright/
    session.ts            Chrome launcher (stealth flags, CDP minimize)
    discover.ts           home-timeline scrape → candidates
    context.ts            scrape parent / quoted / author bio
    post.ts               navigate → type → submit → verify clear
  pipeline/run.ts         orchestration
  trigger/reply-tick.ts   self-scheduling Trigger.dev task
  smoke/                  manual smoke tests (LLM connectivity, browser launch)
scripts/                  one-shot operator scripts
trigger.config.ts         Trigger.dev project + build config
ecosystem.config.cjs      pm2 process config
```

## Known limitations

- **No automated tests.** Smoke tests in `src/smoke/` are manual scripts. Changes are verified by tailing pm2 logs in production.
- **No engagement tracking.** Bot has no idea whether its replies are getting likes, replies, or shadowbanned.
- **No wake-hour window.** The chain fires 24/7.
- **`data/posted.json` grows unbounded** — full-file rewrite per post. Fine at small scale; would need NDJSON conversion past ~10 MB.
- **Hard-no keyword filter is small.** Topic guardrails are minimal; tune [src/playwright/discover.ts](./src/playwright/discover.ts) if posts to bad topics slip through.
- **Cloud deploy not implemented.** The bot only runs locally because it relies on real Chrome with a persistent profile. A cloud deploy would need bundled Chromium + a stealth plugin + remote profile storage.
