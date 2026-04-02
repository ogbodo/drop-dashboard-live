import {
  cancelRideAsAdmin,
  cancelScheduledRideAsAdmin,
  createCancelReason,
  createPartner,
  createServiceType,
  getAccessData,
  getCustomersData,
  getDriversData,
  getFinanceData,
  getLiveOpsData,
  getOverviewData,
  getPartnersData,
  getPartnerWorkspaceData,
  getRidesData,
  getScheduledRidesData,
  getSettingsData,
  getSupportData,
  markSupportThreadSeen,
  sendSupportReply,
  sendPushNotification,
  updateAppConfig,
  updateCancelReason,
  updateCustomer,
  updateDispatchSettings,
  updateDriver,
  updatePartner,
  updatePartnerBranding,
  updatePartnerCommission,
  updateReport,
  updateRideFollowUp,
  updateServiceType,
} from "../../../lib/dashboard-data.js";
import {
  createSessionToken,
  hashPassword,
  normalizeUsername,
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
  | "update_partner_branding"
  | "update_partner_commission"
  | "update_report"
  | "send_push_notification"
  | "update_app_config"
  | "update_dispatch_settings"
  | "update_service_type"
  | "create_service_type"
  | "update_cancel_reason"
  | "create_cancel_reason"
  | "create_admin"
  | "create_partner_access"
  | "reset_password"
  | "send_support_reply"
  | "mark_support_thread_seen";

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
  | "settings"
  | "access"
  | "workspace";

type DashboardRole = "admin" | "partner";

type DashboardSession = {
  accountId?: string | null;
  csrfToken: string;
  displayName?: string | null;
  exp: number;
  iat: number;
  nonce: string;
  partnerId?: string | null;
  role: DashboardRole;
  username: string;
};

type DashboardAccount = {
  created_at?: string;
  created_by?: string | null;
  display_name?: string | null;
  id: string;
  is_active?: boolean;
  last_login_at?: string | null;
  metadata?: AnyRecord | null;
  partner_id?: string | null;
  password_hash: string;
  password_updated_at?: string | null;
  role: DashboardRole;
  updated_at?: string;
  username: string;
};

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

const adminSections = new Set<DashboardSectionName>([
  "overview",
  "live-ops",
  "rides",
  "drivers",
  "customers",
  "scheduled-rides",
  "finance",
  "partners",
  "support",
  "settings",
  "access",
]);
const partnerSections = new Set<DashboardSectionName>(["workspace"]);

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

  if (!env.dashboardSessionSecret) {
    throw errorWithStatus(
      "DASHBOARD_SESSION_SECRET must be configured in edge function secrets.",
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

const isDashboardAccountsError = (error: unknown) => {
  const message = String((error as Error | undefined)?.message || "");
  const payload = (error as JsonError | undefined)?.payload;
  const payloadString =
    payload && typeof payload === "object" ? JSON.stringify(payload) : String(payload || "");

  return (
    message.includes("dashboard_accounts") ||
    payloadString.includes("dashboard_accounts") ||
    payloadString.includes("PGRST205")
  );
};

const sanitizeAccount = (account: DashboardAccount | null) =>
  account
    ? {
        accountId: account.id,
        createdAt: account.created_at || null,
        displayName: account.display_name || null,
        isActive: account.is_active !== false,
        lastLoginAt: account.last_login_at || null,
        partnerId: account.partner_id || null,
        passwordUpdatedAt: account.password_updated_at || null,
        role: account.role,
        updatedAt: account.updated_at || null,
        username: account.username,
      }
    : null;

const toSessionIdentity = (
  account: DashboardAccount | null,
  fallback?: Partial<DashboardAccount>,
) => ({
  accountId: account?.id || fallback?.id || null,
  displayName: account?.display_name || fallback?.display_name || null,
  partnerId: account?.partner_id || fallback?.partner_id || null,
  role: (account?.role || fallback?.role || "admin") as DashboardRole,
  username:
    account?.username ||
    normalizeUsername(String(fallback?.username || env.dashboardAdminUsername || "")),
});

const getDashboardAccountByUsername = async (username: string) => {
  try {
    return (await supabaseAdmin.selectOne<DashboardAccount>("dashboard_accounts", {
      is_active: "eq.true",
      select:
        "id,username,display_name,role,partner_id,password_hash,is_active,last_login_at,password_updated_at,created_at,updated_at,created_by,metadata",
      username: `eq.${username}`,
    })) as DashboardAccount | null;
  } catch (error) {
    if (isDashboardAccountsError(error)) {
      return null;
    }
    throw error;
  }
};

const getDashboardAccountById = async (accountId: string) => {
  try {
    return (await supabaseAdmin.selectOne<DashboardAccount>("dashboard_accounts", {
      id: `eq.${accountId}`,
      select:
        "id,username,display_name,role,partner_id,password_hash,is_active,last_login_at,password_updated_at,created_at,updated_at,created_by,metadata",
    })) as DashboardAccount | null;
  } catch (error) {
    if (isDashboardAccountsError(error)) {
      return null;
    }
    throw error;
  }
};

const updateDashboardAccount = async (accountId: string, payload: AnyRecord) => {
  try {
    const rows = await supabaseAdmin.update<DashboardAccount>(
      "dashboard_accounts",
      {
        ...payload,
        updated_at: new Date().toISOString(),
      },
      {
        id: `eq.${accountId}`,
        select:
          "id,username,display_name,role,partner_id,password_hash,is_active,last_login_at,password_updated_at,created_at,updated_at,created_by,metadata",
      },
    );

    return (rows[0] as DashboardAccount | undefined) ?? null;
  } catch (error) {
    if (isDashboardAccountsError(error)) {
      throw errorWithStatus(
        "Dashboard account storage is not ready. Apply the dashboard account migration first.",
        503,
      );
    }
    throw error;
  }
};

const ensureAccountStorageReady = async () => {
  try {
    await supabaseAdmin.select("dashboard_accounts", {
      limit: 1,
      select: "id",
    });
  } catch (error) {
    if (isDashboardAccountsError(error)) {
      throw errorWithStatus(
        "Dashboard account storage is not ready. Apply the dashboard account migration first.",
        503,
      );
    }
    throw error;
  }
};

const ensureBootstrapAdminAccount = async () => {
  const username = normalizeUsername(env.dashboardAdminUsername);
  if (!username || !env.dashboardAdminPasswordHash) {
    return null;
  }

  const existing = await getDashboardAccountByUsername(username);
  if (existing) {
    return existing;
  }

  try {
    const inserted = await supabaseAdmin.insert<DashboardAccount>("dashboard_accounts", {
      display_name: "Drop Team Admin",
      metadata: {
        bootstrap: true,
      },
      partner_id: null,
      password_hash: env.dashboardAdminPasswordHash,
      role: "admin",
      username,
    });

    return (inserted[0] as DashboardAccount | undefined) ?? null;
  } catch (error) {
    if (isDashboardAccountsError(error)) {
      return null;
    }

    const account = await getDashboardAccountByUsername(username);
    if (account) {
      return account;
    }

    throw error;
  }
};

const touchLastLogin = async (accountId?: string | null) => {
  if (!accountId) {
    return;
  }

  try {
    await updateDashboardAccount(accountId, {
      last_login_at: new Date().toISOString(),
    });
  } catch {
    // Keep auth flow resilient if audit fields fail.
  }
};

const createAuthenticatedSession = async (
  account: DashboardAccount | null,
  fallback?: Partial<DashboardAccount>,
) => {
  const csrfToken = randomToken();
  const identity = toSessionIdentity(account, fallback);
  const session = await createSessionToken(
    identity,
    csrfToken,
    env.dashboardSessionSecret,
  );

  await touchLastLogin(account?.id || fallback?.id || null);

  return jsonSuccess({
    accountId: identity.accountId,
    authenticated: true,
    csrfToken,
    displayName: identity.displayName,
    expiresAt: session.expiresAt,
    partnerId: identity.partnerId,
    role: identity.role,
    sessionToken: session.token,
    username: identity.username,
  });
};

const requireSession = async (
  request: Request,
  options: { requireCsrf?: boolean } = {},
) => {
  assertConfigured();

  const token = request.headers.get("x-admin-session") ?? "";
  if (!token) {
    throw errorWithStatus("Unauthorized", 401);
  }

  const session = (await verifySessionToken(
    token,
    env.dashboardSessionSecret,
  )) as DashboardSession | null;

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

const requireRole = (session: DashboardSession, role: DashboardRole) => {
  if (session.role !== role) {
    throw errorWithStatus("You do not have permission for that action.", 403);
  }
};

const requireAdmin = (session: DashboardSession) => requireRole(session, "admin");
const requirePartner = (session: DashboardSession) => requireRole(session, "partner");

const adminSectionHandlers: Record<
  Exclude<DashboardSectionName, "workspace">,
  (request: Request, session: DashboardSession) => Promise<unknown>
> = {
  access: async () => getAccessData(supabaseAdmin),
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
  support: async (request, session) =>
    getSupportData(supabaseAdmin, {
      limit: new URL(request.url).searchParams.get("limit"),
      search: new URL(request.url).searchParams.get("search"),
    }, {
      accountId: session.accountId || null,
    }),
};

const handleLogin = async (request: Request) => {
  assertConfigured();
  enforceRateLimit(request, "edge-auth-login", 5, 1000 * 60 * 10);

  const payload = await parseJsonBody<{ password?: string; username?: string }>(request);
  const username = normalizeUsername(String(payload.username || ""));
  const password = String(payload.password || "");

  if (!username || !password) {
    throw errorWithStatus("Username and password are required.", 400);
  }

  const existingAccount = await getDashboardAccountByUsername(username);
  if (existingAccount) {
    const isValidPassword = await verifyPassword(password, existingAccount.password_hash);
    if (!isValidPassword) {
      throw errorWithStatus("Invalid credentials.", 401);
    }

    return createAuthenticatedSession(existingAccount);
  }

  const bootstrapUsername = normalizeUsername(env.dashboardAdminUsername);
  if (!bootstrapUsername || username !== bootstrapUsername) {
    throw errorWithStatus("Invalid credentials.", 401);
  }

  if (!env.dashboardAdminPasswordHash) {
    throw errorWithStatus("Bootstrap admin credentials are not configured.", 500);
  }

  const isValidPassword = await verifyPassword(password, env.dashboardAdminPasswordHash);
  if (!isValidPassword) {
    throw errorWithStatus("Invalid credentials.", 401);
  }

  const bootstrapAccount = await ensureBootstrapAdminAccount();
  return createAuthenticatedSession(bootstrapAccount, {
    display_name: "Drop Team Admin",
    id: bootstrapAccount?.id || null,
    partner_id: null,
    role: "admin",
    username: bootstrapUsername,
  });
};

const handleSession = async (request: Request) => {
  const session = await requireSession(request);

  return jsonSuccess({
    accountId: session.accountId || null,
    authenticated: true,
    displayName: session.displayName || null,
    expiresAt: session.exp,
    partnerId: session.partnerId || null,
    role: session.role,
    username: session.username,
  });
};

const handleSection = async (request: Request, section: string) => {
  const session = await requireSession(request);
  const normalizedSection = section as DashboardSectionName;

  if (session.role === "admin") {
    if (!adminSections.has(normalizedSection)) {
      throw errorWithStatus("Unknown dashboard section.", 404);
    }

    const handler = adminSectionHandlers[normalizedSection as Exclude<
      DashboardSectionName,
      "workspace"
    >];
    return jsonSuccess(await handler(request, session));
  }

  if (!partnerSections.has(normalizedSection)) {
    throw errorWithStatus("Partners only have access to their workspace.", 403);
  }

  if (!session.partnerId) {
    throw errorWithStatus("This partner account is not linked to a partner record.", 403);
  }

  const workspace = await getPartnerWorkspaceData(supabaseAdmin, {
    partnerId: session.partnerId,
  });

  if (!workspace) {
    throw errorWithStatus("Partner workspace could not be loaded.", 404);
  }

  return jsonSuccess(workspace);
};

const createAdminAccount = async (session: DashboardSession, payload: AnyRecord) => {
  requireAdmin(session);
  await ensureAccountStorageReady();

  const username = normalizeUsername(String(payload.username || ""));
  const password = String(payload.password || "");
  const displayName = String(payload.displayName || "").trim();

  if (!username || !password) {
    throw errorWithStatus("Username and password are required.", 400);
  }

  const existing = await getDashboardAccountByUsername(username);
  if (existing) {
    throw errorWithStatus("That username is already in use.", 409);
  }

  const passwordHash = await hashPassword(password);
  const rows = await supabaseAdmin.insert<DashboardAccount>("dashboard_accounts", {
    created_by: session.accountId || null,
    display_name: displayName || null,
    metadata: {
      invitedBy: session.username,
    },
    partner_id: null,
    password_hash: passwordHash,
    role: "admin",
    username,
  });

  return sanitizeAccount((rows[0] as DashboardAccount | undefined) ?? null);
};

const createPartnerAccessAccount = async (
  session: DashboardSession,
  payload: AnyRecord,
) => {
  requireAdmin(session);
  await ensureAccountStorageReady();

  const partnerId = String(payload.partnerId || "");
  const username = normalizeUsername(String(payload.username || ""));
  const password = String(payload.password || "");
  const displayName = String(payload.displayName || "").trim();

  if (!partnerId || !username || !password) {
    throw errorWithStatus("Partner, username, and password are required.", 400);
  }

  const partner = await supabaseAdmin.selectOne("partners", {
    id: `eq.${partnerId}`,
    select: "id,name,slug,status,contact_name,contact_email,contact_phone",
  });

  if (!partner) {
    throw errorWithStatus("Partner record not found.", 404);
  }

  const usernameMatch = await getDashboardAccountByUsername(username);
  if (usernameMatch) {
    throw errorWithStatus("That username is already in use.", 409);
  }

  const existingPartnerAccount = await supabaseAdmin.selectOne<DashboardAccount>(
    "dashboard_accounts",
    {
      partner_id: `eq.${partnerId}`,
      role: "eq.partner",
      select:
        "id,username,display_name,role,partner_id,password_hash,is_active,last_login_at,password_updated_at,created_at,updated_at,created_by,metadata",
    },
  );

  if (existingPartnerAccount) {
    throw errorWithStatus("This partner already has portal access.", 409);
  }

  const passwordHash = await hashPassword(password);
  const rows = await supabaseAdmin.insert<DashboardAccount>("dashboard_accounts", {
    created_by: session.accountId || null,
    display_name: displayName || partner.contact_name || partner.name || null,
    metadata: {
      createdByRole: "admin",
      partnerName: partner.name,
    },
    partner_id: partnerId,
    password_hash: passwordHash,
    role: "partner",
    username,
  });

  return sanitizeAccount((rows[0] as DashboardAccount | undefined) ?? null);
};

const resetPassword = async (session: DashboardSession, payload: AnyRecord) => {
  await ensureAccountStorageReady();

  const newPassword = String(payload.newPassword || "");
  if (!newPassword) {
    throw errorWithStatus("A new password is required.", 400);
  }

  const targetAccountId =
    payload.accountId && payload.accountId !== session.accountId
      ? String(payload.accountId)
      : null;

  if (targetAccountId) {
    requireAdmin(session);

    const targetAccount = await getDashboardAccountById(targetAccountId);
    if (!targetAccount) {
      throw errorWithStatus("Target account not found.", 404);
    }

    const updated = await updateDashboardAccount(targetAccount.id, {
      password_hash: await hashPassword(newPassword),
      password_updated_at: new Date().toISOString(),
    });

    return sanitizeAccount(updated);
  }

  const currentPassword = String(payload.currentPassword || "");
  if (!currentPassword) {
    throw errorWithStatus("Current password is required.", 400);
  }

  let account =
    session.accountId && String(session.accountId)
      ? await getDashboardAccountById(String(session.accountId))
      : null;

  if (!account && session.role === "admin") {
    const bootstrapUsername = normalizeUsername(env.dashboardAdminUsername);
    if (
      session.username === bootstrapUsername &&
      env.dashboardAdminPasswordHash &&
      (await verifyPassword(currentPassword, env.dashboardAdminPasswordHash))
    ) {
      account = await ensureBootstrapAdminAccount();
    }
  }

  if (!account) {
    throw errorWithStatus(
      "This account could not be found. Sign in again or apply the dashboard account migration.",
      404,
    );
  }

  const isValidPassword = await verifyPassword(currentPassword, account.password_hash);
  if (!isValidPassword) {
    throw errorWithStatus("Current password is incorrect.", 401);
  }

  const updated = await updateDashboardAccount(account.id, {
    password_hash: await hashPassword(newPassword),
    password_updated_at: new Date().toISOString(),
  });

  return sanitizeAccount(updated);
};

const handleAction = async (request: Request) => {
  enforceRateLimit(request, "edge-admin-actions", 120, 1000 * 60);
  const session = await requireSession(request, { requireCsrf: true });
  const { action, payload = {} } = await parseJsonBody<DashboardActionRequest>(request);

  switch (action) {
    case "reset_password":
      return jsonSuccess(await resetPassword(session, payload));
    case "create_admin":
      return jsonSuccess(await createAdminAccount(session, payload));
    case "create_partner_access":
      return jsonSuccess(await createPartnerAccessAccount(session, payload));
    case "mark_support_thread_seen":
      return jsonSuccess(
        await markSupportThreadSeen(
          supabaseAdmin,
          session.accountId || null,
          String(payload.rideId || ""),
          payload.lastSeenMessageId,
        ),
      );
    case "send_support_reply":
      requireAdmin(session);
      return jsonSuccess(await sendSupportReply(supabaseAdmin, session, payload));
    case "cancel_ride":
      requireAdmin(session);
      return jsonSuccess(
        await cancelRideAsAdmin(supabaseAdmin, String(payload.rideId || ""), payload),
      );
    case "update_ride_follow_up":
      requireAdmin(session);
      return jsonSuccess(
        await updateRideFollowUp(
          supabaseAdmin,
          String(payload.rideId || ""),
          payload,
        ),
      );
    case "update_driver":
      requireAdmin(session);
      return jsonSuccess(
        await updateDriver(supabaseAdmin, String(payload.driverId || ""), payload),
      );
    case "update_customer":
      requireAdmin(session);
      return jsonSuccess(
        await updateCustomer(supabaseAdmin, String(payload.customerId || ""), payload),
      );
    case "cancel_scheduled_ride":
      requireAdmin(session);
      return jsonSuccess(
        await cancelScheduledRideAsAdmin(
          supabaseAdmin,
          String(payload.scheduledRideId || ""),
        ),
      );
    case "create_partner":
      requireAdmin(session);
      return jsonSuccess(await createPartner(supabaseAdmin, payload));
    case "update_partner":
      requireAdmin(session);
      return jsonSuccess(
        await updatePartner(supabaseAdmin, String(payload.partnerId || ""), payload),
      );
    case "update_partner_branding":
      requirePartner(session);
      if (!session.partnerId) {
        throw errorWithStatus("This partner account is not linked to a partner record.", 403);
      }
      return jsonSuccess(
        await updatePartnerBranding(supabaseAdmin, String(session.partnerId), payload),
      );
    case "update_partner_commission":
      requireAdmin(session);
      return jsonSuccess(
        await updatePartnerCommission(
          supabaseAdmin,
          String(payload.commissionId || ""),
          payload,
        ),
      );
    case "update_report":
      requireAdmin(session);
      return jsonSuccess(
        await updateReport(supabaseAdmin, String(payload.reportId || ""), payload),
      );
    case "send_push_notification":
      requireAdmin(session);
      return jsonSuccess(await sendPushNotification(supabaseAdmin, payload));
    case "update_app_config":
      requireAdmin(session);
      return jsonSuccess(
        await updateAppConfig(supabaseAdmin, String(payload.key || ""), payload),
      );
    case "update_dispatch_settings":
      requireAdmin(session);
      return jsonSuccess(
        await updateDispatchSettings(supabaseAdmin, dashboardConfig, payload),
      );
    case "update_service_type":
      requireAdmin(session);
      return jsonSuccess(
        await updateServiceType(
          supabaseAdmin,
          String(payload.serviceTypeId || ""),
          payload,
        ),
      );
    case "create_service_type":
      requireAdmin(session);
      return jsonSuccess(await createServiceType(supabaseAdmin, payload));
    case "update_cancel_reason":
      requireAdmin(session);
      return jsonSuccess(
        await updateCancelReason(
          supabaseAdmin,
          String(payload.cancelReasonId || ""),
          payload,
        ),
      );
    case "create_cancel_reason":
      requireAdmin(session);
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
