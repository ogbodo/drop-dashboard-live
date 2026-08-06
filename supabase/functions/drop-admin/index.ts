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
  getSupportInboxData,
  grantDriverSubscription,
  markSupportThreadSeen,
  sendSupportInboxReply,
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
  | "grant_driver_subscription"
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
  | "create_staff"
  | "create_partner_access"
  | "reset_password"
  | "toggle_account_status"
  | "send_support_reply"
  | "send_support_inbox_reply"
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
  | "support-chat"
  | "settings"
  | "access"
  | "workspace";

type DashboardRole = "super_admin" | "admin" | "staff" | "partner";

type DashboardSession = {
  accountId?: string | null;
  csrfToken: string;
  displayName?: string | null;
  exp: number;
  iat: number;
  nonce: string;
  partnerId?: string | null;
  role: DashboardRole;
  roleTitle?: string | null;
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
  role_title?: string | null;
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

type FlutterwaveWebhookPayload = {
  data?: AnyRecord | null;
  event?: string | null;
  type?: string | null;
};

const FUNCTION_NAME = "drop-admin";
const DEFAULT_FLUTTERWAVE_BASE_URL = "https://api.flutterwave.com/v3";
const jsonHeaders = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json",
};

const env = {
  dashboardAdminPasswordHash: Deno.env.get("DASHBOARD_ADMIN_PASSWORD_HASH") ?? "",
  dashboardAdminUsername: Deno.env.get("DASHBOARD_ADMIN_USERNAME") ?? "",
  dashboardSessionSecret: Deno.env.get("DASHBOARD_SESSION_SECRET") ?? "",
  dispatchAdminToken: Deno.env.get("DISPATCH_ADMIN_TOKEN") ?? "",
  flutterwaveBaseUrl: Deno.env.get("FLUTTERWAVE_BASE_URL") ?? "",
  flutterwaveSecretHash: Deno.env.get("FLUTTERWAVE_SECRET_HASH") ?? "",
  flutterwaveSecretKey: Deno.env.get("FLUTTERWAVE_SECRET_KEY") ?? "",
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

const leadershipSections = new Set<DashboardSectionName>([
  "overview",
  "live-ops",
  "rides",
  "drivers",
  "customers",
  "scheduled-rides",
  "finance",
  "partners",
  "support",
  "support-chat",
  "settings",
  "access",
]);
const staffSections = new Set<DashboardSectionName>([
  "overview",
  "live-ops",
  "rides",
  "drivers",
  "customers",
  "scheduled-rides",
  "support",
]);
const partnerSections = new Set<DashboardSectionName>(["workspace"]);
const leadershipRoles = new Set<DashboardRole>(["super_admin", "admin"]);
const teamRoles = new Set<DashboardRole>(["super_admin", "admin", "staff"]);

const errorWithStatus = (message: string, status: number, payload?: unknown) => {
  const error = new Error(message) as JsonError;
  error.status = status;
  error.payload = payload;
  return error;
};

const defaultRoleTitle = (role: DashboardRole) => {
  switch (role) {
    case "super_admin":
      return "Super admin";
    case "admin":
      return "Admin";
    case "staff":
      return "Staff";
    case "partner":
      return "Partner";
    default:
      return "Team account";
  }
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

const webhookTextEncoder = new TextEncoder();

const timingSafeCompare = (left: string, right: string) => {
  if (left.length !== right.length) {
    return false;
  }

  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }

  return mismatch === 0;
};

const encodeBase64 = (value: ArrayBuffer) => {
  const bytes = new Uint8Array(value);
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
};

const createFlutterwaveSignature = async (rawBody: string, secretHash: string) => {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    webhookTextEncoder.encode(secretHash),
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["sign"],
  );

  return encodeBase64(
    await crypto.subtle.sign("HMAC", cryptoKey, webhookTextEncoder.encode(rawBody)),
  );
};

const verifyFlutterwaveWebhook = async (rawBody: string, headers: Headers) => {
  const secretHash = env.flutterwaveSecretHash.trim();
  if (!secretHash) {
    throw errorWithStatus(
      "FLUTTERWAVE_SECRET_HASH must be configured before webhooks can be accepted.",
      500,
    );
  }

  const directHash = headers.get("verif-hash")?.trim();
  if (directHash) {
    return timingSafeCompare(directHash, secretHash);
  }

  const signature = headers.get("flutterwave-signature")?.trim();
  if (!signature) {
    return false;
  }

  const computedSignature = await createFlutterwaveSignature(rawBody, secretHash);
  return timingSafeCompare(signature, computedSignature);
};

