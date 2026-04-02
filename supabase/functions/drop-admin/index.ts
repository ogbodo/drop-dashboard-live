import {
  cancelRideAsAdmin,
  cancelScheduledRideAsAdmin,
  createCancelReason,
  createPartner,
  createServiceType,
  getCustomersData,
  getDriversData,
  getFinanceData,
  getLiveOpsData,
  getOverviewData,
  getPartnersData,
  getRidesData,
  getScheduledRidesData,
  getSettingsData,
  getSupportData,
  sendPushNotification,
  updateAppConfig,
  updateCancelReason,
  updateCustomer,
  updateDispatchSettings,
  updateDriver,
  updatePartner,
  updatePartnerCommission,
  updateReport,
  updateRideFollowUp,
  updateServiceType,
} from "../../../lib/dashboard-data.js";
import {
  createSessionToken,
  randomToken,
  verifyPassword,
  verifySessionToken,
} from "../_shared/admin-auth.ts";
import { createSupabaseAdmin } from "../_shared/supabase-admin.ts";

type AnyRecord = Record<string, any>;

type DashboardActionName =
  | "cancel_ride"
  | "update_ride_follow_up"
  | "update_driver"
  | "update_customer"
  | "cancel_scheduled_ride"
  | "create_partner"
  | "update_partner"
  | "update_partner_commission"
  | "update_report"
  | "send_push_notification"
  | "update_app_config"
  | "update_dispatch_settings"
  | "update_service_type"
  | "create_service_type"
  | "update_cancel_reason"
  | "create_cancel_reason";

type DashboardSectionName =
  | "overview"
  | "live-ops"
  | "rides"
  | "drivers"
  | "customers"
  | "scheduled-rides"
  | "finance"
  | "partners"
  | "support"
  | "settings";

type JsonError = Error & {
  payload?: unknown;
  status?: number;
};

type DashboardActionRequest = {
  action?: DashboardActionName;
  payload?: AnyRecord;
};

const FUNCTION_NAME = "drop-admin";
const jsonHeaders = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json",
};

const env = {
  dashboardAdminPasswordHash: Deno.env.get("DASHBOARD_ADMIN_PASSWORD_HASH") ?? "",
  dashboardAdminUsername: Deno.env.get("DASHBOARD_ADMIN_USERNAME") ?? "",
  dashboardSessionSecret: Deno.env.get("DASHBOARD_SESSION_SECRET") ?? "",
  dispatchAdminToken: Deno.env.get("DISPATCH_ADMIN_TOKEN") ?? "",
  supabaseServiceRoleKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  supabaseUrl: Deno.env.get("SUPABASE_URL") ?? "",
};

const supabaseAdmin = createSupabaseAdmin(
  env.supabaseUrl,
  env.supabaseServiceRoleKey,
);

const dashboardConfig = {
  dispatchAdminToken: env.dispatchAdminToken,
};

const globalStore = globalThis as typeof globalThis & {
  __dropDashboardRateLimit__?: Map<string, { count: number; resetAt: number }>;
};
const rateLimitStore = globalStore.__dropDashboardRateLimit__ ?? new Map();
globalStore.__dropDashboardRateLimit__ = rateLimitStore;

const errorWithStatus = (message: string, status: number, payload?: unknown) => {
  const error = new Error(message) as JsonError;
  error.status = status;
  error.payload = payload;
  return error;
};

const jsonSuccess = (data: unknown, status = 200) =>
  new Response(JSON.stringify({ data }), {
    headers: jsonHeaders,
    status,
  });

const jsonError = (error: unknown, fallbackStatus = 500) => {
  const normalized = error as JsonError;
  const status =
    typeof normalized?.status === "number" ? normalized.status : fallbackStatus;

  return new Response(
    JSON.stringify({
      details: normalized?.payload ?? null,
      error:
        error instanceof Error ? error.message : "An unexpected server error occurred.",
    }),
    {
      headers: jsonHeaders,
      status,
    },
  );
};

const assertConfigured = () => {
  if (!env.supabaseUrl || !env.supabaseServiceRoleKey) {
    throw errorWithStatus(
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured in edge function secrets.",
      500,
    );
  }

  if (
    !env.dashboardAdminUsername ||
    !env.dashboardAdminPasswordHash ||
    !env.dashboardSessionSecret
  ) {
    throw errorWithStatus(
      "Dashboard auth secrets must be configured in edge function secrets.",
      500,
    );
  }
};

