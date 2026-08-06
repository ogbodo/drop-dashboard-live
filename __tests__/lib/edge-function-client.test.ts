/**
 * @jest-environment node
 *
 * edge-function-client.ts builds a request URL + headers and calls global
 * fetch. We mock `@/lib/env` to control configuration and mock fetch to assert
 * exactly what is sent. The Node test environment provides URL/URLSearchParams.
 */

// Mutable mock env; each test sets fields as needed.
const mockEnv = {
  dashboardFunctionName: "drop-admin",
  supabaseAnonKey: "anon-123",
  supabaseFunctionUrl: "https://proj.functions.supabase.co",
  supabaseUrl: "https://proj.supabase.co",
};

jest.mock("@/lib/env", () => ({
  get env() {
    return mockEnv;
  },
}));

import { invokeDashboardEdge } from "@/lib/edge-function-client";

type FetchMock = jest.Mock<Promise<Response>, [string, RequestInit?]>;

const jsonResponse = (
  body: unknown,
  init: { ok?: boolean; status?: number } = {},
): Response =>
  ({
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: jest.fn().mockResolvedValue(body),
  } as unknown as Response);

let fetchMock: FetchMock;

const lastCall = () => {
  const [url, init] = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
  return { url, init: init as RequestInit, headers: (init as RequestInit).headers as Record<string, string> };
};

beforeEach(() => {
  // reset env to defaults
  mockEnv.dashboardFunctionName = "drop-admin";
  mockEnv.supabaseAnonKey = "anon-123";
  mockEnv.supabaseFunctionUrl = "https://proj.functions.supabase.co";
  mockEnv.supabaseUrl = "https://proj.supabase.co";

  fetchMock = jest.fn().mockResolvedValue(jsonResponse({ data: { ok: true } })) as FetchMock;
  global.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  jest.clearAllMocks();
});

