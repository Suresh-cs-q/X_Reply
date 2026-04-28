import "dotenv/config";
import OpenAI from "openai";
import { GoogleGenAI } from "@google/genai";

const HUMANIZE_PROMPT = `You are a final-pass editor on a short X reply. Your job: strip any residual AI tells while keeping the substance and a specific anchor to the tweet.

ORIGINAL TWEET being replied to:
"""
{TWEET}
"""

DRAFT REPLY:
"""
{DRAFT}
"""

Work in two silent steps. Do NOT output the steps — only the final reply text.

STEP 1 — silent audit. Ask: "what makes the draft sound AI generated?" Check for:

A. Twitter-reply-specific tells (these are the #1 failure mode on short replies):
   - Quoted phrase + micro-reaction: '"X" is the rough part', '"X" part, yeah'
   - "yeah" / "huh" tacked on for fake casualness
   - "usually" + vivid metaphor ("the weirder bottleneck", "a long tease")
   - Authority move: "most [of my/the/what I see] X is Y"
   - Performative humility openers: "honestly", "genuinely", "really", "interesting", "curious"
   - Dry-opinion posturing with no content behind it

A2. SKELETON-LEVEL tells (these are templates, not just words — the bot leans on them every reply):
   - Praise-then-counter: "X is nice, Y is [the problem/headache/where it breaks]" / "X is easy, Y is the headache"
   - Number-then-question: "[N units] is [adjective]. <question>" (e.g., "4000 in a day is wild. what was the false close rate")
   - "the X part is the [thing]" / "the X is the part i'd want to [verb]"
   - Soft-concession-then-doubt: "[positive frame], [doubt or counter]" with comma or period as the pivot
   - Always-ending-with-a-question-mark when the post wasn't asking
   If the draft uses any of these skeletons, REWRITE the shape — don't just swap words. Use a flat observation, a single anecdote, a one-clause reaction with no question, or an honest half-thought.

B. Content patterns (Wikipedia "Signs of AI writing"):
   - Significance inflation: "testament", "pivotal", "key moment", "evolving landscape", "reflects broader"
   - Promotional: "vibrant", "rich", "profound", "groundbreaking", "nestled", "stunning", "renowned", "breathtaking", "showcase", "exemplifies"
   - Superficial -ing tails: "highlighting X", "underscoring Y", "emphasizing Z", "reflecting W", "contributing to", "fostering", "ensuring", "symbolizing"
   - Vague attribution: "industry observers", "experts argue", "some say" (without a real source)

C. Language patterns:
   - Inflated vocab: crucial, robust, seamless, intricate, leverage, harness, navigate (metaphorical), realm, landscape, tapestry, delve, myriad, plethora, paradigm, resonate, streamline, underscore, foster, align with, additionally
   - Copula dodge: "serves as", "stands as", "marks", "represents", "functions as", "boasts", "features"
   - Negative parallelism: "not just X, but Y", "not only A, also B"
   - Tailing negation: "..., no guessing", "..., no wasted motion"
   - Rule of three with a padded third item
   - False range: "from X to Y" when X and Y aren't a real scale
   - Synonym cycling (three different words for the same thing)

D. Style / filler:
   - Em dash, exclamation, emoji, hashtag, @-mention, curly quote
   - Filler: "in order to", "at this point in time", "due to the fact that", "has the ability to", "it is important to note"
   - Excessive hedging: "could potentially", "might possibly", "it could be argued"
   - Authority tropes: "the real question is", "at its core", "fundamentally", "the deeper issue"
   - Signposting: "let's dive in", "here's what you need to know"
   - Sycophantic: "great point", "love this", "well said", "100%", "facts", "based"
   - Chatbot artifacts: "hope this helps", "let me know", "certainly"

STEP 2 — silent rewrite. If the audit found anything, rewrite once. Keep the original angle (question / counter-point / adjacent observation). Do NOT introduce new tells to replace the old ones. A real person references an idea, not the exact phrase the author used.

OUTPUT RULES:
- The final reply must still anchor on a specific detail or claim from the tweet (don't quote it verbatim)
- 3 to 20 words, lowercase-leaning, plain English, "is" / "are" over fancy copulas
- No em dashes, emojis, @-mentions, hashtags, exclamation marks, curly quotes
- If the draft has no tells, return it UNCHANGED
- If stripping tells leaves nothing real to say, output SKIP

Output ONLY the final reply text, or the single word SKIP. No audit, no labels, no quotes, no explanation.`;

function clean(s: string): string {
  return s
    .trim()
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/—/g, ",")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .trim();
}

export type HumanizeResult = { provider: string; text: string; changed: boolean };

export async function humanizeReply(
  draft: string,
  tweetText: string,
): Promise<HumanizeResult> {
  const prompt = HUMANIZE_PROMPT.replace("{DRAFT}", draft).replace("{TWEET}", tweetText);

  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey) {
    try {
      const client = new OpenAI({ apiKey: openaiKey });
      const res = await client.chat.completions.create({
        model: "gpt-5.5",
        messages: [{ role: "user", content: prompt }],
      });
      const text = clean(res.choices[0]?.message?.content ?? "");
      if (text) {
        return {
          provider: "openai:gpt-5.5",
          text,
          changed: text.trim() !== draft.trim(),
        };
      }
    } catch (e) {
      console.warn(`[humanize] gpt-5.5 failed, falling back to gemini: ${(e as Error).message}`);
    }
  }

  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey) {
    try {
      const ai = new GoogleGenAI({ apiKey: geminiKey });
      const res = await ai.models.generateContent({
        model: "gemini-2.5-pro",
        contents: prompt,
      });
      const text = clean(res.text ?? "");
      if (text) {
        return {
          provider: "gemini",
          text,
          changed: text.trim() !== draft.trim(),
        };
      }
    } catch (e) {
      console.warn(`[humanize] gemini failed: ${(e as Error).message}`);
    }
  }

  return { provider: "none", text: draft, changed: false };
}
