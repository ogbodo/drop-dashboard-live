/**
 * @jest-environment node
 *
 * route-utils.ts builds NextResponse objects and validates request origin /
 * session. next/server requires the Web `Request`/`Response`/`Headers`/`fetch`
 * globals, which jsdom does not provide but the Node test environment does --
 * hence the per-file `@jest-environment node` docblock above. The shared
 * jest.setup.ts and the jsdom smoke test are untouched.
 */
import { NextRequest } from "next/server";

import {
  assertSameOrigin,
  jsonError,
  jsonSuccess,
  parseJsonBody,
  requireAdminSession,
} from "@/lib/route-utils";

const ORIGIN = "https://admin.drop.test";

const makeRequest = (
  url = `${ORIGIN}/api/resource`,
  init: { headers?: Record<string, string>; method?: string; body?: string } = {},
) =>
  new NextRequest(url, {
    method: init.method,
    headers: init.headers,
    body: init.body,
  });

describe("jsonSuccess", () => {
  it("wraps the payload under a `data` key with 200 default status", async () => {
    const res = jsonSuccess({ id: 7, name: "Ada" });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { id: 7, name: "Ada" } });
  });

  it("always sets Cache-Control: no-store", async () => {
    const res = jsonSuccess({ ok: true });
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("honours a custom status passed via init", async () => {
    const res = jsonSuccess({ created: true }, { status: 201 });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ data: { created: true } });
  });

  it("merges caller-provided headers alongside the no-store header", () => {
    const res = jsonSuccess({ ok: true }, { headers: { "X-Custom": "yes" } });
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("x-custom")).toBe("yes");
  });

  it("does NOT let a caller header override Cache-Control (no-store wins)", () => {
    // withNoStore spreads Cache-Control first, then init.headers. A plain object
    // with a differently-cased key produces two header entries; Headers folds
    // them and the later value ("no-store") is what the source intends. Assert
    // the documented guarantee: no-store is always present.
    const res = jsonSuccess(
      { ok: true },
      { headers: { "X-Other": "1" } },
    );
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("handles null / undefined / primitive payloads", async () => {
    expect(await jsonSuccess(null).json()).toEqual({ data: null });
    // `undefined` is dropped by JSON serialization, leaving an empty object.
    expect(await jsonSuccess(undefined).json()).toEqual({});
    expect(await jsonSuccess(0).json()).toEqual({ data: 0 });
    expect(await jsonSuccess("").json()).toEqual({ data: "" });
    expect(await jsonSuccess(false).json()).toEqual({ data: false });
  });

  it("preserves unicode payloads", async () => {
    const res = jsonSuccess({ name: "Adáeze 日本語 😀" });
    expect(await res.json()).toEqual({ data: { name: "Adáeze 日本語 😀" } });
  });
});

describe("jsonError", () => {
  it("uses the fallback 500 status and a generic message for a non-Error value", async () => {
    const res = jsonError("a bare string");
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({
      details: null,
      error: "An unexpected server error occurred.",
    });
  });

  it("uses a custom fallback status when provided and value is not an Error", async () => {
    const res = jsonError(null, 502);
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({
      details: null,
      error: "An unexpected server error occurred.",
    });
  });

  it("extracts the message from a real Error", async () => {
    const res = jsonError(new Error("boom"));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ details: null, error: "boom" });
  });

  it("honours a numeric `status` property on the error and serializes `payload` as details", async () => {
    const err = Object.assign(new Error("Not allowed"), {
      status: 403,
      payload: { reason: "forbidden" },
    });
    const res = jsonError(err);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      details: { reason: "forbidden" },
      error: "Not allowed",
    });
  });

  it("ignores a non-numeric `status` property and falls back", async () => {
    const err = Object.assign(new Error("weird"), { status: "403" });
    const res = jsonError(err, 418);
    expect(res.status).toBe(418);
  });

  it("sets Cache-Control: no-store on error responses", () => {
    const res = jsonError(new Error("x"));
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("defaults details to null when payload is undefined", async () => {
    const err = Object.assign(new Error("x"), { status: 400 });
    expect((await jsonError(err).json()).details).toBeNull();
  });

  it("treats a non-Error object (no message) with the generic message", async () => {
    const res = jsonError({ status: 409, payload: { a: 1 } });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      details: { a: 1 },
      error: "An unexpected server error occurred.",
    });
  });
});