const enforceRateLimit = (
  request: Request,
  key: string,
  limit: number,
  windowMs: number,
) => {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";
  const bucketKey = `${key}:${ip}`;
  const now = Date.now();
  const current = rateLimitStore.get(bucketKey);

  if (!current || current.resetAt <= now) {
    rateLimitStore.set(bucketKey, {
      count: 1,
      resetAt: now + windowMs,
    });
    return;
  }

  if (current.count >= limit) {
    throw errorWithStatus("Too many requests. Please slow down.", 429);
  }

  current.count += 1;
  rateLimitStore.set(bucketKey, current);
};

const parseJsonBody = async <T = AnyRecord>(request: Request) => {
  try {
    return (await request.json()) as T;
  } catch {
    return {} as T;
  }
};

const getRouteSegments = (request: Request) => {
  const segments = new URL(request.url).pathname.split("/").filter(Boolean);
  const functionIndex = segments.lastIndexOf(FUNCTION_NAME);
  return functionIndex >= 0 ? segments.slice(functionIndex + 1) : segments;
};

const requireSession = async (request: Request, options: { requireCsrf?: boolean } = {}) => {
  assertConfigured();

  const token = request.headers.get("x-admin-session") ?? "";
  if (!token) {
    throw errorWithStatus("Unauthorized", 401);
  }

  const session = await verifySessionToken(
    token,
    env.dashboardSessionSecret,
    env.dashboardAdminUsername,
  );

  if (!session) {
    throw errorWithStatus("Unauthorized", 401);
  }

  if (options.requireCsrf) {
    const csrfHeader = request.headers.get("x-csrf-token") ?? "";
    if (!csrfHeader || csrfHeader !== session.csrfToken) {
      throw errorWithStatus("Invalid CSRF token.", 403);
    }
  }

  return session;
};

const sectionHandlers: Record<
  DashboardSectionName,
  (request: Request) => Promise<unknown>
> = {
  customers: async (request) =>
    getCustomersData(supabaseAdmin, {
      limit: new URL(request.url).searchParams.get("limit"),
      search: new URL(request.url).searchParams.get("search"),
    }),
  drivers: async (request) =>
    getDriversData(supabaseAdmin, {
      limit: new URL(request.url).searchParams.get("limit"),
      search: new URL(request.url).searchParams.get("search"),
    }),
  finance: async () => getFinanceData(supabaseAdmin),
  "live-ops": async () => getLiveOpsData(supabaseAdmin),
  overview: async () => getOverviewData(supabaseAdmin, dashboardConfig),
  partners: async (request) =>
    getPartnersData(supabaseAdmin, {
      limit: new URL(request.url).searchParams.get("limit"),
      search: new URL(request.url).searchParams.get("search"),
    }),
  rides: async (request) =>
    getRidesData(supabaseAdmin, {
      limit: new URL(request.url).searchParams.get("limit"),
      paymentStatus: new URL(request.url).searchParams.get("paymentStatus"),
      search: new URL(request.url).searchParams.get("search"),
      serviceTypeId: new URL(request.url).searchParams.get("serviceTypeId"),
      status: new URL(request.url).searchParams.get("status"),
    }),
  "scheduled-rides": async (request) =>
    getScheduledRidesData(supabaseAdmin, {
      limit: new URL(request.url).searchParams.get("limit"),
      search: new URL(request.url).searchParams.get("search"),
      status: new URL(request.url).searchParams.get("status"),
    }),
  settings: async () => getSettingsData(supabaseAdmin, dashboardConfig),
  support: async (request) =>
    getSupportData(supabaseAdmin, {
      limit: new URL(request.url).searchParams.get("limit"),
      search: new URL(request.url).searchParams.get("search"),
    }),
};

const handleLogin = async (request: Request) => {
  assertConfigured();
  enforceRateLimit(request, "edge-auth-login", 5, 1000 * 60 * 10);

  const payload = await parseJsonBody<{ password?: string; username?: string }>(request);
  const username = String(payload.username || "").trim();
  const password = String(payload.password || "");

  if (!username || !password) {
    throw errorWithStatus("Username and password are required.", 400);
  }

  if (username !== env.dashboardAdminUsername) {
    throw errorWithStatus("Invalid admin credentials.", 401);
  }

  const isValidPassword = await verifyPassword(password, env.dashboardAdminPasswordHash);
  if (!isValidPassword) {
    throw errorWithStatus("Invalid admin credentials.", 401);
  }

  const csrfToken = randomToken();
  const session = await createSessionToken(
    username,
    csrfToken,
    env.dashboardSessionSecret,
  );

  return jsonSuccess({
    authenticated: true,
    csrfToken,
    expiresAt: session.expiresAt,
    sessionToken: session.token,
    username,
  });
};

