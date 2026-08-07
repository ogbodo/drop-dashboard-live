const getRequiredEnv = (label: string, value: string) => {
  if (!value) {
    throw new Error(`${label} is not configured.`);
  }

  return value;
};

const deriveFunctionUrl = (supabaseUrl: string) => {
  if (!supabaseUrl) {
    return "";
  }

  try {
    const url = new URL(supabaseUrl);
    const hostname = url.hostname.replace(".supabase.co", ".functions.supabase.co");
    return `${url.protocol}//${hostname}`;
  } catch {
    return "";
  }
};

/**
 * One Supabase project per environment. `dev` is the integration backend, `prod`
 * is what real drivers and customers are on.
 *
 * Branch -> project is the same split the mobile apps use:
 *   dev branch  -> Vercel Preview  -> dev project
 *   main branch -> Vercel Prod     -> prod project
 */
export const SUPABASE_PROJECTS = {
  dev: "bvrfhqllbvqkocfkduhy",
  prod: "wumhtdhmntjvicsiiovu",
} as const;

export type SupabaseTarget = keyof typeof SUPABASE_PROJECTS | "unknown";

/** Which project a Supabase URL points at, by project ref in the hostname. */
export const resolveSupabaseTarget = (supabaseUrl: string): SupabaseTarget => {
  if (!supabaseUrl) return "unknown";
  const [, ref] = supabaseUrl.match(/https?:\/\/([a-z0-9]+)\./i) ?? [];
  if (!ref) return "unknown";
  if (ref === SUPABASE_PROJECTS.prod) return "prod";
  if (ref === SUPABASE_PROJECTS.dev) return "dev";
  return "unknown";
};

const publicSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

export const env = {
  dashboardFunctionName:
    process.env.NEXT_PUBLIC_DASHBOARD_FUNCTION_NAME ?? "drop-admin",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  supabaseFunctionUrl:
    process.env.NEXT_PUBLIC_SUPABASE_FUNCTION_URL ??
    deriveFunctionUrl(publicSupabaseUrl),
  supabaseUrl: publicSupabaseUrl,
  /** "prod" | "dev" | "unknown" — which backend this deployment actually talks to. */
  get supabaseTarget(): SupabaseTarget {
    return resolveSupabaseTarget(publicSupabaseUrl);
  },
};

/**
 * Guard against the deployment and the backend disagreeing.
 *
 * The two directions are not equally dangerous, so they are not treated equally:
 *
 * - A **preview** deployment wired to **prod** is refused outright. This is an
 *   admin portal: it verifies drivers, moves money and edits live config. A
 *   throwaway branch deploy must never be able to do that to production.
 *
 * - A **production** deployment wired to **dev** is a misconfiguration, but it
 *   cannot damage production data, so it warns rather than throws. Failing here
 *   would take the live dashboard down the moment this ships, before the Vercel
 *   Production variables have been pointed at the prod project.
 *
 * Set DASHBOARD_ALLOW_BACKEND_MISMATCH=true to bypass, e.g. to debug prod data
 * from a preview deploy deliberately.
 */
export const assertBackendMatchesDeployment = () => {
  if (process.env.DASHBOARD_ALLOW_BACKEND_MISMATCH === "true") return;

  // Set by Vercel to "production" | "preview" | "development".
  const deployment = process.env.VERCEL_ENV ?? process.env.NEXT_PUBLIC_VERCEL_ENV;
  if (!deployment) return; // running locally or somewhere without Vercel metadata

  const target = env.supabaseTarget;
  if (target === "unknown") return; // an unrecognised project is the caller's business

  if (deployment !== "production" && target === "prod") {
    throw new Error(
      `Refusing to start: this is a "${deployment}" deployment but ` +
        `NEXT_PUBLIC_SUPABASE_URL points at the PRODUCTION project ` +
        `(${SUPABASE_PROJECTS.prod}). The admin portal can verify drivers, move ` +
        `money and change live config, so preview builds must use the dev project ` +
        `(${SUPABASE_PROJECTS.dev}). Fix the Preview environment variables in ` +
        `Vercel, or set DASHBOARD_ALLOW_BACKEND_MISMATCH=true if this is deliberate.`,
    );
  }

  if (deployment === "production" && target === "dev") {
    console.error(
      `[dashboard] WARNING: production deployment is pointed at the DEV Supabase ` +
        `project (${SUPABASE_PROJECTS.dev}). Admins are managing dev data, not live ` +
        `data. Point the Vercel Production variables at ${SUPABASE_PROJECTS.prod}.`,
    );
  }
};

export const assertDashboardEnv = () => {
  getRequiredEnv("NEXT_PUBLIC_SUPABASE_URL", env.supabaseUrl);
  getRequiredEnv("NEXT_PUBLIC_SUPABASE_FUNCTION_URL", env.supabaseFunctionUrl);
  assertBackendMatchesDeployment();
};