const normalizeFlutterwaveBaseUrl = () =>
  (() => {
    const baseUrl = (env.flutterwaveBaseUrl || DEFAULT_FLUTTERWAVE_BASE_URL).replace(/\/+$/, "");
    return /\/v3$/i.test(baseUrl) ? baseUrl : `${baseUrl}/v3`;
  })();

const flutterwaveUrl = (path: string) => {
  const baseUrl = normalizeFlutterwaveBaseUrl();
  const normalizedPath = path.replace(/^\/+/, "");
  return new URL(`${baseUrl}/${normalizedPath}`);
};

const requestFlutterwave = async <T = AnyRecord>(path: string) => {
  if (!env.flutterwaveSecretKey) {
    throw new Error("FLUTTERWAVE_SECRET_KEY must be configured.");
  }

  const response = await fetch(flutterwaveUrl(path).toString(), {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${env.flutterwaveSecretKey}`,
    },
    method: "GET",
  });
  const payload = await response.json().catch(() => null) as AnyRecord | null;

  if (!response.ok) {
    throw new Error(
      String(
        payload?.message ||
          payload?.error ||
          `Flutterwave request failed with status ${response.status}`,
      ),
    );
  }

  if (payload?.status && String(payload.status).toLowerCase() !== "success") {
    throw new Error(String(payload.message || "Flutterwave request failed."));
  }

  return (payload?.data || null) as T | null;
};

const verifyFlutterwaveTransaction = async (payload: AnyRecord = {}) => {
  const transactionId = payload.id || payload.transaction_id;
  const txRef = String(payload.tx_ref || "").trim();

  if (transactionId) {
    return requestFlutterwave<AnyRecord>(
      `transactions/${encodeURIComponent(String(transactionId))}/verify`,
    );
  }

  if (txRef) {
    return requestFlutterwave<AnyRecord>(
      `transactions/verify_by_reference?tx_ref=${encodeURIComponent(txRef)}`,
    );
  }

  return payload;
};

const getFlutterwaveTransferById = async (transferId: string | number) =>
  requestFlutterwave<AnyRecord>(`transfers/${encodeURIComponent(String(transferId))}`);

const parsePaymentReference = (paymentReference: unknown) => {
  const normalized = String(paymentReference || "").trim();
  if (!normalized) {
    return [];
  }

  return normalized.includes("__") ? normalized.split("__") : normalized.split("-");
};

const toSafeInteger = (value: unknown) => {
  const numericValue = Number(value ?? 0);
  return Number.isFinite(numericValue) ? Math.max(0, Math.round(numericValue)) : 0;
};

const normalizeFlutterwavePaymentStatus = (value: unknown) => {
  const normalized = String(value || "").trim().toLowerCase();

  if (["completed", "success", "successful"].includes(normalized)) {
    return "paid";
  }

  if (["cancelled", "canceled", "error", "failed"].includes(normalized)) {
    return "failed";
  }

  if (normalized === "refunded") {
    return "refunded";
  }

  if (["chargeback", "reversed"].includes(normalized)) {
    return "reversed";
  }

  return "pending";
};

const normalizeFlutterwaveAttemptStatus = (value: unknown) => {
  const normalized = String(value || "").trim().toLowerCase();

  if (["completed", "success", "successful"].includes(normalized)) {
    return "successful";
  }

  if (["cancelled", "canceled"].includes(normalized)) {
    return "cancelled";
  }

  if (["error", "failed"].includes(normalized)) {
    return "failed";
  }

  return "pending";
};

const updateFlutterwavePaymentAttempt = async (
  providerReference: unknown,
  updates: AnyRecord,
) => {
  const reference = String(providerReference || "").trim();

  if (!reference) {
    return;
  }

  try {
    await supabaseAdmin.update(
      "payment_attempts",
      updates,
      {
        provider: "eq.flutterwave",
        provider_reference: `eq.${reference}`,
        select: "id",
      },
    );
  } catch (error) {
    console.error("flutterwave-payment-attempt-update-failed", {
      message: error instanceof Error ? error.message : "unknown error",
      providerReference: reference,
      status: updates.status,
    });
  }
};

const normalizeFlutterwavePaymentMethod = (value: unknown) => {
  const normalized = String(value || "").trim().toLowerCase();

  if (["account", "account_transfer", "bank_transfer", "transfer", "ussd"].includes(normalized)) {
    return "transfer";
  }

  if (normalized === "card") {
    return "card";
  }

  if (normalized === "wallet") {
    return "wallet";
  }

  return "transfer";
};

const getFlutterwaveFeeAmount = (transaction: AnyRecord = {}) => {
  const amountSettled = Number(transaction.amount_settled ?? 0);
  const chargedAmount = Number(transaction.charged_amount ?? transaction.amount ?? 0);

  if (Number.isFinite(amountSettled) && amountSettled > 0 && chargedAmount >= amountSettled) {
    return Math.max(0, Math.round(chargedAmount - amountSettled));
  }

  return toSafeInteger(transaction.app_fee ?? transaction.merchant_fee ?? 0);
};

const loadDriverSubscriptionConfig = async () => {
  const config = await supabaseAdmin.selectOne<AnyRecord>("app_configs", {
    key: "eq.driver_monthly_fee",
    select: "value",
  });
  const value = (config?.value || {}) as AnyRecord;
  const amount = Number(value.amount ?? 0);
  const paymentProviderFeePercent = Number(value.payment_provider_fee_percent ?? 1.5);
  const providerFeeAmount = Math.max(
    0,
    Math.round((amount * paymentProviderFeePercent) / 100),
  );

  return {
    amount,
    currency: String(value.currency || "NGN"),
    paymentProviderFeePercent,
    providerFeeAmount,
    totalAmount: Math.max(0, Math.round(amount) + providerFeeAmount),
  };
};

const completeFlutterwaveSubscription = async (transaction: AnyRecord) => {
  const status = normalizeFlutterwavePaymentStatus(transaction.status);
  const txRef = transaction.tx_ref || "";
  const transactionId = transaction.id ?? transaction.transaction_id ?? null;

  if (status !== "paid") {
    await updateFlutterwavePaymentAttempt(txRef, {
      error_message: status === "failed" ? transaction.processor_response || null : null,
      provider_transaction_id: transactionId ? String(transactionId) : null,
      status: normalizeFlutterwaveAttemptStatus(transaction.status),
    });

    return { handled: true, paymentStatus: status, target: "driver_subscription" };
  }

  const meta = (transaction.meta || {}) as AnyRecord;
  const referenceParts = parsePaymentReference(txRef);
  const driverId = String(meta.driver_id || referenceParts[1] || "").trim();

  if (!driverId) {
    throw new Error("Flutterwave subscription webhook is missing driver metadata.");
  }

  const config = await loadDriverSubscriptionConfig();
  const amountPaid = toSafeInteger(transaction.charged_amount ?? transaction.amount);
  const currency = String(transaction.currency || "NGN");

  if (currency !== config.currency || amountPaid < config.totalAmount) {
    await updateFlutterwavePaymentAttempt(txRef, {
      error_message: "Flutterwave subscription amount or currency does not match.",
      provider_transaction_id: transactionId ? String(transactionId) : null,
      status: "failed",
    });

    throw new Error("Flutterwave subscription amount or currency does not match.");
  }

  const expiryDate = new Date();
  expiryDate.setDate(expiryDate.getDate() + 30);

  await supabaseAdmin.update(
    "profiles",
    {
      has_paid: true,
      subscription_expires_at: expiryDate.toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: `eq.${driverId}`,
      select: "id,has_paid,subscription_expires_at",
    },
  );

  await updateFlutterwavePaymentAttempt(txRef, {
    error_message: null,
    provider_transaction_id: transactionId ? String(transactionId) : null,
    status: "successful",
  });

  return {
    driverId,
    handled: true,
    paymentStatus: "paid",
    target: "driver_subscription",
  };
};

const findRidePaymentByReference = async (reference: string) => {
  if (!reference) {
    return null;
  }

  return supabaseAdmin.selectOne<AnyRecord>("customer_payments", {
    provider: "eq.flutterwave",
    provider_reference: `eq.${reference}`,
    select: "id,ride_id,status",
  });
};

const completeFlutterwaveRidePayment = async (transaction: AnyRecord) => {
  const meta = (transaction.meta || {}) as AnyRecord;
  const txRef = String(transaction.tx_ref || "").trim();
  const referenceParts = parsePaymentReference(txRef);
  const existingPayment = await findRidePaymentByReference(txRef);
  const rideId = String(
    meta.ride_id || existingPayment?.ride_id || referenceParts[1] || "",
  ).trim();

  if (!rideId) {
    throw new Error("Flutterwave ride webhook is missing ride metadata.");
  }

  const ride = await supabaseAdmin.selectOne<AnyRecord>("rides", {
    id: `eq.${rideId}`,
    select: "id,customer_id,partner_id,price,status,payment_status",
  });

  if (!ride?.id) {
    throw new Error("Ride not found while processing Flutterwave webhook.");
  }

  const paymentStatus = normalizeFlutterwavePaymentStatus(transaction.status);
  const amountPaid = toSafeInteger(transaction.charged_amount ?? transaction.amount);
  const providerReference =
    txRef || String(transaction.flw_ref || transaction.id || "").trim();
  const paymentMethod = normalizeFlutterwavePaymentMethod(transaction.payment_type);
  const metadata = {
    amount_settled: transaction.amount_settled ?? null,
    app_fee: transaction.app_fee ?? null,
    customer: transaction.customer ?? null,
    flw_ref: transaction.flw_ref ?? null,
    merchant_fee: transaction.merchant_fee ?? null,
    meta,
    payment_type: transaction.payment_type ?? null,
    processor_response: transaction.processor_response ?? null,
    status: transaction.status ?? null,
    transaction_id: transaction.id ?? null,
    tx_ref: txRef || null,
  };

  if (paymentStatus === "paid") {
    const breakdown = await supabaseAdmin.rpc<AnyRecord[]>(
      "get_checkout_breakdown",
      {
        p_booking_fare_amount: Number(ride.price ?? 0),
        p_partner_id: ride.partner_id ?? null,
      },
    );
    const expectedAmount = Number(breakdown?.[0]?.customer_total_amount ?? ride.price ?? 0);

    if (amountPaid < expectedAmount) {
      throw new Error("Flutterwave ride payment amount does not match.");
    }

    const paymentId = await supabaseAdmin.rpc<string>("record_customer_payment", {
      p_amount: amountPaid,
      p_metadata: metadata,
      p_payment_method: paymentMethod,
      p_provider: "flutterwave",
      p_provider_fee_amount: getFlutterwaveFeeAmount(transaction),
      p_provider_reference: providerReference,
      p_ride_id: rideId,
    });

    return {
      handled: true,
      paymentId,
      paymentStatus,
      rideId,
      target: "ride_payment",
    };
  }

  if (ride.payment_status !== "paid") {
    await supabaseAdmin.upsert(
      "customer_payments",
      {
        amount: amountPaid,
        currency: String(transaction.currency || "NGN"),
        customer_id: ride.customer_id,
        metadata,
        paid_at: null,
        payment_method: paymentMethod,
        provider: "flutterwave",
        provider_fee_amount: getFlutterwaveFeeAmount(transaction),
        provider_reference: providerReference,
        ride_id: rideId,
        status: paymentStatus,
      },
      {
        on_conflict: "ride_id",
        select: "id,ride_id,status",
      },
    );

    await supabaseAdmin.update(
      "rides",
      {
        payment_status: paymentStatus,
        updated_at: new Date().toISOString(),
      },
      {
        id: `eq.${rideId}`,
        select: "id,payment_status",
      },
    );
  }

  return {
    handled: true,
    paymentStatus,
    rideId,
    target: "ride_payment",
  };
};

const completeFlutterwaveTransfer = async (payload: AnyRecord = {}) => {
  const transferId = payload.id;
  const verifiedTransfer = transferId
    ? await getFlutterwaveTransferById(transferId)
    : payload;
  const reference = String(verifiedTransfer?.reference || payload.reference || "").trim();

  if (!reference) {
    return { handled: false, reason: "missing transfer reference", target: "driver_payout" };
  }

  const status = String(verifiedTransfer?.status || payload.status || "").trim().toLowerCase();
  if (!["failed", "successful"].includes(status)) {
    return { handled: true, payoutStatus: status || "pending", target: "driver_payout" };
  }

  const payout = await supabaseAdmin.selectOne<AnyRecord>("driver_payouts", {
    provider_reference: `eq.${reference}`,
    select: "id,wallet_transaction_id",
  });

  if (!payout?.id) {
    return { handled: false, reason: "payout not found", target: "driver_payout" };
  }

  const fee =
    typeof verifiedTransfer?.fee === "object" && verifiedTransfer?.fee
      ? verifiedTransfer.fee.value
      : verifiedTransfer?.fee;

  await supabaseAdmin.rpc("complete_driver_payout", {
    p_failure_reason:
      status === "successful"
        ? null
        : verifiedTransfer?.complete_message || payload.complete_message || null,
    p_payout_fee_amount: toSafeInteger(fee),
    p_payout_id: payout.id,
    p_provider_reference: reference,
    p_status: status === "successful" ? "paid" : "failed",
  });

  return {
    handled: true,
    payoutId: payout.id,
    payoutStatus: status === "successful" ? "paid" : "failed",
    target: "driver_payout",
  };
};

const handleFlutterwaveChargeEvent = async (payload: AnyRecord = {}) => {
  const transaction = (await verifyFlutterwaveTransaction(payload)) || payload;
  const meta = (transaction.meta || payload.meta || {}) as AnyRecord;
  const txRef = transaction.tx_ref || payload.tx_ref || "";
  const referenceParts = parsePaymentReference(txRef);
  const paymentType = String(
    meta.payment_type ||
      meta.paymentType ||
      (referenceParts[0] === "sub" ? "driver_subscription" : "") ||
      (referenceParts[0] === "ride" ? "ride_payment" : ""),
  ).trim();

  if (paymentType === "driver_subscription") {
    return completeFlutterwaveSubscription(transaction);
  }

  if (paymentType === "ride_payment" || meta.ride_id) {
    return completeFlutterwaveRidePayment(transaction);
  }

  const existingPayment = await findRidePaymentByReference(String(txRef || "").trim());
  if (existingPayment?.ride_id) {
    return completeFlutterwaveRidePayment({
      ...transaction,
      meta: {
        ...meta,
        ride_id: existingPayment.ride_id,
      },
    });
  }

  return {
    handled: false,
    paymentStatus: normalizeFlutterwavePaymentStatus(transaction.status),
    reason: "unrecognized payment type",
    target: "charge",
  };
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
        roleTitle: account.role_title || defaultRoleTitle(account.role),
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
  role: (account?.role || fallback?.role || "super_admin") as DashboardRole,
  roleTitle:
    account?.role_title ||
    fallback?.role_title ||
    defaultRoleTitle((account?.role || fallback?.role || "super_admin") as DashboardRole),
  username:
    account?.username ||
    normalizeUsername(String(fallback?.username || env.dashboardAdminUsername || "")),
});

const getDashboardAccountByUsername = async (username: string) => {
  try {
    return (await supabaseAdmin.selectOne<DashboardAccount>("dashboard_accounts", {
      is_active: "eq.true",
      select:
        "id,username,display_name,role,role_title,partner_id,password_hash,is_active,last_login_at,password_updated_at,created_at,updated_at,created_by,metadata",
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
        "id,username,display_name,role,role_title,partner_id,password_hash,is_active,last_login_at,password_updated_at,created_at,updated_at,created_by,metadata",
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
          "id,username,display_name,role,role_title,partner_id,password_hash,is_active,last_login_at,password_updated_at,created_at,updated_at,created_by,metadata",
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
      role: "super_admin",
      role_title: "Super admin",
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
    roleTitle: identity.roleTitle,
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

const requireAnyRole = (
  session: DashboardSession,
  roles: DashboardRole[],
  message = "You do not have permission for that action.",
) => {
  if (!roles.includes(session.role)) {
    throw errorWithStatus(message, 403);
  }
};

const requireLeadership = (session: DashboardSession) =>
  requireAnyRole(session, ["super_admin", "admin"]);
const requireSuperAdmin = (session: DashboardSession) => requireRole(session, "super_admin");
const requireTeamOperator = (session: DashboardSession) =>
  requireAnyRole(session, ["super_admin", "admin", "staff"]);
const requirePartner = (session: DashboardSession) => requireRole(session, "partner");

const isBootstrapAccount = (account: DashboardAccount | null) =>
  Boolean(account?.metadata && account.metadata.bootstrap);

const assertCanResetAccountPassword = (
  session: DashboardSession,
  targetAccount: DashboardAccount,
) => {
  if (session.role === "super_admin") {
    return;
  }

  if (
    session.role === "admin" &&
    (targetAccount.role === "staff" || targetAccount.role === "partner")
  ) {
    return;
  }

  throw errorWithStatus("You do not have permission to reset that account password.", 403);
};

const assertCanToggleAccountStatus = (
  session: DashboardSession,
  targetAccount: DashboardAccount,
) => {
  if (targetAccount.id === session.accountId) {
    throw errorWithStatus("You cannot deactivate the account you are currently using.", 400);
  }

  if (isBootstrapAccount(targetAccount)) {
    throw errorWithStatus("The bootstrap super admin account cannot be deactivated.", 403);
  }

  if (session.role === "super_admin") {
    return;
  }

  if (session.role === "admin" && targetAccount.role === "staff") {
    return;
  }

  throw errorWithStatus("You do not have permission to change this account status.", 403);
};

const adminSectionHandlers: Record<
  Exclude<DashboardSectionName, "workspace">,
  (request: Request, session: DashboardSession) => Promise<unknown>
> = {
  access: async (_request, session) =>
    getAccessData(supabaseAdmin, {
      viewerRole: session.role,
    }),
  customers: async (request, session) =>
    getCustomersData(supabaseAdmin, {
      limit: new URL(request.url).searchParams.get("limit"),
      search: new URL(request.url).searchParams.get("search"),
    }, {
      viewerRole: session.role,
    }),
  drivers: async (request, session) =>
    getDriversData(supabaseAdmin, {
      limit: new URL(request.url).searchParams.get("limit"),
      search: new URL(request.url).searchParams.get("search"),
    }, {
      viewerRole: session.role,
    }),
  finance: async (request) => {
    const params = new URL(request.url).searchParams;
    const flutterwaveStatus = params.get("flutterwaveStatus");

    return getFinanceData(supabaseAdmin, {
      flutterwave: {
        baseUrl: env.flutterwaveBaseUrl,
        from: params.get("flutterwaveFrom"),
        secretKey: env.flutterwaveSecretKey,
        statuses: flutterwaveStatus ? [flutterwaveStatus] : undefined,
        to: params.get("flutterwaveTo"),
      },
    });
  },
  "live-ops": async (_request, session) =>
    getLiveOpsData(supabaseAdmin, {
      viewerRole: session.role,
    }),
  overview: async () => getOverviewData(supabaseAdmin, dashboardConfig),
  partners: async (request) =>
    getPartnersData(supabaseAdmin, {
      limit: new URL(request.url).searchParams.get("limit"),
      search: new URL(request.url).searchParams.get("search"),
    }),
  rides: async (request, session) =>
    getRidesData(supabaseAdmin, {
      limit: new URL(request.url).searchParams.get("limit"),
      paymentStatus: new URL(request.url).searchParams.get("paymentStatus"),
      search: new URL(request.url).searchParams.get("search"),
      serviceTypeId: new URL(request.url).searchParams.get("serviceTypeId"),
      status: new URL(request.url).searchParams.get("status"),
      tripType: new URL(request.url).searchParams.get("tripType"),
    }, {
      viewerRole: session.role,
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
  // The direct user <-> support thread (public.support_messages), as opposed to
  // `support`, which is the ride-scoped console backed by
  // dashboard_support_responses. "support-chat" was already listed as a valid
  // section name and authorized for leadership, and getSupportInboxData was
  // already imported — but this entry was missing, so the section 404'd and the
  // inbox was unreachable.
  "support-chat": async (request) =>
    getSupportInboxData(supabaseAdmin, {
      limit: new URL(request.url).searchParams.get("limit"),
      search: new URL(request.url).searchParams.get("search"),
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
    role: "super_admin",
    role_title: "Super admin",
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
    roleTitle: session.roleTitle || defaultRoleTitle(session.role),
    username: session.username,
  });
};

const handleSection = async (request: Request, section: string) => {
  const session = await requireSession(request);
  const normalizedSection = section as DashboardSectionName;

  if (leadershipRoles.has(session.role)) {
    if (!leadershipSections.has(normalizedSection)) {
      throw errorWithStatus("Unknown dashboard section.", 404);
    }

    const handler = adminSectionHandlers[normalizedSection as Exclude<
      DashboardSectionName,
      "workspace"
    >];
    return jsonSuccess(await handler(request, session));
  }

  if (session.role === "staff") {
    if (!staffSections.has(normalizedSection)) {
      throw errorWithStatus(
        "Staff accounts only have access to operations, rides, drivers, customers, scheduled rides, and support.",
        403,
      );
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

const handleFlutterwaveWebhook = async (request: Request) => {
  if (request.method !== "POST") {
    throw errorWithStatus("Method not allowed.", 405);
  }

  const rawBody = await request.text();
  const isValidWebhook = await verifyFlutterwaveWebhook(rawBody, request.headers);
  if (!isValidWebhook) {
    throw errorWithStatus("Invalid Flutterwave webhook signature.", 401);
  }

  try {
    const payload = JSON.parse(rawBody) as FlutterwaveWebhookPayload;
    const eventType = String(payload.type || payload.event || "").trim().toLowerCase();
    const eventData = (payload.data || {}) as AnyRecord;
    let result: AnyRecord = {
      eventType,
      handled: false,
      reason: "ignored event",
    };

    if (
      eventType === "charge.completed" ||
      eventType === "transaction.completed" ||
      eventType === "payment.completed"
    ) {
      result = await handleFlutterwaveChargeEvent(eventData);
    } else if (
      eventType === "transfer.completed" ||
      eventType === "transfer.disburse"
    ) {
      result = await completeFlutterwaveTransfer(eventData);
    }

    return jsonSuccess({
      eventType,
      ok: true,
      ...result,
    });
  } catch (error) {
    console.error("flutterwave-webhook:processing-error", error);
    return jsonSuccess({
      error: error instanceof Error ? error.message : "Webhook processing failed.",
      ok: false,
    });
  }
};

const createAdminAccount = async (session: DashboardSession, payload: AnyRecord) => {
  requireSuperAdmin(session);
  await ensureAccountStorageReady();

  const requestedRole = String(payload.role || "admin");
  const role = (requestedRole === "super_admin" ? "super_admin" : "admin") as DashboardRole;
  const username = normalizeUsername(String(payload.username || ""));
  const password = String(payload.password || "");
  const displayName = String(payload.displayName || "").trim();
  const roleTitle = String(payload.roleTitle || "").trim() || defaultRoleTitle(role);

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
    role,
    role_title: roleTitle,
    username,
  });

  return sanitizeAccount((rows[0] as DashboardAccount | undefined) ?? null);
};

const createStaffAccount = async (session: DashboardSession, payload: AnyRecord) => {
  requireLeadership(session);
  await ensureAccountStorageReady();

  const username = normalizeUsername(String(payload.username || ""));
  const password = String(payload.password || "");
  const displayName = String(payload.displayName || "").trim();
  const roleTitle = String(payload.roleTitle || "").trim() || "Staff";

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
      createdByRole: session.role,
      invitedBy: session.username,
    },
    partner_id: null,
    password_hash: passwordHash,
    role: "staff",
    role_title: roleTitle,
    username,
  });

  return sanitizeAccount((rows[0] as DashboardAccount | undefined) ?? null);
};

const createPartnerAccessAccount = async (
  session: DashboardSession,
  payload: AnyRecord,
) => {
  requireLeadership(session);
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
        "id,username,display_name,role,role_title,partner_id,password_hash,is_active,last_login_at,password_updated_at,created_at,updated_at,created_by,metadata",
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
      createdByRole: session.role,
      partnerName: partner.name,
    },
    partner_id: partnerId,
    password_hash: passwordHash,
    role: "partner",
    role_title: "Partner",
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
    const targetAccount = await getDashboardAccountById(targetAccountId);
    if (!targetAccount) {
      throw errorWithStatus("Target account not found.", 404);
    }

    assertCanResetAccountPassword(session, targetAccount);

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

  if (!account && leadershipRoles.has(session.role)) {
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

const toggleAccountStatus = async (
  session: DashboardSession,
  payload: AnyRecord,
) => {
  await ensureAccountStorageReady();

  const accountId = String(payload.accountId || "");
  if (!accountId) {
    throw errorWithStatus("An account id is required.", 400);
  }

  const targetAccount = await getDashboardAccountById(accountId);
  if (!targetAccount) {
    throw errorWithStatus("Target account not found.", 404);
  }

  assertCanToggleAccountStatus(session, targetAccount);

  const isActive =
    payload.isActive === undefined ? targetAccount.is_active === false : Boolean(payload.isActive);

  const updated = await updateDashboardAccount(targetAccount.id, {
    is_active: isActive,
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
    case "create_staff":
      return jsonSuccess(await createStaffAccount(session, payload));
    case "create_partner_access":
      return jsonSuccess(await createPartnerAccessAccount(session, payload));
    case "toggle_account_status":
      return jsonSuccess(await toggleAccountStatus(session, payload));
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
      requireTeamOperator(session);
      return jsonSuccess(await sendSupportReply(supabaseAdmin, session, payload));
    // The ONLY path that puts an agent reply into public.support_messages — the
    // table both apps read and subscribe to. It was declared in the action union
    // and imported, but had no case here, so the in-app support chat was
    // write-only: users' messages were stored and no reply could ever reach them.
    // (`send_support_reply` above writes to dashboard_support_responses, which no
    // app reads.)
    case "send_support_inbox_reply":
      requireTeamOperator(session);
      return jsonSuccess(
        await sendSupportInboxReply(supabaseAdmin, session, payload),
      );
    case "cancel_ride":
      requireLeadership(session);
      return jsonSuccess(
        await cancelRideAsAdmin(supabaseAdmin, String(payload.rideId || ""), payload),
      );
    case "update_ride_follow_up":
      requireLeadership(session);
      return jsonSuccess(
        await updateRideFollowUp(
          supabaseAdmin,
          String(payload.rideId || ""),
          payload,
        ),
      );
    case "update_driver":
      requireLeadership(session);
      return jsonSuccess(
        await updateDriver(supabaseAdmin, String(payload.driverId || ""), payload),
      );
    case "grant_driver_subscription":
      requireLeadership(session);
      return jsonSuccess(
        await grantDriverSubscription(
          supabaseAdmin,
          String(payload.driverId || ""),
          payload,
          session.username,
        ),
      );
    case "update_customer":
      requireLeadership(session);
      return jsonSuccess(
        await updateCustomer(supabaseAdmin, String(payload.customerId || ""), payload),
      );
    case "cancel_scheduled_ride":
      requireLeadership(session);
      return jsonSuccess(
        await cancelScheduledRideAsAdmin(
          supabaseAdmin,
          String(payload.scheduledRideId || ""),
        ),
      );
    case "create_partner":
      requireLeadership(session);
      return jsonSuccess(await createPartner(supabaseAdmin, payload));
    case "update_partner":
      requireLeadership(session);
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
      requireLeadership(session);
      return jsonSuccess(
        await updatePartnerCommission(
          supabaseAdmin,
          String(payload.commissionId || ""),
          payload,
        ),
      );
    case "update_report":
      requireTeamOperator(session);
      return jsonSuccess(
        await updateReport(supabaseAdmin, String(payload.reportId || ""), payload),
      );
    case "send_push_notification":
      requireLeadership(session);
      return jsonSuccess(await sendPushNotification(supabaseAdmin, payload));
    case "update_app_config":
      requireLeadership(session);
      return jsonSuccess(
        await updateAppConfig(supabaseAdmin, String(payload.key || ""), payload),
      );
    case "update_dispatch_settings":
      requireLeadership(session);
      return jsonSuccess(
        await updateDispatchSettings(supabaseAdmin, dashboardConfig, payload),
      );
    case "update_service_type":
      requireLeadership(session);
      return jsonSuccess(
        await updateServiceType(
          supabaseAdmin,
          String(payload.serviceTypeId || ""),
          payload,
        ),
      );
    case "create_service_type":
      requireLeadership(session);
      return jsonSuccess(await createServiceType(supabaseAdmin, payload));
    case "update_cancel_reason":
      requireLeadership(session);
      return jsonSuccess(
        await updateCancelReason(
          supabaseAdmin,
          String(payload.cancelReasonId || ""),
          payload,
        ),
      );
    case "create_cancel_reason":
      requireLeadership(session);
      return jsonSuccess(await createCancelReason(supabaseAdmin, payload));
    default:
      throw errorWithStatus("Unsupported admin action.", 400);
  }
};

Deno.serve(async (request) => {
  try {
    const [scope, target] = getRouteSegments(request);

    if (scope === "webhooks" && target === "flutterwave") {
      if (request.method === "OPTIONS") {
        return jsonSuccess({ ok: true });
      }

      return await handleFlutterwaveWebhook(request);
    }

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