const handleSession = async (request: Request) => {
  const session = await requireSession(request);

  return jsonSuccess({
    authenticated: true,
    expiresAt: session.exp,
    username: session.username,
  });
};

const handleSection = async (request: Request, section: string) => {
  await requireSession(request);
  const handler = sectionHandlers[section as DashboardSectionName];

  if (!handler) {
    throw errorWithStatus("Unknown dashboard section.", 404);
  }

  return jsonSuccess(await handler(request));
};

const handleAction = async (request: Request) => {
  enforceRateLimit(request, "edge-admin-actions", 120, 1000 * 60);
  await requireSession(request, { requireCsrf: true });

  const { action, payload = {} } = await parseJsonBody<DashboardActionRequest>(request);

  switch (action) {
    case "cancel_ride":
      return jsonSuccess(
        await cancelRideAsAdmin(supabaseAdmin, String(payload.rideId || ""), payload),
      );
    case "update_ride_follow_up":
      return jsonSuccess(
        await updateRideFollowUp(
          supabaseAdmin,
          String(payload.rideId || ""),
          payload,
        ),
      );
    case "update_driver":
      return jsonSuccess(
        await updateDriver(supabaseAdmin, String(payload.driverId || ""), payload),
      );
    case "update_customer":
      return jsonSuccess(
        await updateCustomer(supabaseAdmin, String(payload.customerId || ""), payload),
      );
    case "cancel_scheduled_ride":
      return jsonSuccess(
        await cancelScheduledRideAsAdmin(
          supabaseAdmin,
          String(payload.scheduledRideId || ""),
        ),
      );
    case "create_partner":
      return jsonSuccess(await createPartner(supabaseAdmin, payload));
    case "update_partner":
      return jsonSuccess(
        await updatePartner(supabaseAdmin, String(payload.partnerId || ""), payload),
      );
    case "update_partner_commission":
      return jsonSuccess(
        await updatePartnerCommission(
          supabaseAdmin,
          String(payload.commissionId || ""),
          payload,
        ),
      );
    case "update_report":
      return jsonSuccess(
        await updateReport(supabaseAdmin, String(payload.reportId || ""), payload),
      );
    case "send_push_notification":
      return jsonSuccess(await sendPushNotification(supabaseAdmin, payload));
    case "update_app_config":
      return jsonSuccess(
        await updateAppConfig(supabaseAdmin, String(payload.key || ""), payload),
      );
    case "update_dispatch_settings":
      return jsonSuccess(
        await updateDispatchSettings(supabaseAdmin, dashboardConfig, payload),
      );
    case "update_service_type":
      return jsonSuccess(
        await updateServiceType(
          supabaseAdmin,
          String(payload.serviceTypeId || ""),
          payload,
        ),
      );
    case "create_service_type":
      return jsonSuccess(await createServiceType(supabaseAdmin, payload));
    case "update_cancel_reason":
      return jsonSuccess(
        await updateCancelReason(
          supabaseAdmin,
          String(payload.cancelReasonId || ""),
          payload,
        ),
      );
    case "create_cancel_reason":
      return jsonSuccess(await createCancelReason(supabaseAdmin, payload));
    default:
      throw errorWithStatus("Unsupported admin action.", 400);
  }
};

Deno.serve(async (request) => {
  try {
    const [scope, target] = getRouteSegments(request);

    if (request.method === "POST" && scope === "auth" && target === "login") {
      return await handleLogin(request);
    }

    if (request.method === "GET" && scope === "auth" && target === "session") {
      return await handleSession(request);
    }

    if (request.method === "GET" && scope === "sections" && target) {
      return await handleSection(request, target);
    }

    if (request.method === "POST" && scope === "actions") {
      return await handleAction(request);
    }

    throw errorWithStatus("Not found.", 404);
  } catch (error) {
    return jsonError(error);
  }
});
