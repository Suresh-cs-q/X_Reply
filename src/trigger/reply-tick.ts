import { task, logger } from "@trigger.dev/sdk";
import { runOnce } from "../pipeline/run.ts";

const MIN_GAP_MIN = 1;
const MAX_GAP_MIN = 9;

export const replyTick = task({
  id: "reply-tick",
  maxDuration: 600,
  queue: {
    concurrencyLimit: 1,
  },
  run: async () => {
    try {
      const outcome = await runOnce({ dailyCap: 250, headless: false });
      logger.info("pipeline outcome", outcome);
      return outcome;
    } finally {
      const minutes = MIN_GAP_MIN + Math.random() * (MAX_GAP_MIN - MIN_GAP_MIN);
      const delayUntil = new Date(Date.now() + minutes * 60_000);

      const BACKOFFS_MS = [1_000, 4_000];
      let scheduled = false;
      let lastError = "";
      for (let attempt = 0; attempt <= BACKOFFS_MS.length; attempt++) {
        try {
          await replyTick.trigger(undefined, { delay: delayUntil });
          scheduled = true;
          break;
        } catch (e) {
          lastError = e instanceof Error ? e.message : String(e);
          if (attempt < BACKOFFS_MS.length) {
            logger.warn("reply-tick: reschedule failed, retrying", {
              attempt: attempt + 1,
              backoffMs: BACKOFFS_MS[attempt],
              error: lastError,
            });
            await new Promise((r) => setTimeout(r, BACKOFFS_MS[attempt]));
          }
        }
      }

      if (scheduled) {
        logger.info("reply-tick: next run scheduled", {
          nextInMinutes: minutes.toFixed(2),
        });
      } else {
        logger.error(
          "reply-tick: reschedule failed after all retries — CHAIN DIED, manual re-kick needed from dashboard",
          { error: lastError },
        );
      }
    }
  },
});
