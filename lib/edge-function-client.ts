import { env } from "@/lib/env";
import type { AnyRecord } from "@/lib/types";

type EdgeRequestOptions = {
  body?: unknown;
  headers?: Record<string, string>;
  method?: string;
  searchParams?: URLSearchParams;
};

type EdgePayload<T = unknown> = {
  data?: T;
  details?: unknown;
  error?: string;
};

const withFunctionBaseUrl = (pathname: string, searchParams?: URLSearchParams) => {
  if (!env.supabaseFunctionUrl || !env.dashboardFunctionName) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_FUNCTION_URL and NEXT_PUBLIC_DASHBOARD_FUNCTION_NAME must be configured.",
    );
  }

  const baseUrl = env.supabaseFunctionUrl.replace(/\/$/, "");
  const normalizedPath = pathname.replace(/^\/+/, "");
  const url = new URL(`${baseUrl}/${env.dashboardFunctionName}/${normalizedPath}`);

  if (searchParams) {
    searchParams.forEach((value, key) => {
      url.searchParams.set(key, value);
    });
  }

  return url;
};

export async function invokeDashboardEdge<T = unknown>(
  pathname: string,
  options: EdgeRequestOptions = {},
) {
  const url = withFunctionBaseUrl(pathname, options.searchParams);
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...options.headers,
  };

  if (env.supabaseAnonKey) {
    headers.Authorization = `Bearer ${env.supabaseAnonKey}`;
    headers.apikey = env.supabaseAnonKey;
  }

  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(url.toString(), {
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    headers,
    method: options.method ?? "GET",
  });

  const payload = (await response.json().catch(() => ({}))) as EdgePayload<T>;

  if (!response.ok || payload.error) {
    const error = new Error(payload.error || "Edge function request failed.") as Error & {
      payload?: unknown;
      status?: number;
    };
    error.status = response.status;
    error.payload = payload.details ?? payload;
    throw error;
  }

  return payload.data as T;
}

export type { EdgePayload };