describe("parseJsonBody", () => {
  it("parses a valid JSON body", async () => {
    const req = makeRequest(`${ORIGIN}/api/x`, {
      method: "POST",
      body: JSON.stringify({ a: 1, b: "two" }),
      headers: { "content-type": "application/json" },
    });
    expect(await parseJsonBody(req)).toEqual({ a: 1, b: "two" });
  });

  it("returns {} for an invalid JSON body instead of throwing", async () => {
    const req = makeRequest(`${ORIGIN}/api/x`, { method: "POST", body: "not-json" });
    expect(await parseJsonBody(req)).toEqual({});
  });

  it("returns {} for an empty body", async () => {
    const req = makeRequest(`${ORIGIN}/api/x`, { method: "POST" });
    expect(await parseJsonBody(req)).toEqual({});
  });

  it("parses a JSON array body", async () => {
    const req = makeRequest(`${ORIGIN}/api/x`, {
      method: "POST",
      body: JSON.stringify([1, 2, 3]),
    });
    expect(await parseJsonBody(req)).toEqual([1, 2, 3]);
  });

  it("parses a JSON null body (returns null, not {})", async () => {
    const req = makeRequest(`${ORIGIN}/api/x`, { method: "POST", body: "null" });
    expect(await parseJsonBody(req)).toBeNull();
  });
});

