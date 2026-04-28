import "dotenv/config";
import OpenAI from "openai";
import type { Candidate } from "../playwright/discover.ts";

export type RankedCandidate = Candidate & { score: number; reason: string };

const RANK_PROMPT = `You are scoring tweets for a reply bot. Suresh is a CS undergrad in Pakistan. He works on AI automation (wiring LLMs into pipelines), has done model evaluation / rubric work, is building a low-resource-language voice agent, and has scholarship experience. His reply should sound specific and grounded in those lanes.

Score each tweet 0-10 on how well he can write a NON-GENERIC, specific reply without fabricating credentials.

In-lane topics (treat as score 7+ unless the tweet has zero substance):
- LLM research papers, arXiv announcements, eval benchmarks, ablation studies
- Model releases and updates (GPT, Claude, Gemini, Qwen, Kimi, Minimax, DeepSeek, Hunyuan, GLM/z.ai, Llama, Mistral, Yi, etc.)
- Prompt engineering, RAG, fine-tuning, RLHF/RLVR/DPO, distillation, quantization
- Inference infra (vLLM, sglang, TensorRT, KV cache, prefix caching, GPU serving)
- AI agents and agent frameworks (OpenClaw, n8n, LangGraph, sandboxes, tool-use, MCP)
- Multilingual / low-resource NLP, voice agents, ASR/TTS
- Data work (ETL, dashboards, evals datasets, annotation, rubrics)
- AI conferences (NeurIPS, ICLR, ICML, ACL, EMNLP, NLP2026)
- Scholarships, CSC process, study abroad, Pakistani student life

Recognized AI proper nouns (Qwen, Kimi, OpenClaw, Minimax, z.ai, RLVR, vLLM, etc.) are NOT a downgrade signal — they're the lane. Don't penalize a tweet just because it names a specific model or paper.

Rubric:
- 9-10: in-lane AND the tweet has a concrete hook (a number, a claim, a method, a release detail) Suresh can engage with
- 7-8: in-lane and discussable, even if it's a thread fragment or assumes context — as long as a knowledgeable reader can react
- 5-6: adjacent (general SWE, dev tooling, data) with a concrete claim he can push back on or add a detail to
- 3-4: vague or pure announcement with nothing specific to anchor on
- 0-2: out of lane (sports, crypto price, celebrity, politics, religion, hustle-bro, personal finance, generic life advice)

Return ONLY a JSON array, one object per input, in the same order:
[{"i": 0, "score": 7, "reason": "3-5 word why"}, ...]

No prose, no markdown, no code fences.

Tweets:
{TWEETS}`;

function buildTweetList(candidates: Candidate[]): string {
  return candidates
    .map((c, i) => {
      const text = c.text.replace(/\s+/g, " ").slice(0, 240);
      return `[${i}] @${c.author}: ${text}`;
    })
    .join("\n");
}

type RawRank = { i: number; score: number; reason: string };

function parseRanks(raw: string): RawRank[] {
  let s = raw.trim();
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/```$/i, "").trim();
  const start = s.indexOf("[");
  const end = s.lastIndexOf("]");
  if (start < 0 || end < 0) throw new Error("no JSON array in rank output");
  const parsed = JSON.parse(s.slice(start, end + 1));
  if (!Array.isArray(parsed)) throw new Error("rank output is not an array");
  return parsed.map((x: any) => ({
    i: Number(x.i),
    score: Number(x.score),
    reason: String(x.reason ?? ""),
  }));
}

export async function rankCandidates(
  candidates: Candidate[],
): Promise<RankedCandidate[]> {
  if (candidates.length === 0) return [];

  const openaiKey = process.env.OPENAI_API_KEY;
  const prompt = RANK_PROMPT.replace("{TWEETS}", buildTweetList(candidates));

  let rawText = "";
  if (openaiKey) {
    try {
      const client = new OpenAI({ apiKey: openaiKey });
      const res = await client.chat.completions.create({
        model: "gpt-5.5",
        messages: [{ role: "user", content: prompt }],
      });
      rawText = res.choices[0]?.message?.content ?? "";
    } catch (e) {
      console.warn(`[rank] gpt-5.5 failed: ${(e as Error).message}`);
    }
  }

  if (!rawText) {
    console.warn("[rank] no provider available, falling back to neutral score");
    return candidates.map((c) => ({ ...c, score: 5, reason: "no ranker available" }));
  }

  let parsed: RawRank[];
  try {
    parsed = parseRanks(rawText);
  } catch (e) {
    console.warn(`[rank] parse failed: ${(e as Error).message}. raw: ${rawText.slice(0, 200)}`);
    return candidates.map((c) => ({ ...c, score: 5, reason: "parse failed" }));
  }

  const byIndex = new Map(parsed.map((p) => [p.i, p]));
  return candidates.map((c, i) => {
    const p = byIndex.get(i);
    return {
      ...c,
      score: p ? Math.max(0, Math.min(10, p.score)) : 0,
      reason: p?.reason ?? "missing from rank output",
    };
  });
}
