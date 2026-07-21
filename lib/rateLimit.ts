/**
 * Tiny in-memory per-IP sliding-window rate limiter. 10 requests / IP / hour by
 * default — enough to blunt casual abuse of the public subscribe endpoint. State
 * lives in the warm serverless instance and resets on cold start, which is fine
 * for this purpose (no shared store needed).
 */
const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_WINDOW = 10;

const hits = new Map<string, number[]>();

export function rateLimited(ip: string, now = Date.now()): boolean {
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_PER_WINDOW) {
    hits.set(ip, recent);
    return true;
  }
  recent.push(now);
  hits.set(ip, recent);
  return false;
}

export function clientIp(headers: Record<string, string | string[] | undefined>): string {
  const fwd = headers["x-forwarded-for"];
  const raw = Array.isArray(fwd) ? fwd[0] : fwd;
  if (raw) return raw.split(",")[0]!.trim();
  const real = headers["x-real-ip"];
  const realStr = Array.isArray(real) ? real[0] : real;
  return realStr?.trim() || "unknown";
}