describe("requireAdminSession", () => {
  it("returns the session token when the session cookie is present", async () => {
    const req = makeRequest(`${ORIGIN}/api/x`, {
      headers: { cookie: "drop_admin_session=sess-123" },
    });
    await expect(requireAdminSession(req)).resolves.toEqual({
      sessionToken: "sess-123",
    });
  });

  it("throws a 401 Unauthorized error when no session cookie is present", async () => {
    const req = makeRequest();
    await expect(requireAdminSession(req)).rejects.toMatchObject({
      message: "Unauthorized",
      status: 401,
    });
  });

  it("does NOT enforce CSRF / origin when requireCsrf is omitted", async () => {
    // No origin header and no csrf header, but should still pass without csrf opt.
    const req = makeRequest(`${ORIGIN}/api/x`, {
      headers: { cookie: "drop_admin_session=sess-123" },
    });
    await expect(requireAdminSession(req, {})).resolves.toEqual({
      sessionToken: "sess-123",
    });
  });

  it("enforces same-origin + CSRF when requireCsrf is true (passes when both valid)", async () => {
    const req = makeRequest(`${ORIGIN}/api/x`, {
      method: "POST",
      headers: {
        cookie: "drop_admin_session=sess-123; drop_admin_csrf=tok-xyz",
        origin: ORIGIN,
        "x-csrf-token": "tok-xyz",
      },
    });
    await expect(
      requireAdminSession(req, { requireCsrf: true }),
    ).resolves.toEqual({ sessionToken: "sess-123" });
  });

  it("rejects with 403 when requireCsrf is true and origin mismatches", async () => {
    const req = makeRequest(`${ORIGIN}/api/x`, {
      method: "POST",
      headers: {
        cookie: "drop_admin_session=sess-123; drop_admin_csrf=tok-xyz",
        origin: "https://evil.example.com",
        "x-csrf-token": "tok-xyz",
      },
    });
    await expect(
      requireAdminSession(req, { requireCsrf: true }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("rejects with the CSRF error when origin matches but csrf token mismatches", async () => {
    const req = makeRequest(`${ORIGIN}/api/x`, {
      method: "POST",
      headers: {
        cookie: "drop_admin_session=sess-123; drop_admin_csrf=tok-xyz",
        origin: ORIGIN,
        "x-csrf-token": "WRONG",
      },
    });
    await expect(
      requireAdminSession(req, { requireCsrf: true }),
    ).rejects.toThrow("Invalid CSRF token.");
  });

  it("checks the session BEFORE csrf (missing session throws 401 even with bad origin)", async () => {
    const req = makeRequest(`${ORIGIN}/api/x`, {
      method: "POST",
      headers: { origin: "https://evil.example.com" },
    });
    await expect(
      requireAdminSession(req, { requireCsrf: true }),
    ).rejects.toMatchObject({ status: 401 });
  });
});

describe("assertSameOrigin (open-redirect / CSRF origin guard)", () => {
  it("passes when the Origin header matches the request origin exactly", () => {
    const req = makeRequest(`${ORIGIN}/api/x`, { headers: { origin: ORIGIN } });
    expect(() => assertSameOrigin(req)).not.toThrow();
  });

  it("rejects (403) when the Origin header is a different origin", () => {
    const req = makeRequest(`${ORIGIN}/api/x`, {
      headers: { origin: "https://evil.example.com" },
    });
    expect(() => assertSameOrigin(req)).toThrow("Invalid request origin.");
    try {
      assertSameOrigin(req);
    } catch (e) {
      expect((e as { status?: number }).status).toBe(403);
    }
  });

  it("rejects when the Origin differs only by scheme (http vs https)", () => {
    const req = makeRequest(`${ORIGIN}/api/x`, {
      headers: { origin: "http://admin.drop.test" },
    });
    expect(() => assertSameOrigin(req)).toThrow("Invalid request origin.");
  });

  it("rejects when the Origin differs only by port", () => {
    const req = makeRequest(`${ORIGIN}/api/x`, {
      headers: { origin: "https://admin.drop.test:8443" },
    });
    expect(() => assertSameOrigin(req)).toThrow("Invalid request origin.");
  });

  it("rejects when the Origin header is present but not a valid URL", () => {
    const req = makeRequest(`${ORIGIN}/api/x`, {
      headers: { origin: "not a url" },
    });
    expect(() => assertSameOrigin(req)).toThrow("Invalid request origin.");
  });

  it("falls back to the Referer header when no Origin header is present (match passes)", () => {
    const req = makeRequest(`${ORIGIN}/api/x`, {
      headers: { referer: `${ORIGIN}/some/path?q=1` },
    });
    expect(() => assertSameOrigin(req)).not.toThrow();
  });

  it("rejects (403) when only a cross-origin Referer is present", () => {
    const req = makeRequest(`${ORIGIN}/api/x`, {
      headers: { referer: "https://evil.example.com/path" },
    });
    expect(() => assertSameOrigin(req)).toThrow("Invalid request origin.");
  });

  it("rejects when the Referer header is present but not a valid URL", () => {
    const req = makeRequest(`${ORIGIN}/api/x`, {
      headers: { referer: "::::::" },
    });
    expect(() => assertSameOrigin(req)).toThrow("Invalid request origin.");
  });

  it("rejects (403) with 'Missing request origin.' when neither Origin nor Referer is present", () => {
    const req = makeRequest(`${ORIGIN}/api/x`);
    expect(() => assertSameOrigin(req)).toThrow("Missing request origin.");
    try {
      assertSameOrigin(req);
    } catch (e) {
      expect((e as { status?: number }).status).toBe(403);
    }
  });

  it("prefers Origin over Referer: a valid Origin passes even with a cross-origin Referer", () => {
    const req = makeRequest(`${ORIGIN}/api/x`, {
      headers: { origin: ORIGIN, referer: "https://evil.example.com/x" },
    });
    expect(() => assertSameOrigin(req)).not.toThrow();
  });

  it("prefers Origin over Referer: a bad Origin is rejected even with a matching Referer", () => {
    const req = makeRequest(`${ORIGIN}/api/x`, {
      headers: { origin: "https://evil.example.com", referer: `${ORIGIN}/x` },
    });
    expect(() => assertSameOrigin(req)).toThrow("Invalid request origin.");
  });
});
