import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";

const DATA_DIR = "./data";
const SEEN_FILE = `${DATA_DIR}/seen.json`;
const QUOTA_FILE = `${DATA_DIR}/quota.json`;
const POSTED_FILE = `${DATA_DIR}/posted.json`;

mkdirSync(DATA_DIR, { recursive: true });

type Seen = { tweetIds: string[] };
type Quota = { date: string; count: number };
type PostedEntry = {
  tweetId: string;
  author: string;
  tweetText: string;
  replyText: string;
  postedAt: string;
};

function readJson<T>(path: string, fallback: T): T {
  if (!existsSync(path)) return fallback;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return fallback;
  }
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, JSON.stringify(value, null, 2));
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export function isSeen(tweetId: string): boolean {
  const seen = readJson<Seen>(SEEN_FILE, { tweetIds: [] });
  return seen.tweetIds.includes(tweetId);
}

export function markSeen(tweetId: string): void {
  const seen = readJson<Seen>(SEEN_FILE, { tweetIds: [] });
  if (!seen.tweetIds.includes(tweetId)) {
    seen.tweetIds.push(tweetId);
    if (seen.tweetIds.length > 5_000) seen.tweetIds.splice(0, seen.tweetIds.length - 5_000);
    writeJson(SEEN_FILE, seen);
  }
}

export function getTodayCount(): number {
  const q = readJson<Quota>(QUOTA_FILE, { date: todayStr(), count: 0 });
  if (q.date !== todayStr()) return 0;
  return q.count;
}

export function incrementTodayCount(): number {
  const today = todayStr();
  const q = readJson<Quota>(QUOTA_FILE, { date: today, count: 0 });
  const next: Quota = q.date === today ? { date: today, count: q.count + 1 } : { date: today, count: 1 };
  writeJson(QUOTA_FILE, next);
  return next.count;
}

export function logPosted(entry: PostedEntry): void {
  const log = readJson<PostedEntry[]>(POSTED_FILE, []);
  log.push(entry);
  writeJson(POSTED_FILE, log);
}

export function getRecentReplyTexts(n: number): string[] {
  const log = readJson<PostedEntry[]>(POSTED_FILE, []);
  return log.slice(-n).map((e) => e.replyText).reverse();
}
