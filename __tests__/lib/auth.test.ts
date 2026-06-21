/**
 * @jest-environment node
 *
 * lib/auth.ts deals exclusively with Next.js request/response cookie plumbing
 * (NextRequest / NextResponse from "next/server"). Those classes extend the
 * WHATWG `Request` / `Response`, which exist as globals in the Node runtime
 * (Node 22 here) but are NOT injected by jest's default `jsdom` environment —
 * constructing a NextRequest under jsdom throws `ReferenceError: Request is not
 * defined`. We therefore pin THIS suite to the `node` environment via the
 * docblock above. This is file-local and does not affect the jsdom-based smoke
 * test in __tests__/lib/dashboard-data.test.ts.
 *
 * NOTE: lib/auth.ts contains NO password hashing (PBKDF2), session-token HMAC,
 * or constant-time comparison logic — those concerns live server-side in the
 * Supabase edge functions, not in this module. The module's real surface is:
 * cookie constants, isSecureRequest, getSessionTokenFromRequest,
 * applyAdminSessionCookies, clearAdminSessionCookies, assertCsrf, and the
 * (now-exported) pure helper toExpiryDate. These tests assert that ACTUAL
 * behavior.
 */
import { NextRequest, NextResponse } from "next/server";

import {
  ADMIN_CSRF_COOKIE,
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_DURATION_MS,
  applyAdminSessionCookies,
  assertCsrf,
  clearAdminSessionCookies,
  getSessionTokenFromRequest,
  isSecureRequest,
  toExpiryDate,
} from "@/lib/auth";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

type ReqOptions = {
  url?: string;
  headers?: Record<string, string>;
  cookies?: Record<string, string>;
};

/** Build a NextRequest with optional URL, headers and cookies attached. */
const makeRequest = ({
  url = "https://dashboard.test/admin",
  headers = {},
  cookies = {},
}: ReqOptions = {}): NextRequest => {
  const req = new NextRequest(url, { headers });
  for (const [name, value] of Object.entries(cookies)) {
    req.cookies.set(name, value);
  }
  return req;
};

const makeResponse = (): NextResponse => NextResponse.json({ ok: true });

// A small tolerance (ms) for assertions that compare against Date.now(): the
// code calls Date.now() internally and a few ms can elapse before we read it.
const TOLERANCE_MS = 2_000;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe("exported constants", () => {
  it("expose the expected stable cookie names", () => {
    expect(ADMIN_SESSION_COOKIE).toBe("drop_admin_session");
    expect(ADMIN_CSRF_COOKIE).toBe("drop_admin_csrf");
  });

  it("define the admin session duration as exactly 12 hours in ms", () => {
    expect(ADMIN_SESSION_DURATION_MS).toBe(1000 * 60 * 60 * 12);
    expect(ADMIN_SESSION_DURATION_MS).toBe(43_200_000);
  });
});

// ---------------------------------------------------------------------------
// isSecureRequest
// ---------------------------------------------------------------------------

