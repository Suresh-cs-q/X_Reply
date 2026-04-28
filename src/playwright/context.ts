import type { Page } from "playwright";

type TweetRef = { author: string; text: string };
export type TweetContext = {
  parent?: TweetRef;
  quoted?: TweetRef;
  authorBio?: string;
};

export async function fetchTweetContext(
  page: Page,
  tweetUrl: string,
): Promise<TweetContext> {
  const m = tweetUrl.match(/\/([^/]+)\/status\/(\d+)/);
  if (!m) return {};
  const targetAuthor = m[1];
  const targetId = m[2];

  try {
    await page.goto(tweetUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
  } catch (e) {
    console.warn(`[context] goto failed: ${(e as Error).message}`);
    return {};
  }
  await page.waitForTimeout(2_500 + Math.random() * 1_000);

  let raw: {
    parent: { tweetId: string; author: string; text: string } | null;
    target: { tweetId: string; author: string; text: string; quoted: { author: string; text: string } | null } | null;
  };
  try {
    raw = await page.$$eval(
      'article[data-testid="tweet"]',
      (articles, targetId) => {
        const items = articles.map((a) => {
          const links = Array.from(a.querySelectorAll('a[href*="/status/"]')) as HTMLAnchorElement[];
          const own = links.find((l) => !l.closest('div[role="link"]'));
          const href = (own ?? links[0])?.getAttribute("href") ?? "";
          const mm = href.match(/\/([^/]+)\/status\/(\d+)/);
          const author = mm ? mm[1] : "";
          const tweetId = mm ? mm[2] : "";

          const textEls = Array.from(
            a.querySelectorAll('[data-testid="tweetText"]'),
          ) as HTMLElement[];
          const mainTextEl = textEls.find((t) => !t.closest('div[role="link"]'));
          const text = ((mainTextEl && mainTextEl.innerText) || "").trim();

          const quotedContainer = a.querySelector('div[role="link"][tabindex]') as HTMLElement | null;
          let quoted: { author: string; text: string } | null = null;
          if (quotedContainer) {
            const qTextEl = quotedContainer.querySelector('[data-testid="tweetText"]') as HTMLElement | null;
            const qText = ((qTextEl && qTextEl.innerText) || "").trim();
            const qLink = quotedContainer.querySelector('a[href*="/status/"]') as HTMLAnchorElement | null;
            const qHref = qLink ? (qLink.getAttribute("href") || "") : "";
            const qm = qHref.match(/\/([^/]+)\/status\/(\d+)/);
            const qAuthor = qm ? qm[1] : "";
            if (qText) quoted = { author: qAuthor, text: qText };
          }
          return { tweetId, author, text, quoted };
        });

        const idx = items.findIndex((x) => x.tweetId === targetId);
        const parent = idx > 0 ? items[idx - 1] : null;
        const target = idx >= 0 ? items[idx] : null;
        return { parent, target };
      },
      targetId,
    );
  } catch (e) {
    console.warn(`[context] scrape failed: ${(e as Error).message}`);
    return {};
  }

  const out: TweetContext = {};
  if (raw.parent && raw.parent.text && raw.parent.tweetId !== targetId) {
    out.parent = { author: raw.parent.author, text: raw.parent.text };
  }
  if (raw.target && raw.target.quoted) {
    out.quoted = raw.target.quoted;
  }

  try {
    const bio = await page
      .locator('[data-testid="UserDescription"]')
      .first()
      .innerText({ timeout: 2_000 });
    if (bio) out.authorBio = bio.trim().slice(0, 240);
  } catch {
    // bio is optional
  }

  return out;
}
