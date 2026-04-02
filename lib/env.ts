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

const publicSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

export const env = {
  dashboardFunctionName:
    process.env.NEXT_PUBLIC_DASHBOARD_FUNCTION_NAME ?? "drop-admin",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  supabaseFunctionUrl:
    process.env.NEXT_PUBLIC_SUPABASE_FUNCTION_URL ??
    deriveFunctionUrl(publicSupabaseUrl),
  supabaseUrl: publicSupabaseUrl,
};

export const assertDashboardEnv = () => {
  getRequiredEnv("NEXT_PUBLIC_SUPABASE_URL", env.supabaseUrl);
  getRequiredEnv("NEXT_PUBLIC_SUPABASE_FUNCTION_URL", env.supabaseFunctionUrl);
};
