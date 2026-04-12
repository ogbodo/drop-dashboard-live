type RequestOptions = {
  body?: unknown;
  headers?: Record<string, string>;
  method?: string;
  params?: Record<string, unknown>;
  prefer?: string;
};

const parseContentRangeTotal = (value: string | null) => {
  if (!value || !value.includes("/")) {
    return 0;
  }

  const total = Number(value.split("/").pop());
  return Number.isFinite(total) ? total : 0;
};

const appendParams = (url: URL, params: Record<string, unknown> = {}) => {
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") {
      return;
    }

    if (Array.isArray(value)) {
      value.forEach((entry) => {
        if (entry !== undefined && entry !== null && entry !== "") {
          url.searchParams.append(key, String(entry));
        }
      });
      return;
    }

    url.searchParams.set(key, String(value));
  });
};

const normalizeErrorMessage = (payload: unknown, status: number) => {
  if (!payload) {
    return `Supabase request failed with status ${status}`;
  }

  if (typeof payload === "string") {
    return payload;
  }

  const record = payload as Record<string, unknown>;
  return (
    String(record.message || record.error_description || record.error || "").trim() ||
    `Supabase request failed with status ${status}`
  );
};

export const createSupabaseAdmin = (
  supabaseUrl: string,
  supabaseServiceRoleKey: string,
) => {
  const normalizedSupabaseUrl = supabaseUrl.replace(/\/+$/, "");
  const storageBaseUrl = `${normalizedSupabaseUrl}/storage/v1`;

  const request = async <T = unknown>(
    pathname: string,
    options: RequestOptions = {},
  ): Promise<{ data: T; response: Response }> => {
    if (!normalizedSupabaseUrl || !supabaseServiceRoleKey) {
      throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured.");
    }

    const url = new URL(pathname, normalizedSupabaseUrl);
    appendParams(url, options.params || {});

    const headers: Record<string, string> = {
      Accept: "application/json",
      Authorization: `Bearer ${supabaseServiceRoleKey}`,
      apikey: supabaseServiceRoleKey,
      ...options.headers,
    };

    if (options.prefer) {
      headers.Prefer = options.prefer;
    }

    if (options.body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    const response = await fetch(url.toString(), {
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      headers,
      method: options.method || "GET",
    });

    const text = await response.text();
    let payload: unknown = null;

    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = text;
      }
    }

    if (!response.ok) {
      const error = new Error(normalizeErrorMessage(payload, response.status)) as Error & {
        payload?: unknown;
        status?: number;
      };
      error.status = response.status;
      error.payload = payload;
      throw error;
    }

    return {
      data: payload as T,
      response,
    };
  };

  const rest = <T = unknown>(table: string, options: RequestOptions = {}) =>
    request<T>(`/rest/v1/${table}`, options);

  const admin = {
    count: async (table: string, params: Record<string, unknown> = {}) => {
      const { response } = await rest(table, {
        method: "GET",
        params: {
          limit: 1,
          select: "id",
          ...params,
        },
        prefer: "count=exact",
      });

      return parseContentRangeTotal(response.headers.get("content-range"));
    },
    insert: async <T = unknown>(
      table: string,
      body: unknown,
      params: Record<string, unknown> = {},
    ) => {
      const { data } = await rest<T[]>(table, {
        body,
        method: "POST",
        params,
        prefer: "return=representation",
      });
      return Array.isArray(data) ? data : [];
    },
    invokeFunction: async <T = unknown>(name: string, options: RequestOptions = {}) =>
      request<T>(`/functions/v1/${name}`, {
        ...options,
        method: options.method || "POST",
      }),
    request,
    rest,
    rpc: async <T = unknown>(
      name: string,
      body: unknown,
      options: RequestOptions = {},
    ) =>
      request<T>(`/rest/v1/rpc/${name}`, {
        ...options,
        body,
        method: options.method || "POST",
      }),
    select: async <T = unknown>(table: string, params: Record<string, unknown> = {}) => {
      const { data } = await rest<T[]>(table, {
        method: "GET",
        params,
      });
      return Array.isArray(data) ? data : [];
    },
    selectOne: async <T = unknown>(table: string, params: Record<string, unknown> = {}) => {
      const rows = await admin.select<T>(table, {
        ...params,
        limit: 1,
      });
      return rows[0] ?? null;
    },
    update: async <T = unknown>(
      table: string,
      body: unknown,
      params: Record<string, unknown> = {},
    ) => {
      const { data } = await rest<T[]>(table, {
        body,
        method: "PATCH",
        params,
        prefer: "return=representation",
      });
      return Array.isArray(data) ? data : [];
    },
    upsert: async <T = unknown>(
      table: string,
      body: unknown,
      params: Record<string, unknown> = {},
    ) => {
      const { data } = await rest<T[]>(table, {
        body,
        method: "POST",
        params,
        prefer: "resolution=merge-duplicates,return=representation",
      });
      return Array.isArray(data) ? data : [];
    },
    storageBaseUrl,
    supabaseUrl: normalizedSupabaseUrl,
  };

  return admin;
};
