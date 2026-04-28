import "dotenv/config";
import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";

const PROMPT = "Reply with exactly: ok";

async function testGemini() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { provider: "gemini", ok: false, error: "missing GEMINI_API_KEY" };
  try {
    const ai = new GoogleGenAI({ apiKey: key });
    const res = await ai.models.generateContent({
      model: "gemini-2.5-pro",
      contents: PROMPT,
    });
    return { provider: "gemini", ok: true, text: res.text?.trim() };
  } catch (e: any) {
    return { provider: "gemini", ok: false, error: e.message ?? String(e) };
  }
}

async function testOpenAI() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return { provider: "openai", ok: false, error: "missing OPENAI_API_KEY" };
  try {
    const client = new OpenAI({ apiKey: key });
    const res = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: PROMPT }],
    });
    return { provider: "openai", ok: true, text: res.choices[0]?.message?.content?.trim() };
  } catch (e: any) {
    return { provider: "openai", ok: false, error: e.message ?? String(e) };
  }
}

async function testOpenRouter() {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return { provider: "openrouter", ok: false, error: "missing OPENROUTER_API_KEY" };
  try {
    const client = new OpenAI({
      apiKey: key,
      baseURL: "https://openrouter.ai/api/v1",
    });
    const res = await client.chat.completions.create({
      model: "openai/gpt-4o-mini",
      messages: [{ role: "user", content: PROMPT }],
    });
    return { provider: "openrouter", ok: true, text: res.choices[0]?.message?.content?.trim() };
  } catch (e: any) {
    return { provider: "openrouter", ok: false, error: e.message ?? String(e) };
  }
}

const results = await Promise.all([testGemini(), testOpenAI(), testOpenRouter()]);
for (const r of results) {
  if (r.ok) {
    console.log(`[${r.provider}] OK -> ${r.text}`);
  } else {
    console.log(`[${r.provider}] FAIL -> ${r.error}`);
  }
}
const failed = results.filter((r) => !r.ok).length;
process.exit(failed > 0 ? 1 : 0);
