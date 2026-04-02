import type { NextRequest } from "next/server";

type RateLimitOptions = {
  key: string;
  limit: number;
  windowMs: number;
};

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

const globalStore = globalThis as typeof globalThis & {
  __dropRateLimitStore__?: Map<string, RateLimitBucket>;
};

const store = globalStore.__dropRateLimitStore__ ?? new Map<string, RateLimitBucket>();
globalStore.__dropRateLimitStore__ = store;

const getClientIp = (request: NextRequest) =>
  request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
  request.headers.get("x-real-ip") ||
  "unknown";

export const enforceRateLimit = (
  request: NextRequest,
  options: RateLimitOptions,
) => {
  const ip = getClientIp(request);
  const now = Date.now();
  const bucketKey = `${options.key}:${ip}`;
  const current = store.get(bucketKey);

  if (!current || current.resetAt <= now) {
    store.set(bucketKey, {
      count: 1,
      resetAt: now + options.windowMs,
    });
    return;
  }

  if (current.count >= options.limit) {
    const error = new Error("Too many requests. Please slow down.") as Error & {
      status?: number;
    };
    error.status = 429;
    throw error;
  }

  current.count += 1;
  store.set(bucketKey, current);
};