describe("isSecureRequest", () => {
  it("returns true when the request URL protocol is https", () => {
    const req = makeRequest({ url: "https://dashboard.test/admin" });
    expect(isSecureRequest(req)).toBe(true);
  });

  it("returns false for a plain http request with no forwarded-proto header", () => {
    const req = makeRequest({ url: "http://dashboard.test/admin" });
    expect(isSecureRequest(req)).toBe(false);
  });

  it("returns true for an http request when x-forwarded-proto is exactly 'https'", () => {
    const req = makeRequest({
      url: "http://dashboard.test/admin",
      headers: { "x-forwarded-proto": "https" },
    });
    expect(isSecureRequest(req)).toBe(true);
  });

  it("does not treat 'http' forwarded-proto as secure", () => {
    const req = makeRequest({
      url: "http://dashboard.test/admin",
      headers: { "x-forwarded-proto": "http" },
    });
    expect(isSecureRequest(req)).toBe(false);
  });

  it("requires an EXACT 'https' match on the header value (case + multi-value not honored)", () => {
    // x-forwarded-proto can carry a comma list (e.g. "https, http"); the code
    // does a strict === "https", so anything but the bare token is falsey.
    const list = makeRequest({
      url: "http://dashboard.test/admin",
      headers: { "x-forwarded-proto": "https, http" },
    });
    expect(isSecureRequest(list)).toBe(false);

    const upper = makeRequest({
      url: "http://dashboard.test/admin",
      headers: { "x-forwarded-proto": "HTTPS" },
    });
    expect(isSecureRequest(upper)).toBe(false);
  });

  it("returns true for a space-padded ' https ' header — WHATWG Headers TRIMS surrounding whitespace before the code reads it", () => {
    // NOTE: this is platform behavior, not auth logic: the Headers object
    // strips leading/trailing HTTP whitespace, so " https" arrives as "https"
    // and the strict === "https" comparison succeeds.
    const padded = makeRequest({
      url: "http://dashboard.test/admin",
      headers: { "x-forwarded-proto": "  https  " },
    });
    expect(isSecureRequest(padded)).toBe(true);
  });

  it("treats https URL as secure even when forwarded-proto says http", () => {
    const req = makeRequest({
      url: "https://dashboard.test/admin",
      headers: { "x-forwarded-proto": "http" },
    });
    expect(isSecureRequest(req)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getSessionTokenFromRequest
// ---------------------------------------------------------------------------

describe("getSessionTokenFromRequest", () => {
  it("returns the session cookie value when present", () => {
    const req = makeRequest({
      cookies: { [ADMIN_SESSION_COOKIE]: "session-token-abc" },
    });
    expect(getSessionTokenFromRequest(req)).toBe("session-token-abc");
  });

  it("returns an empty string when the session cookie is absent", () => {
    const req = makeRequest();
    expect(getSessionTokenFromRequest(req)).toBe("");
  });

  it("returns an empty string when the session cookie value is empty", () => {
    const req = makeRequest({ cookies: { [ADMIN_SESSION_COOKIE]: "" } });
    expect(getSessionTokenFromRequest(req)).toBe("");
  });

  it("only reads the session cookie, ignoring an unrelated csrf cookie", () => {
    const req = makeRequest({
      cookies: { [ADMIN_CSRF_COOKIE]: "csrf-only" },
    });
    expect(getSessionTokenFromRequest(req)).toBe("");
  });

  it("preserves unicode and whitespace token values verbatim", () => {
    const token = "  token-✓-Ω-\t-値  ";
    const req = makeRequest({ cookies: { [ADMIN_SESSION_COOKIE]: token } });
    expect(getSessionTokenFromRequest(req)).toBe(token);
  });

  it("returns a very long token value intact", () => {
    const token = "a".repeat(8192);
    const req = makeRequest({ cookies: { [ADMIN_SESSION_COOKIE]: token } });
    expect(getSessionTokenFromRequest(req)).toBe(token);
  });
});

// ---------------------------------------------------------------------------
// toExpiryDate (pure helper; exported additively for testing)
// ---------------------------------------------------------------------------

describe("toExpiryDate", () => {
  const expectNearDefault = (date: Date) => {
    const expected = Date.now() + ADMIN_SESSION_DURATION_MS;
    expect(date).toBeInstanceOf(Date);
    expect(Number.isNaN(date.getTime())).toBe(false);
    expect(Math.abs(date.getTime() - expected)).toBeLessThan(TOLERANCE_MS);
  };

  it("falls back to now + 12h when value is undefined", () => {
    expectNearDefault(toExpiryDate(undefined));
  });

  it("falls back to now + 12h when value is null", () => {
    expectNearDefault(toExpiryDate(null));
  });

  it("falls back to now + 12h when no argument is supplied", () => {
    expectNearDefault(toExpiryDate());
  });

  it("falls back to now + 12h for an empty string", () => {
    expectNearDefault(toExpiryDate(""));
  });

  it("treats numeric 0 as 'no value' (falsy) and falls back to now + 12h, NOT the unix epoch", () => {
    // This is a subtle edge: `if (!value)` catches 0, so an explicit epoch
    // timestamp of 0 is ignored rather than producing 1970-01-01.
    const date = toExpiryDate(0);
    expectNearDefault(date);
    expect(date.getTime()).not.toBe(0);
  });

  it("falls back to now + 12h for an unparseable date string", () => {
    expectNearDefault(toExpiryDate("not-a-real-date"));
  });

  it("falls back to now + 12h for a whitespace-only string", () => {
    expectNearDefault(toExpiryDate("   "));
  });

  it("falls back to now + 12h for a NUMERIC STRING (it is not parsed as epoch ms)", () => {
    // new Date("1893456000000") is Invalid Date, so this hits the NaN branch.
    expectNearDefault(toExpiryDate("1893456000000"));
  });

  it("parses a valid numeric epoch-ms timestamp", () => {
    const ms = Date.UTC(2030, 0, 1, 0, 0, 0); // 2030-01-01T00:00:00Z
    const date = toExpiryDate(ms);
    expect(date.getTime()).toBe(ms);
  });

  it("parses a valid ISO date string", () => {
    const iso = "2030-01-01T00:00:00.000Z";
    const date = toExpiryDate(iso);
    expect(date.toISOString()).toBe(iso);
  });

  it("accepts a negative (truthy) timestamp and yields a pre-epoch date", () => {
    // -1000 is truthy, so it is used directly: 1969-12-31T23:59:59Z
    const date = toExpiryDate(-1000);
    expect(date.getTime()).toBe(-1000);
  });

  it("accepts a very large future timestamp", () => {
    const ms = Date.UTC(9999, 0, 1);
    const date = toExpiryDate(ms);
    expect(date.getTime()).toBe(ms);
    expect(Number.isNaN(date.getTime())).toBe(false);
  });

  it("returns a NEW Date instance each call (does not share state)", () => {
    const a = toExpiryDate(undefined);
    const b = toExpiryDate(undefined);
    expect(a).not.toBe(b);
  });
});

// ---------------------------------------------------------------------------
// applyAdminSessionCookies
// ---------------------------------------------------------------------------

describe("applyAdminSessionCookies", () => {
  it("sets BOTH the session and csrf cookies with the provided values", () => {
    const res = makeResponse();
    applyAdminSessionCookies(res, {
      sessionToken: "sess-1",
      csrfToken: "csrf-1",
      expiresAt: null,
    });

    const session = res.cookies.get(ADMIN_SESSION_COOKIE);
    const csrf = res.cookies.get(ADMIN_CSRF_COOKIE);

    expect(session?.value).toBe("sess-1");
    expect(csrf?.value).toBe("csrf-1");
  });

  it("marks the session cookie httpOnly but leaves the csrf cookie readable by JS (httpOnly false)", () => {
    const res = makeResponse();
    applyAdminSessionCookies(res, {
      sessionToken: "sess-1",
      csrfToken: "csrf-1",
      expiresAt: null,
    });

    expect(res.cookies.get(ADMIN_SESSION_COOKIE)?.httpOnly).toBe(true);
    expect(res.cookies.get(ADMIN_CSRF_COOKIE)?.httpOnly).toBe(false);
  });

  it("applies sameSite=strict and path=/ to both cookies", () => {
    const res = makeResponse();
    applyAdminSessionCookies(res, {
      sessionToken: "sess-1",
      csrfToken: "csrf-1",
      expiresAt: null,
    });

    for (const name of [ADMIN_SESSION_COOKIE, ADMIN_CSRF_COOKIE]) {
      const c = res.cookies.get(name);
      expect(c?.sameSite).toBe("strict");
      expect(c?.path).toBe("/");
    }
  });

  it("honors an explicit secure:true option", () => {
    const res = makeResponse();
    applyAdminSessionCookies(
      res,
      { sessionToken: "s", csrfToken: "c", expiresAt: null },
      { secure: true },
    );
    expect(res.cookies.get(ADMIN_SESSION_COOKIE)?.secure).toBe(true);
    expect(res.cookies.get(ADMIN_CSRF_COOKIE)?.secure).toBe(true);
  });

  it("honors an explicit secure:false option", () => {
    const res = makeResponse();
    applyAdminSessionCookies(
      res,
      { sessionToken: "s", csrfToken: "c", expiresAt: null },
      { secure: false },
    );
    expect(res.cookies.get(ADMIN_SESSION_COOKIE)?.secure).toBe(false);
    expect(res.cookies.get(ADMIN_CSRF_COOKIE)?.secure).toBe(false);
  });

  it("defaults secure based on NODE_ENV when no option is given (production -> true)", () => {
    const prev = process.env.NODE_ENV;
    try {
      // NODE_ENV is read-only in @types/node typings; assign via a cast.
      (process.env as Record<string, string>).NODE_ENV = "production";
      const res = makeResponse();
      applyAdminSessionCookies(res, {
        sessionToken: "s",
        csrfToken: "c",
        expiresAt: null,
      });
      expect(res.cookies.get(ADMIN_SESSION_COOKIE)?.secure).toBe(true);
    } finally {
      (process.env as Record<string, string>).NODE_ENV = prev ?? "test";
    }
  });

  it("defaults secure to false when NODE_ENV is not production", () => {
    const prev = process.env.NODE_ENV;
    try {
      (process.env as Record<string, string>).NODE_ENV = "development";
      const res = makeResponse();
      applyAdminSessionCookies(res, {
        sessionToken: "s",
        csrfToken: "c",
        expiresAt: null,
      });
      // ResponseCookies omits `secure` from the parsed object when false-y;
      // assert it is not truthy rather than strictly === false.
      expect(res.cookies.get(ADMIN_SESSION_COOKIE)?.secure).toBeFalsy();
    } finally {
      (process.env as Record<string, string>).NODE_ENV = prev ?? "test";
    }
  });

  it("uses the provided expiresAt (epoch ms) as the cookie expiry", () => {
    const res = makeResponse();
    const ms = Date.UTC(2031, 5, 1, 12, 0, 0);
    applyAdminSessionCookies(res, {
      sessionToken: "s",
      csrfToken: "c",
      expiresAt: ms,
    });
    expect(res.cookies.get(ADMIN_SESSION_COOKIE)?.expires?.getTime()).toBe(ms);
    expect(res.cookies.get(ADMIN_CSRF_COOKIE)?.expires?.getTime()).toBe(ms);
  });

  it("uses the provided expiresAt (ISO string) as the cookie expiry", () => {
    const res = makeResponse();
    const iso = "2031-06-01T12:00:00.000Z";
    applyAdminSessionCookies(res, {
      sessionToken: "s",
      csrfToken: "c",
      expiresAt: iso,
    });
    expect(res.cookies.get(ADMIN_SESSION_COOKIE)?.expires?.toISOString()).toBe(
      iso,
    );
  });

  it("falls back to now + 12h expiry when expiresAt is null/invalid", () => {
    const res = makeResponse();
    applyAdminSessionCookies(res, {
      sessionToken: "s",
      csrfToken: "c",
      expiresAt: "garbage",
    });
    const exp = res.cookies.get(ADMIN_SESSION_COOKIE)?.expires?.getTime();
    expect(exp).toBeDefined();
    const expected = Date.now() + ADMIN_SESSION_DURATION_MS;
    expect(Math.abs((exp as number) - expected)).toBeLessThan(TOLERANCE_MS);
  });

  it("emits a Set-Cookie header containing both cookies", () => {
    const res = makeResponse();
    applyAdminSessionCookies(res, {
      sessionToken: "sess-xyz",
      csrfToken: "csrf-xyz",
      expiresAt: null,
    });
    const setCookies = res.cookies.getAll().map((c) => c.name);
    expect(setCookies).toEqual(
      expect.arrayContaining([ADMIN_SESSION_COOKIE, ADMIN_CSRF_COOKIE]),
    );
  });

  it("stores empty token values verbatim when given empty strings", () => {
    const res = makeResponse();
    applyAdminSessionCookies(res, {
      sessionToken: "",
      csrfToken: "",
      expiresAt: null,
    });
    expect(res.cookies.get(ADMIN_SESSION_COOKIE)?.value).toBe("");
    expect(res.cookies.get(ADMIN_CSRF_COOKIE)?.value).toBe("");
  });
});

// ---------------------------------------------------------------------------
// clearAdminSessionCookies
// ---------------------------------------------------------------------------

describe("clearAdminSessionCookies", () => {
  it("sets both cookies to an empty value", () => {
    const res = makeResponse();
    clearAdminSessionCookies(res);
    expect(res.cookies.get(ADMIN_SESSION_COOKIE)?.value).toBe("");
    expect(res.cookies.get(ADMIN_CSRF_COOKIE)?.value).toBe("");
  });

  it("sets both cookies to expire at the unix epoch (immediate deletion)", () => {
    const res = makeResponse();
    clearAdminSessionCookies(res);
    expect(res.cookies.get(ADMIN_SESSION_COOKIE)?.expires?.getTime()).toBe(0);
    expect(res.cookies.get(ADMIN_CSRF_COOKIE)?.expires?.getTime()).toBe(0);
  });

  it("preserves the httpOnly split (session httpOnly, csrf not) and sameSite/path on clear", () => {
    const res = makeResponse();
    clearAdminSessionCookies(res);
    expect(res.cookies.get(ADMIN_SESSION_COOKIE)?.httpOnly).toBe(true);
    expect(res.cookies.get(ADMIN_CSRF_COOKIE)?.httpOnly).toBe(false);
    for (const name of [ADMIN_SESSION_COOKIE, ADMIN_CSRF_COOKIE]) {
      expect(res.cookies.get(name)?.sameSite).toBe("strict");
      expect(res.cookies.get(name)?.path).toBe("/");
    }
  });

  it("honors an explicit secure:true option on clear", () => {
    const res = makeResponse();
    clearAdminSessionCookies(res, { secure: true });
    expect(res.cookies.get(ADMIN_SESSION_COOKIE)?.secure).toBe(true);
    expect(res.cookies.get(ADMIN_CSRF_COOKIE)?.secure).toBe(true);
  });

  it("defaults secure from NODE_ENV on clear (production -> true)", () => {
    const prev = process.env.NODE_ENV;
    try {
      (process.env as Record<string, string>).NODE_ENV = "production";
      const res = makeResponse();
      clearAdminSessionCookies(res);
      expect(res.cookies.get(ADMIN_SESSION_COOKIE)?.secure).toBe(true);
    } finally {
      (process.env as Record<string, string>).NODE_ENV = prev ?? "test";
    }
  });

  it("clears both cookie names", () => {
    const res = makeResponse();
    clearAdminSessionCookies(res);
    const names = res.cookies.getAll().map((c) => c.name);
    expect(names).toEqual(
      expect.arrayContaining([ADMIN_SESSION_COOKIE, ADMIN_CSRF_COOKIE]),
    );
  });
});

// ---------------------------------------------------------------------------
// assertCsrf
// ---------------------------------------------------------------------------

describe("assertCsrf", () => {
  it("does not throw when cookie and header CSRF tokens match", () => {
    const req = makeRequest({
      headers: { "x-csrf-token": "match-123" },
      cookies: { [ADMIN_CSRF_COOKIE]: "match-123" },
    });
    expect(() => assertCsrf(req)).not.toThrow();
  });

  it("throws 'Invalid CSRF token.' when the tokens differ", () => {
    const req = makeRequest({
      headers: { "x-csrf-token": "header-value" },
      cookies: { [ADMIN_CSRF_COOKIE]: "cookie-value" },
    });
    expect(() => assertCsrf(req)).toThrow("Invalid CSRF token.");
  });

  it("throws when the CSRF cookie is missing (only header present)", () => {
    const req = makeRequest({ headers: { "x-csrf-token": "only-header" } });
    expect(() => assertCsrf(req)).toThrow("Invalid CSRF token.");
  });

  it("throws when the CSRF header is missing (only cookie present)", () => {
    const req = makeRequest({ cookies: { [ADMIN_CSRF_COOKIE]: "only-cookie" } });
    expect(() => assertCsrf(req)).toThrow("Invalid CSRF token.");
  });

  it("throws when both the cookie and header are missing", () => {
    const req = makeRequest();
    expect(() => assertCsrf(req)).toThrow("Invalid CSRF token.");
  });

  it("throws when both are present but EMPTY (empty string is treated as missing)", () => {
    const req = makeRequest({
      headers: { "x-csrf-token": "" },
      cookies: { [ADMIN_CSRF_COOKIE]: "" },
    });
    expect(() => assertCsrf(req)).toThrow("Invalid CSRF token.");
  });

  it("throws when the header is empty even if a non-empty cookie matches nothing", () => {
    const req = makeRequest({
      headers: { "x-csrf-token": "" },
      cookies: { [ADMIN_CSRF_COOKIE]: "real" },
    });
    expect(() => assertCsrf(req)).toThrow("Invalid CSRF token.");
  });

  it("is case-sensitive: tokens differing only by case do not match", () => {
    const req = makeRequest({
      headers: { "x-csrf-token": "ABC" },
      cookies: { [ADMIN_CSRF_COOKIE]: "abc" },
    });
    expect(() => assertCsrf(req)).toThrow("Invalid CSRF token.");
  });

  it("does NOT throw on a space-padded header token — WHATWG Headers trims it back to the cookie value", () => {
    // Platform behavior: the header value "abc " is trimmed to "abc" by the
    // Headers object, so it once again equals the (untrimmed) cookie "abc".
    // The cookie store does NOT trim its values, so the asymmetry only bites
    // when the COOKIE carries the surrounding whitespace (next test).
    const req = makeRequest({
      headers: { "x-csrf-token": "abc " },
      cookies: { [ADMIN_CSRF_COOKIE]: "abc" },
    });
    expect(() => assertCsrf(req)).not.toThrow();
  });

  it("throws when only the COOKIE carries surrounding whitespace (cookie store does not trim)", () => {
    const req = makeRequest({
      headers: { "x-csrf-token": "abc" },
      cookies: { [ADMIN_CSRF_COOKIE]: "abc " },
    });
    expect(() => assertCsrf(req)).toThrow("Invalid CSRF token.");
  });

  it("accepts matching tokens containing Latin-1 special characters", () => {
    // HTTP header values are ByteStrings (Latin-1), so non-Latin-1 unicode
    // (e.g. U+2713) cannot ride in the x-csrf-token header at all. Within the
    // Latin-1 range, special characters round-trip and compare equal.
    const token = "tok-_.~Çé-42";
    const req = makeRequest({
      headers: { "x-csrf-token": token },
      cookies: { [ADMIN_CSRF_COOKIE]: token },
    });
    expect(() => assertCsrf(req)).not.toThrow();
  });

  it("accepts matching very long tokens", () => {
    const token = "z".repeat(4096);
    const req = makeRequest({
      headers: { "x-csrf-token": token },
      cookies: { [ADMIN_CSRF_COOKIE]: token },
    });
    expect(() => assertCsrf(req)).not.toThrow();
  });

  it("throws an Error instance (not a string) on failure", () => {
    const req = makeRequest();
    expect(() => assertCsrf(req)).toThrow(Error);
  });
});
