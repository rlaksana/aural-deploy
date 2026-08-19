/**
 * AI generation routes are more expensive (paid provider calls). Apply a
 * tighter per-user ceiling than the project-wide default.
 */
const windowMs = 60_000;
const maxRequests = 10;
const aiHits = new Map<string, { count: number; resetAt: number }>();

setInterval(() => {
  const now = Date.now();
  aiHits.forEach((entry, key) => {
    if (entry.resetAt <= now) aiHits.delete(key);
  });
}, 60_000).unref();

export function checkAiRateLimit(identifier: string): Response | null {
  const now = Date.now();
  let entry = aiHits.get(identifier);
  if (!entry || entry.resetAt <= now) {
    entry = { count: 1, resetAt: now + windowMs };
    aiHits.set(identifier, entry);
    return null;
  }
  entry.count++;
  if (entry.count > maxRequests) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    return new Response(
      JSON.stringify({
        error: {
          code: "RATE_LIMITED",
          message: `Too many AI requests. Retry after ${retryAfter}s.`,
          retry_after: retryAfter,
        },
      }),
      {
        status: 429,
        headers: {
          "Retry-After": String(retryAfter),
          "X-RateLimit-Limit": String(maxRequests),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(Math.ceil(entry.resetAt / 1000)),
        },
      },
    );
  }
  return null;
}