describe("invokeDashboardEdge — URL building", () => {
  it("composes base + function name + normalized path", async () => {
    await invokeDashboardEdge("rides/123");
    expect(lastCall().url).toBe("https://proj.functions.supabase.co/drop-admin/rides/123");
  });

  it("strips leading slashes from the pathname before composing", async () => {
    await invokeDashboardEdge("///rides/123");
    expect(lastCall().url).toBe("https://proj.functions.supabase.co/drop-admin/rides/123");
  });

  it("strips a trailing slash from the configured function base URL", async () => {
    mockEnv.supabaseFunctionUrl = "https://proj.functions.supabase.co/";
    await invokeDashboardEdge("rides");
    expect(lastCall().url).toBe("https://proj.functions.supabase.co/drop-admin/rides");
  });

  it("handles an empty pathname (resolves to base/function-name/)", async () => {
    await invokeDashboardEdge("");
    expect(lastCall().url).toBe("https://proj.functions.supabase.co/drop-admin/");
  });

  it("appends searchParams to the query string", async () => {
    const sp = new URLSearchParams();
    sp.set("status", "active");
    sp.set("limit", "20");
    await invokeDashboardEdge("rides", { searchParams: sp });
    const url = new URL(lastCall().url);
    expect(url.pathname).toBe("/drop-admin/rides");
    expect(url.searchParams.get("status")).toBe("active");
    expect(url.searchParams.get("limit")).toBe("20");
  });

  it("url-encodes special characters in searchParams values", async () => {
    const sp = new URLSearchParams();
    sp.set("q", "a b&c=d");
    await invokeDashboardEdge("search", { searchParams: sp });
    const url = new URL(lastCall().url);
    expect(url.searchParams.get("q")).toBe("a b&c=d");
  });

  it("preserves unicode in the pathname", async () => {
    await invokeDashboardEdge("partners/日本語");
    const url = new URL(lastCall().url);
    expect(decodeURIComponent(url.pathname)).toBe("/drop-admin/partners/日本語");
  });

  it("throws (before fetching) when supabaseFunctionUrl is empty", async () => {
    mockEnv.supabaseFunctionUrl = "";
    await expect(invokeDashboardEdge("rides")).rejects.toThrow(
      "NEXT_PUBLIC_SUPABASE_FUNCTION_URL and NEXT_PUBLIC_DASHBOARD_FUNCTION_NAME must be configured.",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("throws (before fetching) when dashboardFunctionName is empty", async () => {
    mockEnv.dashboardFunctionName = "";
    await expect(invokeDashboardEdge("rides")).rejects.toThrow(
      "NEXT_PUBLIC_SUPABASE_FUNCTION_URL and NEXT_PUBLIC_DASHBOARD_FUNCTION_NAME must be configured.",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("invokeDashboardEdge — header building", () => {
  it("always sends Accept: application/json", async () => {
    await invokeDashboardEdge("rides");
    expect(lastCall().headers.Accept).toBe("application/json");
  });

  it("sends Authorization (Bearer) and apikey headers when an anon key is configured", async () => {
    await invokeDashboardEdge("rides");
    const { headers } = lastCall();
    expect(headers.Authorization).toBe("Bearer anon-123");
    expect(headers.apikey).toBe("anon-123");
  });

  it("omits Authorization / apikey when no anon key is configured", async () => {
    mockEnv.supabaseAnonKey = "";
    await invokeDashboardEdge("rides");
    const { headers } = lastCall();
    expect(headers.Authorization).toBeUndefined();
    expect(headers.apikey).toBeUndefined();
  });

  it("merges caller-supplied headers", async () => {
    await invokeDashboardEdge("rides", { headers: { "X-Trace": "abc" } });
    expect(lastCall().headers["X-Trace"]).toBe("abc");
  });

  it("lets caller headers override the defaults (caller spread after Accept)", async () => {
    await invokeDashboardEdge("rides", { headers: { Accept: "text/plain" } });
    expect(lastCall().headers.Accept).toBe("text/plain");
  });

  it("sets Content-Type: application/json only when a body is provided", async () => {
    await invokeDashboardEdge("rides", { body: { a: 1 } });
    expect(lastCall().headers["Content-Type"]).toBe("application/json");
  });

  it("does NOT set Content-Type when no body is provided", async () => {
    await invokeDashboardEdge("rides");
    expect(lastCall().headers["Content-Type"]).toBeUndefined();
  });

  it("sets Content-Type even for a falsy-but-defined body like null or 0", async () => {
    await invokeDashboardEdge("rides", { body: null });
    expect(lastCall().headers["Content-Type"]).toBe("application/json");
    fetchMock.mockClear();
    await invokeDashboardEdge("rides", { body: 0 });
    expect(lastCall().headers["Content-Type"]).toBe("application/json");
  });
});

describe("invokeDashboardEdge — method & body", () => {
  it("defaults the method to GET", async () => {
    await invokeDashboardEdge("rides");
    expect(lastCall().init.method).toBe("GET");
  });

  it("uses the provided method", async () => {
    await invokeDashboardEdge("rides", { method: "POST", body: { a: 1 } });
    expect(lastCall().init.method).toBe("POST");
  });

  it("serializes the body to JSON", async () => {
    await invokeDashboardEdge("rides", { method: "POST", body: { a: 1, b: "two" } });
    expect(lastCall().init.body).toBe(JSON.stringify({ a: 1, b: "two" }));
  });

  it("sends an undefined body (not the string 'undefined') when no body is given", async () => {
    await invokeDashboardEdge("rides");
    expect(lastCall().init.body).toBeUndefined();
  });

  it("serializes a null body to the JSON literal 'null'", async () => {
    await invokeDashboardEdge("rides", { body: null });
    expect(lastCall().init.body).toBe("null");
  });
});

describe("invokeDashboardEdge — response handling", () => {
  it("returns payload.data on a successful response", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: { id: 5, name: "Ada" } }));
    await expect(invokeDashboardEdge("rides/5")).resolves.toEqual({ id: 5, name: "Ada" });
  });

  it("returns undefined when a successful response has no `data` field", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}));
    await expect(invokeDashboardEdge("rides")).resolves.toBeUndefined();
  });

  it("throws with payload.error message and attaches status + details on a non-2xx response", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: "Not found", details: { id: 9 } }, { ok: false, status: 404 }),
    );
    await expect(invokeDashboardEdge("rides/9")).rejects.toMatchObject({
      message: "Not found",
      status: 404,
      payload: { id: 9 },
    });
  });

  it("throws even on a 2xx response if the payload carries an `error` field", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: "Soft failure" }, { ok: true, status: 200 }),
    );
    await expect(invokeDashboardEdge("rides")).rejects.toMatchObject({
      message: "Soft failure",
      status: 200,
    });
  });

  it("uses a generic message when the response is not ok and carries no error string", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, { ok: false, status: 500 }));
    await expect(invokeDashboardEdge("rides")).rejects.toMatchObject({
      message: "Edge function request failed.",
      status: 500,
    });
  });

  it("falls back details to the whole payload when `details` is absent on an error", async () => {
    const payload = { error: "Bad", foo: "bar" };
    fetchMock.mockResolvedValueOnce(jsonResponse(payload, { ok: false, status: 400 }));
    await expect(invokeDashboardEdge("rides")).rejects.toMatchObject({
      payload,
      status: 400,
    });
  });

  it("treats a body that fails to JSON-parse as an empty payload ({}), yielding undefined on success", async () => {
    const badResponse = {
      ok: true,
      status: 200,
      json: jest.fn().mockRejectedValue(new SyntaxError("Unexpected token")),
    } as unknown as Response;
    fetchMock.mockResolvedValueOnce(badResponse);
    await expect(invokeDashboardEdge("rides")).resolves.toBeUndefined();
  });

  it("on a non-ok response whose body fails to parse, throws the generic error with that status", async () => {
    const badResponse = {
      ok: false,
      status: 502,
      json: jest.fn().mockRejectedValue(new SyntaxError("Unexpected token")),
    } as unknown as Response;
    fetchMock.mockResolvedValueOnce(badResponse);
    await expect(invokeDashboardEdge("rides")).rejects.toMatchObject({
      message: "Edge function request failed.",
      status: 502,
    });
  });

  it("propagates a network-level fetch rejection", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("network down"));
    await expect(invokeDashboardEdge("rides")).rejects.toThrow("network down");
  });
});
