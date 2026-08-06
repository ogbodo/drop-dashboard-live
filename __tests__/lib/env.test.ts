/**
 * @jest-environment node
 *
 * env.ts reads process.env AT MODULE LOAD and snapshots the values into the
 * exported `env` object. To exercise different configurations we mutate
 * process.env and re-import the module in isolation (jest.isolateModules +
 * resetModules) for each scenario.
 */

type EnvModule = typeof import("@/lib/env");

const ENV_KEYS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_SUPABASE_FUNCTION_URL",
  "NEXT_PUBLIC_DASHBOARD_FUNCTION_NAME",
] as const;

const ORIGINAL: Record<string, string | undefined> = {};

beforeAll(() => {
  for (const k of ENV_KEYS) ORIGINAL[k] = process.env[k];
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (ORIGINAL[k] === undefined) delete process.env[k];
    else process.env[k] = ORIGINAL[k] as string;
  }
});

/** Set the env to the given values (deleting keys set to undefined) and freshly import the module. */
const loadWith = (overrides: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>): EnvModule => {
  for (const k of ENV_KEYS) delete process.env[k];
  for (const [k, v] of Object.entries(overrides)) {
    if (v !== undefined) process.env[k] = v;
  }
  let mod!: EnvModule;
  jest.isolateModules(() => {
    mod = require("@/lib/env") as EnvModule;
  });
  return mod;
};

describe("env defaults", () => {
  it("defaults dashboardFunctionName to 'drop-admin' when unset", () => {
    expect(loadWith({}).env.dashboardFunctionName).toBe("drop-admin");
  });

  it("respects an explicit NEXT_PUBLIC_DASHBOARD_FUNCTION_NAME", () => {
    expect(
      loadWith({ NEXT_PUBLIC_DASHBOARD_FUNCTION_NAME: "custom-fn" }).env.dashboardFunctionName,
    ).toBe("custom-fn");
  });

  it("defaults supabaseUrl and supabaseAnonKey to empty strings when unset", () => {
    const { env } = loadWith({});
    expect(env.supabaseUrl).toBe("");
    expect(env.supabaseAnonKey).toBe("");
  });

  it("passes through supabaseUrl and supabaseAnonKey when set", () => {
    const { env } = loadWith({
      NEXT_PUBLIC_SUPABASE_URL: "https://proj.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key-123",
    });
    expect(env.supabaseUrl).toBe("https://proj.supabase.co");
    expect(env.supabaseAnonKey).toBe("anon-key-123");
  });
});

describe("supabaseFunctionUrl derivation", () => {
  it("uses an explicit NEXT_PUBLIC_SUPABASE_FUNCTION_URL verbatim (no derivation)", () => {
    const { env } = loadWith({
      NEXT_PUBLIC_SUPABASE_URL: "https://proj.supabase.co",
      NEXT_PUBLIC_SUPABASE_FUNCTION_URL: "https://explicit.example.com",
    });
    expect(env.supabaseFunctionUrl).toBe("https://explicit.example.com");
  });

  it("derives the function URL from a *.supabase.co project URL when the explicit var is unset", () => {
    const { env } = loadWith({ NEXT_PUBLIC_SUPABASE_URL: "https://abcdefg.supabase.co" });
    expect(env.supabaseFunctionUrl).toBe("https://abcdefg.functions.supabase.co");
  });

  it("preserves the http scheme when deriving", () => {
    const { env } = loadWith({ NEXT_PUBLIC_SUPABASE_URL: "http://abcdefg.supabase.co" });
    expect(env.supabaseFunctionUrl).toBe("http://abcdefg.functions.supabase.co");
  });

  it("returns '' when both the explicit var and the project URL are unset", () => {
    expect(loadWith({}).env.supabaseFunctionUrl).toBe("");
  });

  it("returns '' when the project URL is not a valid URL", () => {
    const { env } = loadWith({ NEXT_PUBLIC_SUPABASE_URL: "not a url" });
    expect(env.supabaseFunctionUrl).toBe("");
  });

  it("ignores a trailing path on the project URL — derivation only swaps the hostname (origin only)", () => {
    const { env } = loadWith({
      NEXT_PUBLIC_SUPABASE_URL: "https://abcdefg.supabase.co/some/path",
    });
    expect(env.supabaseFunctionUrl).toBe("https://abcdefg.functions.supabase.co");
  });

  it("BUG: drops the port when deriving because it uses hostname, not host", () => {
    // url.hostname excludes the port; the derived value loses ':54321'.
    const { env } = loadWith({ NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54321" });
    expect(env.supabaseFunctionUrl).toBe("http://localhost");
  });

  it("for a non-supabase.co host, the replace is a no-op so host passes through unchanged", () => {
    const { env } = loadWith({ NEXT_PUBLIC_SUPABASE_URL: "https://example.org" });
    expect(env.supabaseFunctionUrl).toBe("https://example.org");
  });
});

describe("assertDashboardEnv", () => {
  it("does not throw when both supabaseUrl and supabaseFunctionUrl are configured", () => {
    const mod = loadWith({
      NEXT_PUBLIC_SUPABASE_URL: "https://proj.supabase.co",
      NEXT_PUBLIC_SUPABASE_FUNCTION_URL: "https://explicit.example.com",
    });
    expect(() => mod.assertDashboardEnv()).not.toThrow();
  });

  it("does not throw when only the project URL is set (function URL is derived)", () => {
    const mod = loadWith({ NEXT_PUBLIC_SUPABASE_URL: "https://proj.supabase.co" });
    expect(() => mod.assertDashboardEnv()).not.toThrow();
  });

  it("throws a specific message when NEXT_PUBLIC_SUPABASE_URL is missing", () => {
    const mod = loadWith({});
    expect(() => mod.assertDashboardEnv()).toThrow(
      "NEXT_PUBLIC_SUPABASE_URL is not configured.",
    );
  });

  it("throws about the function URL when the project URL is invalid (so derivation yields '')", () => {
    // supabaseUrl is the invalid string (truthy, passes its check); derived
    // function URL is '' so the SECOND assertion fails.
    const mod = loadWith({ NEXT_PUBLIC_SUPABASE_URL: "not a url" });
    expect(() => mod.assertDashboardEnv()).toThrow(
      "NEXT_PUBLIC_SUPABASE_FUNCTION_URL is not configured.",
    );
  });
});
