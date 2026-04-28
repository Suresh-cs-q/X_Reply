import type { Page } from "playwright";

export type PostResult =
  | { ok: true }
  | { ok: false; reason: string };

export async function postReply(
  page: Page,
  tweetUrl: string,
  replyText: string,
): Promise<PostResult> {
  const targetId = tweetUrl.match(/\/status\/(\d+)/)?.[1];
  const currentId = page.url().match(/\/status\/(\d+)/)?.[1];
  if (!targetId || targetId !== currentId) {
    await page.goto(tweetUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForTimeout(3_500 + Math.random() * 1_500);
  }

  const replyBox = page.locator('[data-testid="tweetTextarea_0"]').first();
  try {
    await replyBox.waitFor({ timeout: 12_000 });
  } catch {
    return { ok: false, reason: "reply textbox not found" };
  }

  await replyBox.click();
  await page.waitForTimeout(600 + Math.random() * 600);
  await replyBox.pressSequentially(replyText, { delay: 70 + Math.random() * 70 });
  await page.waitForTimeout(1_500 + Math.random() * 1_000);

  const submitBtn = page.locator('[data-testid="tweetButtonInline"]').first();
  try {
    await submitBtn.waitFor({ state: "visible", timeout: 6_000 });
  } catch {
    return { ok: false, reason: "submit button not visible" };
  }

  await submitBtn.click();

  const posted = await page
    .waitForFunction(
      () => {
        const ta = document.querySelector(
          '[data-testid="tweetTextarea_0"]',
        ) as HTMLElement | null;
        if (!ta) return true;
        return (ta.innerText ?? "").trim().length === 0;
      },
      null,
      { timeout: 10_000 },
    )
    .then(() => true)
    .catch(() => false);

  if (!posted) {
    return { ok: false, reason: "textarea did not clear after submit (post likely failed)" };
  }

  return { ok: true };
}
