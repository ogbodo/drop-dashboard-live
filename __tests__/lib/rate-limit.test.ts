/**
 * @jest-environment node
 *
 * rate-limit.ts imports `NextRequest` types only, but the runtime values we
 * pass come from next/server, which needs the Web fetch globals present in the
 * Node test environment (jsdom does not provide them).
 */
import { NextRequest } from "next/server";

import { enforceRateLimit } from "@/lib/rate-limit";

type GlobalWithStore = typeof globalThis & {
  __dropRateLimitStore__?: Map<string, { count: number; resetAt: number }>;
};

const store = () => (globalThis as GlobalWithStore).__dropRateLimitStore__;

const makeRequest = (headers: Record<string, string> = {}) =>
  new NextRequest("https://admin.drop.test/api/x", { headers });

beforeEach(() => {
  // The store lives on globalThis and persists across tests; clear it so each
  // test starts with empty counters.
  store()?.clear();
  jest.restoreAllMocks();
});

describe("enforceRateLimit", () => {
  it("allows the first request under a fresh key (no throw) and seeds the bucket", () => {
    const req = makeRequest({ "x-forwarded-for": "1.1.1.1" });
    expect(() => enforceRateLimit(req, { key: "login", limit: 3, windowMs: 60_000 })).not.toThrow();

    const bucket = store()?.get("login:1.1.1.1");
    expect(bucket?.count).toBe(1);
  });

  it("allows requests up to the limit, then throws a 429 on the (limit+1)-th", () => {
    const req = makeRequest({ "x-forwarded-for": "2.2.2.2" });
    const opts = { key: "login", limit: 3, windowMs: 60_000 };

    // 3 allowed
    enforceRateLimit(req, opts); // count 1
    enforceRateLimit(req, opts); // count 2
    enforceRateLimit(req, opts); // count 3

    // 4th exceeds
    expect(() => enforceRateLimit(req, opts)).toThrow("Too many requests. Please slow down.");
    try {
      enforceRateLimit(req, opts);
    } catch (e) {
      expect((e as { status?: number }).status).toBe(429);
    }
  });

  it("increments the counter on each allowed request", () => {
    const req = makeRequest({ "x-forwarded-for": "3.3.3.3" });
    const opts = { key: "k", limit: 10, windowMs: 60_000 };
    enforceRateLimit(req, opts);
    enforceRateLimit(req, opts);
    enforceRateLimit(req, opts);
    expect(store()?.get("k:3.3.3.3")?.count).toBe(3);
  });

  it("blocks at the limit BEFORE incrementing (count stays at limit when blocked)", () => {
    const req = makeRequest({ "x-forwarded-for": "4.4.4.4" });
    const opts = { key: "k", limit: 2, windowMs: 60_000 };
    enforceRateLimit(req, opts); // 1
    enforceRateLimit(req, opts); // 2 (== limit)
    expect(() => enforceRateLimit(req, opts)).toThrow(); // blocked
    expect(() => enforceRateLimit(req, opts)).toThrow(); // still blocked
    // count is not bumped past the limit by blocked requests
    expect(store()?.get("k:4.4.4.4")?.count).toBe(2);
  });

  it("resets the window once resetAt has passed, allowing requests again", () => {
    const nowSpy = jest.spyOn(Date, "now").mockReturnValue(1_000_000);
    const req = makeRequest({ "x-forwarded-for": "5.5.5.5" });
    const opts = { key: "k", limit: 1, windowMs: 10_000 };

    enforceRateLimit(req, opts); // count 1, resetAt = 1_010_000
    expect(() => enforceRateLimit(req, opts)).toThrow(); // still in window, blocked

    // Advance time to exactly resetAt: condition is `resetAt <= now`, so this resets.
    nowSpy.mockReturnValue(1_010_000);
    expect(() => enforceRateLimit(req, opts)).not.toThrow();
    expect(store()?.get("k:5.5.5.5")?.count).toBe(1);
    expect(store()?.get("k:5.5.5.5")?.resetAt).toBe(1_020_000);
  });

  it("treats resetAt strictly: one ms before reset is still blocked", () => {
    const nowSpy = jest.spyOn(Date, "now").mockReturnValue(1_000_000);
    const req = makeRequest({ "x-forwarded-for": "5.6.7.8" });
    const opts = { key: "k", limit: 1, windowMs: 10_000 };
    enforceRateLimit(req, opts); // resetAt = 1_010_000
    nowSpy.mockReturnValue(1_009_999);
    expect(() => enforceRateLimit(req, opts)).toThrow();
  });

  it("scopes buckets per key — different keys for the same IP are independent", () => {
    const req = makeRequest({ "x-forwarded-for": "6.6.6.6" });
    enforceRateLimit(req, { key: "login", limit: 1, windowMs: 60_000 });
    // Same IP, different key: should be allowed.
    expect(() =>
      enforceRateLimit(req, { key: "signup", limit: 1, windowMs: 60_000 }),
    ).not.toThrow();
    expect(store()?.get("login:6.6.6.6")?.count).toBe(1);
    expect(store()?.get("signup:6.6.6.6")?.count).toBe(1);
  });

  it("scopes buckets per IP — different IPs under the same key are independent", () => {
    const opts = { key: "login", limit: 1, windowMs: 60_000 };
    enforceRateLimit(makeRequest({ "x-forwarded-for": "7.7.7.7" }), opts);
    expect(() =>
      enforceRateLimit(makeRequest({ "x-forwarded-for": "8.8.8.8" }), opts),
    ).not.toThrow();
  });

  it("derives the IP from the FIRST entry of a comma-separated x-forwarded-for, trimmed", () => {
    const req = makeRequest({ "x-forwarded-for": "  9.9.9.9 , 10.10.10.10" });
    enforceRateLimit(req, { key: "k", limit: 5, windowMs: 60_000 });
    expect(store()?.has("k:9.9.9.9")).toBe(true);
  });

  it("falls back to x-real-ip when x-forwarded-for is absent", () => {
    const req = makeRequest({ "x-real-ip": "11.11.11.11" });
    enforceRateLimit(req, { key: "k", limit: 5, windowMs: 60_000 });
    expect(store()?.has("k:11.11.11.11")).toBe(true);
  });

  it("falls back to 'unknown' when no IP headers are present (all such requests share a bucket)", () => {
    const opts = { key: "k", limit: 1, windowMs: 60_000 };
    enforceRateLimit(makeRequest(), opts);
    expect(store()?.has("k:unknown")).toBe(true);
    // A second header-less request shares the same "unknown" bucket and is blocked.
    expect(() => enforceRateLimit(makeRequest(), opts)).toThrow();
  });

  it("prefers x-forwarded-for over x-real-ip when both are present", () => {
    const req = makeRequest({
      "x-forwarded-for": "12.12.12.12",
      "x-real-ip": "13.13.13.13",
    });
    enforceRateLimit(req, { key: "k", limit: 5, windowMs: 60_000 });
    expect(store()?.has("k:12.12.12.12")).toBe(true);
    expect(store()?.has("k:13.13.13.13")).toBe(false);
  });

  it("with limit 0, the very first request is allowed (fresh bucket short-circuits the limit check)", () => {
    // The `!current` branch runs before the limit comparison, so the first call
    // seeds count=1 and returns; the limit-0 block only bites on the next call.
    const req = makeRequest({ "x-forwarded-for": "14.14.14.14" });
    const opts = { key: "k", limit: 0, windowMs: 60_000 };
    expect(() => enforceRateLimit(req, opts)).not.toThrow();
    // Second call: existing bucket, count(1) >= limit(0) -> blocked.
    expect(() => enforceRateLimit(req, opts)).toThrow();
  });

  it("handles a negative windowMs by producing an already-expired bucket (never blocks)", () => {
    const nowSpy = jest.spyOn(Date, "now").mockReturnValue(2_000_000);
    const req = makeRequest({ "x-forwarded-for": "15.15.15.15" });
    const opts = { key: "k", limit: 1, windowMs: -1 };
    enforceRateLimit(req, opts); // resetAt = 1_999_999 (<= now next call)
    // Next call at same time: resetAt(1_999_999) <= now(2_000_000) -> reset, allowed.
    expect(() => enforceRateLimit(req, opts)).not.toThrow();
    nowSpy.mockRestore();
  });

  it("handles a very large limit without ever throwing across many requests", () => {
    const req = makeRequest({ "x-forwarded-for": "16.16.16.16" });
    const opts = { key: "k", limit: Number.MAX_SAFE_INTEGER, windowMs: 60_000 };
    for (let i = 0; i < 50; i += 1) {
      expect(() => enforceRateLimit(req, opts)).not.toThrow();
    }
    expect(store()?.get("k:16.16.16.16")?.count).toBe(50);
  });
});
