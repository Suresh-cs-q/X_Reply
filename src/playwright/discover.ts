import type { Page } from "playwright";

export type Candidate = {
  tweetId: string;
  author: string;
  text: string;
  replyCount: number;
  ageHours: number | null;
  url: string;
};

const HARD_NO_KEYWORDS = [
  "trump", "biden", "election", "vote", "republican", "democrat",
  "israel", "palestine", "gaza", "ukraine", "russia",
  "abortion", "lgbtq", "trans",
  "covid", "vaccine",
  "crypto pump", "shitcoin", "nft drop",
  "onlyfans", "porn",
  "fuck", "shit", "bitch", "asshole",
];

const HARD_NO_PATTERNS = HARD_NO_KEYWORDS.map(
  (kw) => new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i"),
);

function parseCount(s: string | null): number {
  if (!s) return 0;
  const m = s.match(/([\d.,]+)\s*([KkMm])?/);
  if (!m) return 0;
  const n = parseFloat(m[1].replace(/,/g, ""));
  const suffix = (m[2] ?? "").toLowerCase();
  if (suffix === "k") return Math.round(n * 1_000);
  if (suffix === "m") return Math.round(n * 1_000_000);
  return Math.round(n);
}

function ageHoursFromIso(iso: string | null): number | null {
  if (!iso) return null;
  const d = Date.parse(iso);
  if (Number.isNaN(d)) return null;
  return (Date.now() - d) / 3_600_000;
}

async function gotoHome(page: Page) {
  try {
    await page.goto("https://x.com/home", { waitUntil: "domcontentloaded", timeout: 60_000 });
    return;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[discover] first goto x.com/home failed: ${msg} — retrying in 10s`);
    await page.waitForTimeout(10_000);
    await page.goto("https://x.com/home", { waitUntil: "domcontentloaded", timeout: 60_000 });
  }
}

export async function discoverCandidates(page: Page, opts: { maxScrolls?: number; minWords?: number; maxReplies?: number; maxAgeHours?: number } = {}): Promise<Candidate[]> {
  const maxScrolls = opts.maxScrolls ?? 4;
  const minWords = opts.minWords ?? 10;
  const maxReplies = opts.maxReplies ?? 500;
  const maxAgeHours = opts.maxAgeHours ?? 24;

  await gotoHome(page);
  await page.waitForTimeout(4_000);

  for (let i = 0; i < maxScrolls; i++) {
    await page.mouse.wheel(0, 2_000);
    await page.waitForTimeout(1_500 + Math.random() * 800);
  }

  const raw = await page.$$eval('article[data-testid="tweet"]', (articles) => {
    return articles.map((a) => {
      const link = a.querySelector('a[href*="/status/"]') as HTMLAnchorElement | null;
      const href = link?.getAttribute("href") ?? "";
      const m = href.match(/\/([^/]+)\/status\/(\d+)/);
      const author = m?.[1] ?? "";
      const tweetId = m?.[2] ?? "";
      const text =
        (a.querySelector('[data-testid="tweetText"]') as HTMLElement | null)?.innerText ?? "";
      const replyEl = a.querySelector('[data-testid="reply"]') as HTMLElement | null;
      const replyAria = replyEl?.getAttribute("aria-label") ?? replyEl?.innerText ?? "";
      const time = a.querySelector("time")?.getAttribute("datetime") ?? null;
      const isAd = !!a.querySelector('[data-testid="placementTracking"]');
      return { tweetId, author, text, replyAria, time, isAd };
    });
  });

  const candidates: Candidate[] = [];
  const seenIds = new Set<string>();
  for (const r of raw) {
    if (!r.tweetId || !r.author || !r.text || r.isAd) continue;
    if (seenIds.has(r.tweetId)) continue;
    seenIds.add(r.tweetId);

    const wordCount = r.text.trim().split(/\s+/).length;
    if (wordCount < minWords) continue;

    const replyCount = parseCount(r.replyAria);
    if (replyCount > maxReplies) continue;

    const ageHours = ageHoursFromIso(r.time);
    if (ageHours !== null && ageHours > maxAgeHours) continue;

    if (HARD_NO_PATTERNS.some((re) => re.test(r.text))) continue;

    candidates.push({
      tweetId: r.tweetId,
      author: r.author,
      text: r.text,
      replyCount,
      ageHours,
      url: `https://x.com/${r.author}/status/${r.tweetId}`,
    });
  }

  return candidates;
}
