const ACTIVE_RIDE_STATUSES = ["pending", "accepted", "arrived", "on_trip"];
const OPEN_SCHEDULED_STATUSES = ["scheduled", "dispatching"];
const PAYMENT_FOLLOW_UP_OPEN_STATUSES = ["customer_paying_soon", "under_review"];
const TEAM_LEADERSHIP_ROLES = new Set(["super_admin", "admin"]);
const STORAGE_SIGNED_URL_TTL_SECONDS = 60 * 60 * 24;
const ABSOLUTE_ASSET_URL_PATTERN = /^(?:https?:|data:|blob:)/i;
const DRIVER_RECENT_RIDE_SELECT =
  "id,customer_id,driver_id,status,is_delivery,pickup_address,destination_address,price,created_at,completed_at,payment_status,payment_follow_up_status";
const DRIVER_RIDE_FINANCIAL_SELECT =
  "id,ride_id,booking_fare_amount,service_fee_amount,partner_fee_amount,customer_total_amount,processor_fee_amount,payout_fee_amount,partner_commission_amount,driver_gross_amount,driver_net_payout_amount,drop_net_margin_amount,currency,created_at,updated_at";
const RIDE_PAYMENT_SELECT =
  "id,ride_id,amount,currency,payment_method,provider,status,paid_at,created_at";
const PAYMENT_ATTEMPT_SELECT =
  "id,provider,payment_type,status,actor_user_id,driver_id,customer_id,ride_id,amount,currency,provider_reference,provider_transaction_id,checkout_url,error_code,error_message,metadata,created_at,updated_at";
const OTP_SELECT = "id,phone,code,created_at,expires_at";
const DASHBOARD_ACCOUNT_SELECT =
  "id,username,display_name,role,role_title,partner_id,is_active,last_login_at,password_updated_at,created_at,updated_at,created_by,metadata";
const FLUTTERWAVE_API_BASE_URL = "https://api.flutterwave.com/v3";
const FLUTTERWAVE_REPORT_WINDOW_DAYS = 365;
const FLUTTERWAVE_TRANSACTION_STATUSES = ["successful", "failed", "pending"];
const FLUTTERWAVE_TRANSACTION_MAX_PAGES_PER_STATUS = 8;

const DRIVER_PROFILE_SELECT = [
  "id",
  "full_name",
  "email",
  "phone",
  "role",
  "driver_type",
  "gender",
  "dob",
  "is_online",
  "is_verified",
  "avatar_url",
  "nin_number",
  "license_number",
  "license_expiry",
  "license_photo_url",
  "license_selfie_url",
  "emergency_contact",
  "updated_at",
  "has_paid",
  "vehicle_category",
  "rating",
  "total_trips",
  "subscription_expires_at",
  "is_busy",
  "last_online_at",
  "total_online_minutes",
  "total_kilometers",
  "lifetime_online_minutes",
].join(",");

const CUSTOMER_PROFILE_SELECT = [
  "id",
  "full_name",
  "email",
  "phone",
  "role",
  "gender",
  "dob",
  "is_verified",
  "avatar_url",
  "updated_at",
  "rating",
  "total_trips",
].join(",");

const VEHICLE_SELECT = [
  "id",
  "driver_id",
  "category",
  "make",
  "model",
  "color",
  "production_year",
  "plate_number",
  "registration_photo_url",
  "vehicle_image_url",
  "capacity_kg",
  "is_active",
].join(",");

const RIDE_SELECT = [
  "id",
  "customer_id",
  "driver_id",
  "status",
  "is_delivery",
  "is_airport_trip",
  "airport_pickup_zone_code",
  "airport_pickup_zone_name",
  "airport_dropoff_zone_code",
  "airport_dropoff_zone_name",
  "airport_surcharge_amount",
  "pickup_address",
  "destination_address",
  "price",
  "quoted_price_amount",
  "created_at",
  "completed_at",
  "accepted_at",
  "started_at",
  "updated_at",
  "requested_vehicle_type",
  "service_type_id",
  "distance_km",
  "route_distance_km",
  "driver_pickup_distance_km",
  "estimated_pickup_mins",
  "estimated_dropoff_mins",
  "driver_confirmed_departure",
  "paymentMode",
  "payment_status",
  "settlement_status",
  "payment_follow_up_status",
  "payment_follow_up_note",
  "payment_follow_up_reported_at",
  "pickup_code",
  "dropoff_code",
  "item_image_url",
  "delivery_item_info",
  "actual_trip_seconds",
  "pickup_wait_seconds",
  "billable_waiting_seconds",
  "dropoff_arrived_at",
  "partner_id",
  "source_code",
  "attribution_source",
  "customer_payment_id",
  "customer:profiles!customer_id(id,full_name,phone,email,avatar_url,is_verified,rating,total_trips)",
  "driver:profiles!driver_id(id,full_name,phone,email,avatar_url,is_verified,has_paid,is_online,is_busy,rating,subscription_expires_at)",
  "service:service_types(id,label,name,description,is_active,sort_order,capacity)",
].join(",");

const SCHEDULED_RIDE_SELECT = [
  "id",
  "customer_id",
  "spawned_ride_id",
  "status",
  "pickup_address",
  "destination_address",
  "pickup_lat",
  "pickup_lon",
  "destination_lat",
  "destination_lon",
  "requested_vehicle_type",
  "service_type_id",
  "scheduled_for",
  "dispatch_lead_minutes",
  "quoted_price",
  "quoted_distance_km",
  "quoted_estimated_pickup_mins",
  "quoted_estimated_dropoff_mins",
  "quoted_driver_pickup_distance_km",
  "quoted_eta_source",
  "quoted_eta_last_calculated_at",
  "quoted_routing_provider",
  "quoted_routing_preference",
  "dispatch_attempts",
  "last_dispatch_error",
  "dispatched_at",
  "cancelled_at",
  "created_at",
  "updated_at",
  "customer:profiles!customer_id(id,full_name,phone,email,is_verified,total_trips,rating)",
  "service:service_types(id,label,name,is_active,sort_order,capacity)",
].join(",");

const DRIVER_LOCATION_SELECT = [
  "driver_id",
  "driver_lat",
  "driver_lon",
  "heading",
  "last_updated",
].join(",");

const OPEN_OFFER_SELECT = [
  "id",
  "ride_id",
  "driver_id",
  "status",
  "round",
  "offered_at",
  "expires_at",
  "updated_at",
  "metadata",
].join(",");

const toArray = (value) => (Array.isArray(value) ? value : []);

const toIdList = (rows, key = "id") =>
  Array.from(
    new Set(
      toArray(rows)
        .map((row) => row?.[key])
        .filter(Boolean),
    ),
  );

const inFilter = (values) => `in.(${values.join(",")})`;

export const buildSearchMatcher = (search) => {
  const normalized = String(search || "").trim().toLowerCase();
  if (!normalized) {
    return () => true;
  }

  return (value) => String(value || "").toLowerCase().includes(normalized);
};

const indexBy = (rows, key) => {
  const result = new Map();

  for (const row of toArray(rows)) {
    const id = row?.[key];
    if (id) {
      result.set(id, row);
    }
  }

  return result;
};

const groupBy = (rows, key) => {
  const result = new Map();

  for (const row of toArray(rows)) {
    const id = row?.[key];
    if (!id) {
      continue;
    }

    if (!result.has(id)) {
      result.set(id, []);
    }

    result.get(id).push(row);
  }

  return result;
};

const sumBy = (rows, key, predicate = () => true) =>
  toArray(rows).reduce((sum, row) => {
    if (!predicate(row)) {
      return sum;
    }

    const nextValue = Number(row?.[key] ?? 0);
    return Number.isFinite(nextValue) ? sum + nextValue : sum;
  }, 0);

const addAmountByCurrency = (target, currency, amount) => {
  const normalizedCurrency = String(currency || "NGN").toUpperCase();
  const numericAmount = Number(amount || 0);

  if (!Number.isFinite(numericAmount)) {
    return target;
  }

  target[normalizedCurrency] = (target[normalizedCurrency] || 0) + numericAmount;
  return target;
};

const toDateOnly = (date) => date.toISOString().slice(0, 10);

const normalizeDateOnly = (value) => {
  const normalized = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : "";
};

const getDefaultFlutterwaveDateRange = () => {
  const toDate = new Date();
  const fromDate = new Date(toDate);
  fromDate.setUTCDate(fromDate.getUTCDate() - FLUTTERWAVE_REPORT_WINDOW_DAYS);

  return {
    from: toDateOnly(fromDate),
    to: toDateOnly(toDate),
  };
};

const normalizeFlutterwaveDateRange = (options = {}) => {
  const defaults = getDefaultFlutterwaveDateRange();
  let from = normalizeDateOnly(options.from) || defaults.from;
  let to = normalizeDateOnly(options.to) || defaults.to;

  if (from > to) {
    [from, to] = [to, from];
  }

  return { from, to };
};

const normalizeFlutterwaveBaseUrl = (value) => {
  const baseUrl = String(value || FLUTTERWAVE_API_BASE_URL).replace(/\/+$/, "");
  return /\/v3$/i.test(baseUrl) ? baseUrl : `${baseUrl}/v3`;
};

const normalizeFlutterwaveStatuses = (value) => {
  const statuses = toArray(value)
    .map((entry) => String(entry || "").trim().toLowerCase())
    .filter((entry) => entry && entry !== "all");

  return statuses.length ? Array.from(new Set(statuses)) : FLUTTERWAVE_TRANSACTION_STATUSES;
};

const normalizeFlutterwaveTransaction = (entry, requestedStatus) => {
  const customer = entry?.customer && typeof entry.customer === "object" ? entry.customer : {};
  const status = String(entry?.status || requestedStatus || "unknown").toLowerCase();
  const amount = Number(entry?.amount ?? entry?.charged_amount ?? 0);
  const chargedAmount = Number(entry?.charged_amount ?? entry?.amount ?? 0);
  const amountSettled = Number(entry?.amount_settled ?? 0);
  const appFee = Number(entry?.app_fee ?? 0);
  const merchantFee = Number(entry?.merchant_fee ?? 0);
  const id = entry?.id ?? entry?.transaction_id ?? entry?.tx_ref ?? entry?.flw_ref;

  return {
    id: String(id || `${requestedStatus}-${entry?.created_at || ""}`),
    amount: Number.isFinite(amount) ? amount : 0,
    amount_settled: Number.isFinite(amountSettled) ? amountSettled : 0,
    app_fee: Number.isFinite(appFee) ? appFee : 0,
    charged_amount: Number.isFinite(chargedAmount) ? chargedAmount : 0,
    created_at: entry?.created_at || null,
    currency: String(entry?.currency || "NGN").toUpperCase(),
    customer_email: customer.email || "",
    customer_name: customer.name || customer.full_name || customer.fullname || "",
    customer_phone: customer.phone_number || customer.phone || "",
    flw_ref: entry?.flw_ref || "",
    merchant_fee: Number.isFinite(merchantFee) ? merchantFee : 0,
    payment_type: entry?.payment_type || "",
    processor_response: entry?.processor_response || entry?.narration || "",
    status,
    transaction_id: entry?.id ?? entry?.transaction_id ?? null,
    tx_ref: entry?.tx_ref || "",
  };
};

const getFlutterwaveTransactionKey = (transaction) =>
  String(
    transaction?.transaction_id ||
      transaction?.tx_ref ||
      transaction?.flw_ref ||
      transaction?.id ||
      "",
  );

const summarizeFlutterwaveStatusRows = (transactions, totalsByStatus) => {
  const summaries = new Map();

  for (const status of FLUTTERWAVE_TRANSACTION_STATUSES) {
    summaries.set(status, {
      id: status,
      amounts_by_currency: {},
      loaded_count: 0,
      provider_count: totalsByStatus[status] || 0,
      settled_by_currency: {},
      status,
    });
  }

  for (const transaction of toArray(transactions)) {
    const status = String(transaction?.status || "unknown").toLowerCase();
    const summary =
      summaries.get(status) ||
      {
        id: status,
        amounts_by_currency: {},
        loaded_count: 0,
        provider_count: totalsByStatus[status] || 0,
        settled_by_currency: {},
        status,
      };

    summary.loaded_count += 1;
    summary.provider_count = Math.max(summary.provider_count, summary.loaded_count);
    addAmountByCurrency(
      summary.amounts_by_currency,
      transaction.currency,
      transaction.charged_amount || transaction.amount,
    );
    addAmountByCurrency(
      summary.settled_by_currency,
      transaction.currency,
      transaction.amount_settled,
    );
    summaries.set(status, summary);
  }

  Object.entries(totalsByStatus).forEach(([status, count]) => {
    const summary =
      summaries.get(status) ||
      {
        id: status,
        amounts_by_currency: {},
        loaded_count: 0,
        provider_count: 0,
        settled_by_currency: {},
        status,
      };

    summary.provider_count = Math.max(summary.provider_count, Number(count || 0));
    summaries.set(status, summary);
  });

  return Array.from(summaries.values()).sort(
    (left, right) => Number(right.provider_count || 0) - Number(left.provider_count || 0),
  );
};

const fetchFlutterwaveJson = async (url, secretKey) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    const response = await fetch(url.toString(), {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${secretKey}`,
      },
      method: "GET",
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      const message =
        payload?.message ||
        payload?.error ||
        `Flutterwave request failed with status ${response.status}`;
      throw new Error(message);
    }

    return payload || {};
  } finally {
    clearTimeout(timeout);
  }
};

const getFlutterwaveTransactionStatusReport = async (options = {}) => {
  const secretKey = String(options.secretKey || "").trim();
  const { from, to } = normalizeFlutterwaveDateRange(options);
  const baseUrl = normalizeFlutterwaveBaseUrl(options.baseUrl);
  const statuses = normalizeFlutterwaveStatuses(options.statuses);
  const maxPagesPerStatus = Math.max(
    1,
    Number(options.maxPagesPerStatus || FLUTTERWAVE_TRANSACTION_MAX_PAGES_PER_STATUS),
  );

  if (!secretKey) {
    return {
      available: false,
      configured: false,
      error: "Set FLUTTERWAVE_SECRET_KEY for the drop-admin edge function.",
      from,
      has_more: false,
      loaded_count: 0,
      status_summary: [],
      statuses,
      to,
      total_provider_count: 0,
      transactions: [],
    };
  }

  try {
    const transactionsByKey = new Map();
    const totalsByStatus = {};
    const failedStatuses = [];
    const warnings = [];

    for (const status of statuses) {
      let page = 1;
      let totalPages = 1;

      try {
        do {
          const url = new URL(`${baseUrl}/transactions`);
          url.searchParams.set("from", from);
          url.searchParams.set("to", to);
          url.searchParams.set("page", String(page));
          url.searchParams.set("status", status);

          const payload = await fetchFlutterwaveJson(url, secretKey);
          const rows = toArray(payload?.data);
          const pageInfo = payload?.meta?.page_info || {};
          const providerTotal = Number(pageInfo.total ?? rows.length);
          const nextTotalPages = Number(pageInfo.total_pages || 0);

          totalsByStatus[status] = Math.max(totalsByStatus[status] || 0, providerTotal);
          totalPages = Number.isFinite(nextTotalPages) && nextTotalPages > 0 ? nextTotalPages : 1;

          for (const row of rows) {
            const transaction = normalizeFlutterwaveTransaction(row, status);
            const key = getFlutterwaveTransactionKey(transaction);

            if (key) {
              transactionsByKey.set(key, transaction);
            }
          }

          page += 1;
        } while (page <= totalPages && page <= maxPagesPerStatus);
      } catch (error) {
        failedStatuses.push(status);
        warnings.push(
          `${status} could not be loaded: ${
            error instanceof Error ? error.message : "unknown error"
          }.`,
        );
        continue;
      }

      if (totalPages > maxPagesPerStatus) {
        warnings.push(
          `${status} has ${totalPages} pages; loaded ${maxPagesPerStatus}.`,
        );
      }
    }

    if (failedStatuses.length === statuses.length) {
      throw new Error(warnings.join(" ") || "Could not load Flutterwave transactions.");
    }

    const transactions = sortByDateDesc(Array.from(transactionsByKey.values()), "created_at");

    return {
      available: true,
      configured: true,
      error: "",
      from,
      has_more: warnings.length > 0,
      loaded_count: transactions.length,
      status_summary: summarizeFlutterwaveStatusRows(transactions, totalsByStatus),
      statuses,
      to,
      total_provider_count: Object.values(totalsByStatus).reduce(
        (total, count) => total + Number(count || 0),
        0,
      ),
      transactions,
      warnings,
    };
  } catch (error) {
    return {
      available: false,
      configured: true,
      error:
        error instanceof Error
          ? error.message
          : "Could not load Flutterwave transactions.",
      from,
      has_more: false,
      loaded_count: 0,
      status_summary: [],
      statuses,
      to,
      total_provider_count: 0,
      transactions: [],
    };
  }
};

const sortByDateDesc = (rows, key) =>
  [...toArray(rows)].sort(
    (left, right) =>
      new Date(right?.[key] || 0).getTime() - new Date(left?.[key] || 0).getTime(),
  );

const sortByDateAsc = (rows, key) =>
  [...toArray(rows)].sort(
    (left, right) =>
      new Date(left?.[key] || 0).getTime() - new Date(right?.[key] || 0).getTime(),
  );

const sortByRegistrationDesc = (rows) =>
  [...toArray(rows)].sort((left, right) => {
    const rightTime = new Date(
      right?.registered_at || right?.created_at || right?.updated_at || 0,
    ).getTime();
    const leftTime = new Date(
      left?.registered_at || left?.created_at || left?.updated_at || 0,
    ).getTime();

    return rightTime - leftTime;
  });

const mapPaymentAttemptToFlutterwaveTransaction = (attempt) => ({
  amount: attempt.amount,
  charged_amount: attempt.amount,
  created_at: attempt.created_at,
  currency: attempt.currency || "NGN",
  customer_email: attempt.driver?.email || attempt.customer?.email || null,
  customer_name:
    attempt.driver?.full_name || attempt.customer?.full_name || "Unknown user",
  customer_phone: attempt.driver?.phone || attempt.customer?.phone || null,
  flw_ref: attempt.provider_transaction_id
    ? `Flutterwave ${attempt.provider_transaction_id}`
    : "Local checkout attempt",
  local_attempt: true,
  payment_type: attempt.payment_type || "payment",
  processor_response:
    attempt.error_message ||
    (attempt.checkout_url ? "Checkout link initialized" : "Checkout requested"),
  status: attempt.status || "unknown",
  transaction_id: attempt.provider_transaction_id || attempt.id,
  tx_ref: attempt.provider_reference || attempt.id,
});

const mergeFlutterwaveReportWithPaymentAttempts = (report, paymentAttempts) => {
  const localTransactions = toArray(paymentAttempts)
    .filter((attempt) => String(attempt?.provider || "").toLowerCase() === "flutterwave")
    .map(mapPaymentAttemptToFlutterwaveTransaction);

  if (!localTransactions.length) {
    return report;
  }

  const providerTransactions = toArray(report?.transactions);
  const warnings = [...toArray(report?.warnings)];

  if (report?.configured && !report?.available && report?.error) {
    warnings.push(
      `Provider status could not be loaded (${report.error}); showing local checkout attempts recorded by Drop.`,
    );
  }

  return {
    ...report,
    available: report?.available || Boolean(localTransactions.length),
    loaded_count: Number(report?.loaded_count || 0) + localTransactions.length,
    transactions: sortByDateDesc(
      [...localTransactions, ...providerTransactions],
      "created_at",
    ),
    warnings,
  };
};

const buildDriverActivationState = (driver) => {
  const subscriptionExpiry = driver?.subscription_expires_at
    ? new Date(driver.subscription_expires_at).getTime()
    : 0;
  const now = Date.now();

  if (!driver?.is_verified) {
    return "pending_verification";
  }

  if (!driver?.has_paid) {
    return "awaiting_subscription";
  }

  if (subscriptionExpiry && subscriptionExpiry < now) {
    return "subscription_expired";
  }

  return "active";
};

const mapConfigRows = (rows) =>
  toArray(rows).reduce((accumulator, row) => {
    accumulator[row.key] = row;
    return accumulator;
  }, {});

const defaultRoleTitle = (role) => {
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

export const isLeadershipViewer = (viewerRole) => TEAM_LEADERSHIP_ROLES.has(viewerRole);

const withRoleTitle = (account) =>
  account
    ? {
        ...account,
        role_title: account.role_title || defaultRoleTitle(account.role),
      }
    : account;

export const maskRideFinancialsForStaff = (entry) =>
  entry
    ? {
        ...entry,
        driver_gross_amount: null,
        driver_net_payout_amount: null,
        drop_net_margin_amount: null,
        partner_commission_amount: null,
        partner_fee_amount: null,
        payout_fee_amount: null,
        processor_fee_amount: null,
        sensitive_fields_hidden: true,
      }
    : null;

export const maskDriverForStaff = (driver) =>
  driver
    ? {
        ...driver,
        default_payout_account: null,
        dob: null,
        emergency_contact: null,
        license_expiry: null,
        license_number: null,
        license_photo_url: null,
        license_selfie_url: null,
        latest_otp: null,
        nin_number: null,
        payout_accounts: [],
        recent_payouts: [],
        sensitive_fields_hidden: true,
        vehicle: driver.vehicle
          ? {
              ...driver.vehicle,
              registration_photo_url: null,
            }
          : null,
        wallet: null,
      }
    : driver;

export const maskCustomerForStaff = (customer) =>
  customer
    ? {
        ...customer,
        dob: null,
        latest_otp: null,
        sensitive_fields_hidden: true,
      }
    : customer;

const safeSelect = async (executor) => {
  try {
    return await executor();
  } catch {
    return [];
  }
};

const safeSelectOne = async (executor) => {
  try {
    return await executor();
  } catch {
    return null;
  }
};

export const normalizePhoneNumber = (value) => {
  const digits = String(value || "").replace(/\D/g, "");

  if (!digits) {
    return "";
  }

  if (digits.length === 11 && digits.startsWith("0")) {
    return `234${digits.slice(1)}`;
  }

  if (digits.length === 10) {
    return `234${digits}`;
  }

  return digits;
};

const buildLatestOtpByPhone = (rows) => {
  const latestByPhone = new Map();

  for (const row of toArray(rows)) {
    const normalizedPhone = normalizePhoneNumber(row?.phone);

    if (normalizedPhone && !latestByPhone.has(normalizedPhone)) {
      latestByPhone.set(normalizedPhone, row);
    }
  }

  return latestByPhone;
};

const getLatestOtpForPhone = (latestByPhone, phone) =>
  latestByPhone.get(normalizePhoneNumber(phone)) || null;

const getAuthUserCreatedAtMap = async (admin, userIds) => {
  const pendingUserIds = new Set(
    toArray(userIds)
      .map((userId) => String(userId || "").trim())
      .filter(Boolean),
  );

  if (!pendingUserIds.size || typeof admin?.request !== "function") {
    return new Map();
  }

  const createdAtById = new Map();
  const perPage = 200;
  let page = 1;

  try {
    while (pendingUserIds.size > 0) {
      const { data } = await admin.request("/auth/v1/admin/users", {
        params: {
          page,
          per_page: perPage,
        },
      });

      const users = Array.isArray(data?.users)
        ? data.users
        : Array.isArray(data)
          ? data
          : [];

      if (!users.length) {
        break;
      }

      for (const user of users) {
        if (!pendingUserIds.has(user?.id)) {
          continue;
        }

        createdAtById.set(
          user.id,
          user.created_at || user.createdAt || user.confirmed_at || null,
        );
        pendingUserIds.delete(user.id);
      }

      if (users.length < perPage) {
        break;
      }

      const nextPage = Number(data?.next_page ?? data?.nextPage ?? page + 1);
      page = Number.isFinite(nextPage) && nextPage > page ? nextPage : page + 1;
    }
  } catch {
    return new Map();
  }

  return createdAtById;
};

const toAbsoluteAssetUrl = (admin, value) => {
  const normalized = String(value || "").trim();

  if (!normalized) {
    return null;
  }

  if (ABSOLUTE_ASSET_URL_PATTERN.test(normalized)) {
    return normalized;
  }

  const storageBaseUrl = String(admin?.storageBaseUrl || "").trim();
  const baseUrl = String(admin?.supabaseUrl || "").trim();

  if (normalized.startsWith("/object/")) {
    return storageBaseUrl ? `${storageBaseUrl}${normalized}` : null;
  }

  if (normalized.startsWith("/storage/v1/")) {
    return baseUrl ? `${baseUrl}${normalized}` : null;
  }

  if (normalized.startsWith("/")) {
    return baseUrl ? `${baseUrl}${normalized}` : null;
  }

  return null;
};

const normalizeStoragePath = (value, bucket) => {
  const absoluteUrl = toAbsoluteAssetUrl(null, value);

  if (absoluteUrl) {
    return absoluteUrl;
  }

  const normalized = String(value || "").trim().replace(/^\/+/, "");

  if (!normalized) {
    return "";
  }

  const bucketPrefix = `${bucket}/`;
  return normalized.startsWith(bucketPrefix)
    ? normalized.slice(bucketPrefix.length)
    : normalized;
};

const buildPublicStorageUrl = (admin, bucket, path) => {
  const storageBaseUrl = String(admin?.storageBaseUrl || "").trim();
  return storageBaseUrl
    ? encodeURI(`${storageBaseUrl}/object/public/${bucket}/${path}`)
    : path;
};

const createSignedStorageUrlMap = async (
  admin,
  bucket,
  paths,
  expiresIn = STORAGE_SIGNED_URL_TTL_SECONDS,
) => {
  const normalizedPaths = Array.from(
    new Set(
      toArray(paths)
        .map((path) => normalizeStoragePath(path, bucket))
        .filter((path) => path && !ABSOLUTE_ASSET_URL_PATTERN.test(path)),
    ),
  );

  if (!normalizedPaths.length || typeof admin?.request !== "function") {
    return new Map();
  }

  try {
    const { data } = await admin.request(`/storage/v1/object/sign/${bucket}`, {
      body: {
        expiresIn,
        paths: normalizedPaths,
      },
      method: "POST",
    });

    return toArray(data).reduce((map, entry) => {
      const path = normalizeStoragePath(entry?.path, bucket);
      const signedUrl = String(entry?.signedUrl || entry?.signedURL || "").trim();

      if (!path || !signedUrl) {
        return map;
      }

      map.set(
        path,
        ABSOLUTE_ASSET_URL_PATTERN.test(signedUrl)
          ? signedUrl
          : encodeURI(`${String(admin?.storageBaseUrl || "").trim()}${signedUrl}`),
      );

      return map;
    }, new Map());
  } catch {
    return new Map();
  }
};

const resolveStorageAssetUrl = (admin, bucket, value, signedUrlMap = null) => {
  const absoluteUrl = toAbsoluteAssetUrl(admin, value);

  if (absoluteUrl) {
    return absoluteUrl;
  }

  const path = normalizeStoragePath(value, bucket);

  if (!path) {
    return null;
  }

  if (signedUrlMap?.has(path)) {
    return signedUrlMap.get(path);
  }

  return buildPublicStorageUrl(admin, bucket, path);
};

const hydrateDriverMedia = async (admin, drivers, vehicles) => {
  const signedDriverDocs = await createSignedStorageUrlMap(
    admin,
    "driver-docs",
    toArray(drivers).flatMap((driver) => [
      driver?.license_photo_url,
      driver?.license_selfie_url,
    ]),
  );

  return {
    drivers: toArray(drivers).map((driver) => ({
      ...driver,
      avatar_url: resolveStorageAssetUrl(admin, "avatars", driver?.avatar_url),
      license_photo_url: resolveStorageAssetUrl(
        admin,
        "driver-docs",
        driver?.license_photo_url,
        signedDriverDocs,
      ),
      license_selfie_url: resolveStorageAssetUrl(
        admin,
        "driver-docs",
        driver?.license_selfie_url,
        signedDriverDocs,
      ),
    })),
    vehicles: toArray(vehicles).map((vehicle) => ({
      ...vehicle,
      registration_photo_url: resolveStorageAssetUrl(
        admin,
        "vehicle-images",
        vehicle?.registration_photo_url,
      ),
      vehicle_image_url: resolveStorageAssetUrl(
        admin,
        "vehicle-images",
        vehicle?.vehicle_image_url,
      ),
    })),
  };
};

export const getDispatchSettings = async (admin, dispatchAdminToken) => {
  if (dispatchAdminToken) {
    try {
      const { data } = await admin.invokeFunction("dispatch-settings", {
        headers: {
          "x-dispatch-admin-token": dispatchAdminToken,
        },
        method: "GET",
      });

      return data?.data || null;
    } catch {
      // Fall back to raw config storage below.
    }
  }

  const row = await safeSelectOne(() =>
    admin.selectOne("app_dispatch_configs", {
      key: "eq.defaults",
      select: "key,value,updated_at",
    }),
  );

  return row?.value || null;
};

export const getOverviewData = async (admin, config) => {
  const [driverCount, verifiedDriverCount, paidDriverCount, onlineDriverCount] =
    await Promise.all([
      admin.count("profiles", { role: "eq.driver" }),
      admin.count("profiles", { role: "eq.driver", is_verified: "eq.true" }),
      admin.count("profiles", { role: "eq.driver", has_paid: "eq.true" }),
      admin.count("profiles", { role: "eq.driver", is_online: "eq.true" }),
    ]);

  const [
    customerCount,
    activeRideCount,
    scheduledRideCount,
    openOfferCount,
    unresolvedReportCount,
    partnerCount,
    paymentFollowUpCount,
  ] = await Promise.all([
    admin.count("profiles", { role: "eq.customer" }),
    admin.count("rides", { status: inFilter(ACTIVE_RIDE_STATUSES) }),
    admin.count("scheduled_rides", { status: inFilter(OPEN_SCHEDULED_STATUSES) }),
    admin.count("ride_offers", { status: "eq.offered" }),
    admin.count("reports", { status: "eq.pending" }),
    admin.count("partners", { status: "eq.active" }),
    admin.count("rides", {
      payment_follow_up_status: inFilter(PAYMENT_FOLLOW_UP_OPEN_STATUSES),
    }),
  ]);

  const [recentRides, configRows, dispatchSettings, recentPayments, wallets] =
    await Promise.all([
      admin.select("rides", {
        limit: 8,
        order: "created_at.desc",
        select: RIDE_SELECT,
      }),
      admin.select("app_configs", {
        key: "in.(dashboard_branding,driver_monthly_fee,hybrid_finance_settings)",
        order: "key.asc",
        select: "key,description,value,updated_at",
      }),
      getDispatchSettings(admin, config.dispatchAdminToken),
      safeSelect(() =>
        admin.select("customer_payments", {
          limit: 12,
          order: "created_at.desc",
          select:
            "id,ride_id,customer_id,amount,currency,status,payment_method,provider,provider_reference,created_at,paid_at",
        }),
      ),
      safeSelect(() =>
        admin.select("driver_wallets", {
          order: "updated_at.desc",
          select:
            "driver_id,available_balance,pending_balance,auto_withdraw_enabled,auto_withdraw_minimum_amount,updated_at",
        }),
      ),
    ]);

  const configMap = mapConfigRows(configRows);
  const walletAvailableTotal = sumBy(wallets, "available_balance");
  const walletPendingTotal = sumBy(wallets, "pending_balance");
  const paidPaymentCount = recentPayments.filter(
    (payment) => payment.status === "paid",
  ).length;

  const alerts = [
    {
      level: paymentFollowUpCount > 0 ? "warning" : "ok",
      label: "Trips waiting on payment follow-up",
      value: paymentFollowUpCount,
    },
    {
      level: unresolvedReportCount > 0 ? "warning" : "ok",
      label: "Pending support reports",
      value: unresolvedReportCount,
    },
    {
      level: verifiedDriverCount < driverCount ? "attention" : "ok",
      label: "Drivers still awaiting verification",
      value: Math.max(0, driverCount - verifiedDriverCount),
    },
    {
      level: paidDriverCount < verifiedDriverCount ? "attention" : "ok",
      label: "Verified drivers awaiting subscription payment",
      value: Math.max(0, verifiedDriverCount - paidDriverCount),
    },
  ];

  return {
    alerts,
    counts: {
      activeRides: activeRideCount,
      customers: customerCount,
      drivers: driverCount,
      onlineDrivers: onlineDriverCount,
      openOffers: openOfferCount,
      partners: partnerCount,
      scheduledRides: scheduledRideCount,
      subscribedDrivers: paidDriverCount,
      unresolvedReports: unresolvedReportCount,
      verifiedDrivers: verifiedDriverCount,
    },
    branding: configMap.dashboard_branding?.value || null,
    dispatchSettings,
    finance: {
      driverMonthlyFee: configMap.driver_monthly_fee?.value || null,
      hybridFinanceSettings: configMap.hybrid_finance_settings?.value || null,
      paidPaymentCount,
      walletAvailableTotal,
      walletPendingTotal,
    },
    recentRides,
  };
};

export const getLiveOpsData = async (admin, options = {}) => {
  const shouldExposeOtpData = isLeadershipViewer(String(options.viewerRole || ""));
  let [
    activeRides,
    scheduledRides,
    openOffers,
    onlineDrivers,
    driverLocations,
    reports,
    recentOtps,
  ] =
    await Promise.all([
      admin.select("rides", {
        limit: 24,
        order: "created_at.desc",
        select: RIDE_SELECT,
        status: inFilter(ACTIVE_RIDE_STATUSES),
      }),
      safeSelect(() =>
        admin.select("scheduled_rides", {
          limit: 20,
          order: "scheduled_for.asc",
          select: SCHEDULED_RIDE_SELECT,
          status: inFilter(OPEN_SCHEDULED_STATUSES),
        }),
      ),
      admin.select("ride_offers", {
        limit: 30,
        order: "offered_at.desc",
        select: OPEN_OFFER_SELECT,
        status: "eq.offered",
      }),
      admin.select("profiles", {
        limit: 40,
        order: "last_online_at.desc",
        role: "eq.driver",
        is_online: "eq.true",
        select: DRIVER_PROFILE_SELECT,
      }),
      admin.select("driver_locations", {
        limit: 80,
        order: "last_updated.desc",
        select: DRIVER_LOCATION_SELECT,
      }),
      admin.select("reports", {
        limit: 12,
        order: "created_at.desc",
        select:
          "id,ride_id,reporter_id,target_id,issue_category,description,status,created_at",
      }),
      shouldExposeOtpData
        ? safeSelect(() =>
            admin.select("otp_verifications", {
              limit: 16,
              order: "created_at.desc",
              select: OTP_SELECT,
            }),
          )
        : Promise.resolve([]),
    ]);

  const onlineDriverIds = toIdList(onlineDrivers);
  const [vehicles, wallets] = await Promise.all([
    onlineDriverIds.length
      ? admin.select("vehicles", {
          driver_id: inFilter(onlineDriverIds),
          select: VEHICLE_SELECT,
        })
      : Promise.resolve([]),
    onlineDriverIds.length
      ? safeSelect(() =>
          admin.select("driver_wallets", {
            driver_id: inFilter(onlineDriverIds),
            select:
              "driver_id,available_balance,pending_balance,auto_withdraw_enabled,auto_withdraw_minimum_amount,updated_at",
          }),
        )
      : Promise.resolve([]),
  ]);

  const hydratedDriverMedia = await hydrateDriverMedia(admin, onlineDrivers, vehicles);
  onlineDrivers = hydratedDriverMedia.drivers;
  const hydratedVehicles = hydratedDriverMedia.vehicles;

  const locationByDriverId = indexBy(driverLocations, "driver_id");
  const vehicleByDriverId = indexBy(hydratedVehicles, "driver_id");
  const walletByDriverId = indexBy(wallets, "driver_id");

  return {
    activeRides,
    openOffers,
    onlineDrivers: onlineDrivers.map((driver) => ({
      ...driver,
      activation_state: buildDriverActivationState(driver),
      location: locationByDriverId.get(driver.id) || null,
      vehicle: vehicleByDriverId.get(driver.id) || null,
      wallet: walletByDriverId.get(driver.id) || null,
    })),
    recentOtps: recentOtps || [],
    reports,
    scheduledRides,
  };
};

export const getRidesData = async (admin, filters = {}, options = {}) => {
  const params = {
    limit: Math.min(Number(filters.limit) || 120, 250),
    order: "created_at.desc",
    select: RIDE_SELECT,
  };

  if (filters.status && filters.status !== "all") {
    params.status = filters.status.includes(",")
      ? inFilter(filters.status.split(",").map((value) => value.trim()))
      : `eq.${filters.status}`;
  }

  if (filters.paymentStatus && filters.paymentStatus !== "all") {
    params.payment_status = `eq.${filters.paymentStatus}`;
  }

  if (filters.serviceTypeId && filters.serviceTypeId !== "all") {
    params.service_type_id = `eq.${filters.serviceTypeId}`;
  }

  if (filters.tripType === "delivery") {
    params.is_delivery = "eq.true";
  }

  if (filters.tripType === "ride") {
    params.is_delivery = "eq.false";
  }

  const rows = await admin.select("rides", params);
  const rideIds = toIdList(rows);
  const [financialRows, paymentRows] = await Promise.all([
    rideIds.length
      ? safeSelect(() =>
          admin.select("ride_financials", {
            ride_id: inFilter(rideIds),
            order: "created_at.desc",
            select: DRIVER_RIDE_FINANCIAL_SELECT,
          }),
        )
      : Promise.resolve([]),
    rideIds.length
      ? safeSelect(() =>
          admin.select("customer_payments", {
            ride_id: inFilter(rideIds),
            order: "created_at.desc",
            select: RIDE_PAYMENT_SELECT,
          }),
        )
      : Promise.resolve([]),
  ]);
  const matchesSearch = buildSearchMatcher(filters.search);
  const financialRowsByRideId = groupBy(financialRows, "ride_id");
  const paymentRowsByRideId = groupBy(paymentRows, "ride_id");
  const viewerRole = String(options.viewerRole || "");
  const shouldMaskSensitiveFields = viewerRole === "staff";

  return rows
    .map((ride) => {
      const nextRide = {
        ...ride,
        financials: financialRowsByRideId.get(ride.id)?.[0] || null,
        latest_payment: paymentRowsByRideId.get(ride.id)?.[0] || null,
      };

      if (!shouldMaskSensitiveFields) {
        return nextRide;
      }

      return {
        ...nextRide,
        customer_payment_id: null,
        financials: maskRideFinancialsForStaff(nextRide.financials),
        sensitive_fields_hidden: true,
      };
    })
    .filter((ride) => {
      if (!filters.search) {
        return true;
      }

      return [
        ride.id,
        ride.pickup_address,
        ride.destination_address,
        ride.airport_pickup_zone_name,
        ride.airport_dropoff_zone_name,
        ride.customer?.full_name,
        ride.customer?.phone,
        ride.driver?.full_name,
        ride.driver?.phone,
      ].some(matchesSearch);
    });
};

export const cancelRideAsAdmin = async (admin, rideId, payload = {}) => {
  const now = new Date().toISOString();
  const updates = await admin.update(
    "rides",
    {
      status: "cancelled",
      updated_at: now,
    },
    {
      id: `eq.${rideId}`,
      select: RIDE_SELECT,
    },
  );

  await safeSelect(() =>
    admin.update(
      "ride_offers",
      {
        status: "unavailable",
        updated_at: now,
      },
      {
        ride_id: `eq.${rideId}`,
        status: "eq.offered",
        select: "id",
      },
    ),
  );

  await safeSelect(() =>
    admin.insert("ride_cancellation_logs", {
      ride_id: rideId,
      user_id: null,
      role: "admin",
      reason: payload.reason || "Cancelled from Drop admin dashboard",
    }),
  );

  return updates[0] || null;
};

export const updateRideFollowUp = async (admin, rideId, payload = {}) => {
  const nextPayload = {
    updated_at: new Date().toISOString(),
  };

  if (payload.payment_follow_up_status) {
    nextPayload.payment_follow_up_status = payload.payment_follow_up_status;
  }

  if (payload.payment_follow_up_note !== undefined) {
    nextPayload.payment_follow_up_note = payload.payment_follow_up_note || null;
  }

  if (payload.payment_follow_up_reported_at !== undefined) {
    nextPayload.payment_follow_up_reported_at =
      payload.payment_follow_up_reported_at || null;
  }

  if (payload.paymentMode) {
    nextPayload.paymentMode = payload.paymentMode;
  }

  const updates = await admin.update("rides", nextPayload, {
    id: `eq.${rideId}`,
    select: RIDE_SELECT,
  });

  return updates[0] || null;
};

export const getDriversData = async (admin, filters = {}, options = {}) => {
  const shouldMaskSensitiveFields = !isLeadershipViewer(String(options.viewerRole || ""));
  const requestedLimit = Math.min(Number(filters.limit) || 180, 300);
  const profileQueryLimit = filters.search ? 1000 : requestedLimit;
  let drivers = await admin.select("profiles", {
    limit: profileQueryLimit,
    order: "updated_at.desc",
    role: "eq.driver",
    select: DRIVER_PROFILE_SELECT,
  });

  const driverIds = toIdList(drivers);
  const [
    rawVehicles,
    locations,
    wallets,
    payoutAccounts,
    payouts,
    recentRides,
    otpRows,
    driverRegisteredAtById,
  ] =
    await Promise.all([
    driverIds.length
      ? admin.select("vehicles", {
          driver_id: inFilter(driverIds),
          select: VEHICLE_SELECT,
        })
      : Promise.resolve([]),
    driverIds.length
      ? admin.select("driver_locations", {
          driver_id: inFilter(driverIds),
          select: DRIVER_LOCATION_SELECT,
        })
      : Promise.resolve([]),
    driverIds.length
      ? safeSelect(() =>
          admin.select("driver_wallets", {
            driver_id: inFilter(driverIds),
            select:
              "driver_id,available_balance,pending_balance,auto_withdraw_enabled,auto_withdraw_minimum_amount,updated_at",
          }),
        )
      : Promise.resolve([]),
    driverIds.length
      ? safeSelect(() =>
          admin.select("driver_payout_accounts", {
            driver_id: inFilter(driverIds),
            order: "updated_at.desc",
            select:
              "id,driver_id,bank_name,bank_code,account_number,account_name,is_default,provider,provider_email,recipient_reference,sub_account_code,settlement_profile_code,settlement_report_emails,updated_at",
          }),
        )
      : Promise.resolve([]),
    driverIds.length
      ? safeSelect(() =>
          admin.select("driver_payouts", {
            driver_id: inFilter(driverIds),
            order: "requested_at.desc",
            limit: 120,
            select:
              "id,driver_id,payout_account_id,amount,provider,provider_reference,status,failure_reason,requested_at,completed_at,ride_id",
          }),
        )
      : Promise.resolve([]),
    driverIds.length
      ? safeSelect(() =>
          admin.select("rides", {
            driver_id: inFilter(driverIds),
            order: "created_at.desc",
            limit: 240,
            select: DRIVER_RECENT_RIDE_SELECT,
          }),
        )
      : Promise.resolve([]),
    shouldMaskSensitiveFields
      ? Promise.resolve([])
      : safeSelect(() =>
          admin.select("otp_verifications", {
            limit: 600,
            order: "created_at.desc",
            select: OTP_SELECT,
          }),
        ),
    getAuthUserCreatedAtMap(admin, driverIds),
  ]);

  const hydratedDriverMedia = await hydrateDriverMedia(admin, drivers, rawVehicles);
  drivers = hydratedDriverMedia.drivers;
  const vehicles = hydratedDriverMedia.vehicles;

  const matchesSearch = buildSearchMatcher(filters.search);
  const vehicleByDriverId = indexBy(vehicles, "driver_id");
  const locationByDriverId = indexBy(locations, "driver_id");
  const walletByDriverId = indexBy(wallets, "driver_id");
  const payoutAccountsByDriverId = groupBy(payoutAccounts, "driver_id");
  const payoutsByDriverId = groupBy(payouts, "driver_id");
  const ridesByDriverId = groupBy(recentRides, "driver_id");
  const latestOtpByPhone = buildLatestOtpByPhone(otpRows);

  const rows = drivers
    .map((driver) => {
      const accounts = payoutAccountsByDriverId.get(driver.id) || [];
      const recentPayouts = payoutsByDriverId.get(driver.id) || [];
      const nextDriver = {
        ...driver,
        activation_state: buildDriverActivationState(driver),
        default_payout_account:
          accounts.find((account) => account.is_default) || accounts[0] || null,
        latest_otp: getLatestOtpForPhone(latestOtpByPhone, driver.phone),
        location: locationByDriverId.get(driver.id) || null,
        payout_accounts: accounts,
        recent_payouts: recentPayouts.slice(0, 4),
        recent_rides: (ridesByDriverId.get(driver.id) || []).slice(0, 6),
        registered_at: driverRegisteredAtById.get(driver.id) || null,
        vehicle: vehicleByDriverId.get(driver.id) || null,
        wallet: walletByDriverId.get(driver.id) || null,
      };

      return shouldMaskSensitiveFields ? maskDriverForStaff(nextDriver) : nextDriver;
    })
    .filter((driver) => {
      if (!filters.search) {
        return true;
      }

      return [
        driver.id,
        driver.full_name,
        driver.phone,
        driver.email,
        driver.vehicle?.plate_number,
        driver.vehicle?.make,
        driver.vehicle?.model,
      ].some(matchesSearch);
    });

  return sortByRegistrationDesc(rows).slice(0, requestedLimit);
};

export const updateDriver = async (admin, driverId, payload = {}) => {
  const nextPayload = {
    updated_at: new Date().toISOString(),
  };

  const allowedFields = [
    "full_name",
    "email",
    "phone",
    "is_online",
    "is_verified",
    "has_paid",
    "vehicle_category",
    "driver_type",
    "is_busy",
    "subscription_expires_at",
  ];

  for (const field of allowedFields) {
    if (payload[field] !== undefined) {
      nextPayload[field] = payload[field];
    }
  }

  if (payload.has_paid === false && payload.subscription_expires_at === undefined) {
    nextPayload.subscription_expires_at = null;
  }

  const updates = await admin.update("profiles", nextPayload, {
    id: `eq.${driverId}`,
    role: "eq.driver",
    select: DRIVER_PROFILE_SELECT,
  });

  return updates[0] || null;
};

// Admin grants a driver a free subscription window — same effect as the driver
// "first month free" coupon (sets has_paid + subscription_expires_at + source),
// recorded in subscription_grants for accountability. Default 30 days; repeatable.
/** @param {string | null} [grantedBy] dashboard admin username, for the audit log */
export const grantDriverSubscription = async (
  admin,
  driverId,
  payload = {},
  grantedBy = null,
) => {
  const id = String(driverId || "");
  if (!id) {
    throw new Error("A driverId is required to grant a subscription.");
  }

  const rawDays = Number(payload.days);
  const days = Number.isFinite(rawDays) && rawDays > 0 ? Math.floor(rawDays) : 30;
  const reason = payload.reason ? String(payload.reason).slice(0, 500) : null;

  const driver = await admin.selectOne("profiles", {
    id: `eq.${id}`,
    role: "eq.driver",
    select: "id,full_name,has_paid,subscription_expires_at",
  });
  if (!driver) {
    throw new Error("Driver not found.");
  }

  const expiry = new Date();
  expiry.setDate(expiry.getDate() + days);
  const expiresAt = expiry.toISOString();
  const now = new Date().toISOString();

  const updates = await admin.update(
    "profiles",
    {
      has_paid: true,
      subscription_expires_at: expiresAt,
      subscription_source: "grant",
      updated_at: now,
    },
    {
      id: `eq.${id}`,
      role: "eq.driver",
      select: "id,full_name,has_paid,subscription_expires_at,subscription_source",
    },
  );

  await admin.insert("subscription_grants", {
    days,
    driver_id: id,
    expires_at: expiresAt,
    granted_by: grantedBy,
    reason,
  });

  return {
    days,
    driverId: id,
    expiresAt,
    profile: updates[0] || null,
  };
};

export const getCustomersData = async (admin, filters = {}, options = {}) => {
  const shouldMaskSensitiveFields = String(options.viewerRole || "") === "staff";
  const requestedLimit = Math.min(Number(filters.limit) || 180, 300);
  const profileQueryLimit = filters.search ? 1000 : requestedLimit;
  const customers = await admin.select("profiles", {
    limit: profileQueryLimit,
    order: "updated_at.desc",
    role: "eq.customer",
    select: CUSTOMER_PROFILE_SELECT,
  });

  const customerIds = toIdList(customers);
  const [rides, otpRows, customerRegisteredAtById] = await Promise.all([
    customerIds.length
      ? admin.select("rides", {
          customer_id: inFilter(customerIds),
          limit: 250,
          order: "created_at.desc",
          select:
            "id,customer_id,driver_id,status,pickup_address,destination_address,price,created_at,completed_at,payment_status,payment_follow_up_status",
        })
      : Promise.resolve([]),
    shouldMaskSensitiveFields
      ? Promise.resolve([])
      : safeSelect(() =>
          admin.select("otp_verifications", {
            limit: 600,
            order: "created_at.desc",
            select: OTP_SELECT,
          }),
        ),
    getAuthUserCreatedAtMap(admin, customerIds),
  ]);

  const ridesByCustomerId = groupBy(rides, "customer_id");
  const matchesSearch = buildSearchMatcher(filters.search);
  const latestOtpByPhone = buildLatestOtpByPhone(otpRows);

  const rows = customers
    .map((customer) => {
      const customerRides = ridesByCustomerId.get(customer.id) || [];
      const activeRide =
        customerRides.find((ride) => ACTIVE_RIDE_STATUSES.includes(ride.status)) || null;

      const nextCustomer = {
        ...customer,
        active_ride: activeRide,
        latest_otp: getLatestOtpForPhone(latestOtpByPhone, customer.phone),
        registered_at: customerRegisteredAtById.get(customer.id) || null,
        recent_rides: customerRides.slice(0, 4),
        latest_ride: customerRides[0] || null,
      };

      return shouldMaskSensitiveFields ? maskCustomerForStaff(nextCustomer) : nextCustomer;
    })
    .filter((customer) => {
      if (!filters.search) {
        return true;
      }

      return [customer.id, customer.full_name, customer.phone, customer.email].some(
        matchesSearch,
      );
    });

  return sortByRegistrationDesc(rows).slice(0, requestedLimit);
};

export const updateCustomer = async (admin, customerId, payload = {}) => {
  const nextPayload = {
    updated_at: new Date().toISOString(),
  };

  const allowedFields = ["full_name", "email", "phone", "is_verified"];
  for (const field of allowedFields) {
    if (payload[field] !== undefined) {
      nextPayload[field] = payload[field];
    }
  }

  const updates = await admin.update("profiles", nextPayload, {
    id: `eq.${customerId}`,
    role: "eq.customer",
    select: CUSTOMER_PROFILE_SELECT,
  });

  return updates[0] || null;
};

export const getScheduledRidesData = async (admin, filters = {}) => {
  const params = {
    limit: Math.min(Number(filters.limit) || 140, 250),
    order: "scheduled_for.asc",
    select: SCHEDULED_RIDE_SELECT,
  };

  if (filters.status && filters.status !== "all") {
    params.status = filters.status.includes(",")
      ? inFilter(filters.status.split(",").map((value) => value.trim()))
      : `eq.${filters.status}`;
  }

  const rows = await safeSelect(() => admin.select("scheduled_rides", params));
  const matchesSearch = buildSearchMatcher(filters.search);

  return rows.filter((ride) => {
    if (!filters.search) {
      return true;
    }

    return [
      ride.id,
      ride.pickup_address,
      ride.destination_address,
      ride.customer?.full_name,
      ride.customer?.phone,
    ].some(matchesSearch);
  });
};

export const cancelScheduledRideAsAdmin = async (admin, scheduledRideId) => {
  const updates = await admin.update(
    "scheduled_rides",
    {
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: `eq.${scheduledRideId}`,
      select: SCHEDULED_RIDE_SELECT,
    },
  );

  return updates[0] || null;
};

export const getFinanceData = async (admin, options = {}) => {
  const [
    financials,
    payments,
    wallets,
    payouts,
    partnerCommissions,
    partnerPayouts,
    paymentAttempts,
    configRows,
    flutterwaveReport,
  ] = await Promise.all([
    safeSelect(() =>
      admin.select("ride_financials", {
        limit: 60,
        order: "created_at.desc",
        select:
          "id,ride_id,booking_fare_amount,service_fee_amount,partner_fee_amount,customer_total_amount,processor_fee_amount,payout_fee_amount,partner_commission_amount,driver_gross_amount,driver_net_payout_amount,drop_net_margin_amount,currency,created_at,updated_at",
      }),
    ),
    safeSelect(() =>
      admin.select("customer_payments", {
        limit: 60,
        order: "created_at.desc",
        select:
          "id,ride_id,customer_id,amount,currency,payment_method,provider,provider_reference,provider_fee_amount,status,metadata,paid_at,created_at",
      }),
    ),
    safeSelect(() =>
      admin.select("driver_wallets", {
        order: "updated_at.desc",
        select:
          "driver_id,available_balance,pending_balance,auto_withdraw_enabled,auto_withdraw_minimum_amount,created_at,updated_at",
      }),
    ),
    safeSelect(() =>
      admin.select("driver_payouts", {
        limit: 60,
        order: "requested_at.desc",
        select:
          "id,driver_id,payout_account_id,wallet_transaction_id,ride_id,amount,provider,provider_reference,status,failure_reason,requested_at,completed_at",
      }),
    ),
    safeSelect(() =>
      admin.select("partner_commissions", {
        limit: 60,
        order: "created_at.desc",
        select:
          "id,ride_id,partner_id,commission_type,commission_value,commission_amount,status,hold_until,approved_at,paid_at,notes,created_at,updated_at",
      }),
    ),
    safeSelect(() =>
      admin.select("partner_payouts", {
        limit: 40,
        order: "created_at.desc",
        select:
          "id,partner_id,period_start,period_end,gross_commission_amount,adjustment_amount,net_payout_amount,status,reference,paid_at,created_at,updated_at",
      }),
    ),
    safeSelect(() =>
      admin.select("payment_attempts", {
        limit: 80,
        order: "created_at.desc",
        select: PAYMENT_ATTEMPT_SELECT,
      }),
    ),
    admin.select("app_configs", {
      key: "in.(driver_monthly_fee,hybrid_finance_settings)",
      order: "key.asc",
      select: "key,description,value,updated_at",
    }),
    getFlutterwaveTransactionStatusReport(options.flutterwave || {}),
  ]);

  const rideIds = toIdList(
    [
      ...financials,
      ...payments,
      ...payouts,
      ...partnerCommissions,
    ],
    "ride_id",
  );
  const driverIds = toIdList([...wallets, ...payouts], "driver_id");
  const customerIds = toIdList([...payments, ...paymentAttempts], "customer_id");
  const paymentAttemptDriverIds = toIdList(
    [
      ...paymentAttempts,
      ...paymentAttempts.map((attempt) => ({
        driver_id: attempt.actor_user_id,
      })),
    ],
    "driver_id",
  );
  const combinedDriverIds = Array.from(new Set([...driverIds, ...paymentAttemptDriverIds]));
  const partnerIds = toIdList([...partnerCommissions, ...partnerPayouts], "partner_id");

  const [rides, drivers, customers, partners] = await Promise.all([
    rideIds.length
      ? admin.select("rides", {
          id: inFilter(rideIds),
          select:
            "id,customer_id,driver_id,partner_id,status,pickup_address,destination_address,price,created_at,completed_at,payment_status,settlement_status",
        })
      : Promise.resolve([]),
    combinedDriverIds.length
      ? admin.select("profiles", {
          id: inFilter(combinedDriverIds),
          select: "id,full_name,phone,email,is_verified,has_paid",
        })
      : Promise.resolve([]),
    customerIds.length
      ? admin.select("profiles", {
          id: inFilter(customerIds),
          select: "id,full_name,phone,email,is_verified,total_trips",
        })
      : Promise.resolve([]),
    partnerIds.length
      ? admin.select("partners", {
          id: inFilter(partnerIds),
          select:
            "id,name,slug,status,contact_name,contact_email,contact_phone,default_partner_fee_amount,default_commission_type,default_commission_value,payout_schedule,updated_at",
        })
      : Promise.resolve([]),
  ]);

  const rideById = indexBy(rides, "id");
  const driverById = indexBy(drivers, "id");
  const customerById = indexBy(customers, "id");
  const partnerById = indexBy(partners, "id");
  const configMap = mapConfigRows(configRows);
  const mappedPaymentAttempts = paymentAttempts.map((attempt) => ({
    ...attempt,
    customer: attempt.customer_id ? customerById.get(attempt.customer_id) || null : null,
    driver:
      driverById.get(attempt.driver_id) ||
      driverById.get(attempt.actor_user_id) ||
      null,
    ride: attempt.ride_id ? rideById.get(attempt.ride_id) || null : null,
  }));
  const mergedFlutterwaveReport = mergeFlutterwaveReportWithPaymentAttempts(
    flutterwaveReport,
    mappedPaymentAttempts,
  );

  return {
    configs: {
      driverMonthlyFee: configMap.driver_monthly_fee?.value || null,
      hybridFinanceSettings: configMap.hybrid_finance_settings?.value || null,
    },
    customerPayments: payments.map((payment) => ({
      ...payment,
      customer: customerById.get(payment.customer_id) || null,
      ride: rideById.get(payment.ride_id) || null,
    })),
    driverPayouts: payouts.map((payout) => ({
      ...payout,
      driver: driverById.get(payout.driver_id) || null,
      ride: rideById.get(payout.ride_id) || null,
    })),
    driverWallets: wallets.map((wallet) => ({
      ...wallet,
      driver: driverById.get(wallet.driver_id) || null,
    })),
    flutterwaveTransactions: mergedFlutterwaveReport,
    paymentAttempts: mappedPaymentAttempts,
    partnerCommissions: partnerCommissions.map((commission) => ({
      ...commission,
      partner: partnerById.get(commission.partner_id) || null,
      ride: rideById.get(commission.ride_id) || null,
    })),
    partnerPayouts: partnerPayouts.map((payout) => ({
      ...payout,
      partner: partnerById.get(payout.partner_id) || null,
    })),
    rideFinancials: financials.map((entry) => ({
      ...entry,
      ride: rideById.get(entry.ride_id) || null,
    })),
    totals: {
      pendingPartnerCommissionAmount: sumBy(
        partnerCommissions,
        "commission_amount",
        (entry) => entry.status !== "paid",
      ),
      processingDriverPayoutAmount: sumBy(
        payouts,
        "amount",
        (entry) => entry.status === "queued" || entry.status === "processing",
      ),
      totalAvailableWalletBalance: sumBy(wallets, "available_balance"),
      totalCustomerPaymentsCaptured: sumBy(
        payments,
        "amount",
        (entry) => entry.status === "paid",
      ),
      totalDropNetMarginObserved: sumBy(financials, "drop_net_margin_amount"),
      totalPendingWalletBalance: sumBy(wallets, "pending_balance"),
    },
  };
};

export const getPartnersData = async (admin, filters = {}) => {
  const [
    partners,
    members,
    links,
    payouts,
    payoutAccounts,
    commissions,
    codes,
    attributions,
    partnerAccounts,
  ] =
    await Promise.all([
      safeSelect(() =>
        admin.select("partners", {
          limit: Math.min(Number(filters.limit) || 120, 250),
          order: "updated_at.desc",
          select:
            "id,name,slug,status,contact_name,contact_email,contact_phone,default_partner_fee_amount,default_commission_type,default_commission_value,payout_schedule,metadata,created_at,updated_at",
        }),
      ),
      safeSelect(() =>
        admin.select("partner_members", {
          order: "created_at.desc",
          select: "id,partner_id,auth_user_id,role,created_at",
        }),
      ),
      safeSelect(() =>
        admin.select("partner_customer_links", {
          order: "attributed_at.desc",
          select:
            "id,partner_id,customer_id,attribution_source,source_code,attributed_at,expires_at",
        }),
      ),
      safeSelect(() =>
        admin.select("partner_payouts", {
          order: "created_at.desc",
          select:
            "id,partner_id,period_start,period_end,gross_commission_amount,adjustment_amount,net_payout_amount,status,reference,paid_at,created_at,updated_at",
        }),
      ),
      safeSelect(() =>
        admin.select("partner_payout_accounts", {
          order: "updated_at.desc",
          select:
            "id,partner_id,bank_name,bank_code,account_number,account_name,provider,provider_email,recipient_reference,sub_account_code,settlement_profile_code,settlement_report_emails,is_default,updated_at",
        }),
      ),
      safeSelect(() =>
        admin.select("partner_commissions", {
          order: "created_at.desc",
          select:
            "id,partner_id,ride_id,commission_type,commission_value,commission_amount,status,hold_until,approved_at,paid_at,notes,created_at,updated_at",
        }),
      ),
      safeSelect(() =>
        admin.select("partner_referral_codes", {
          order: "created_at.desc",
          select: "id,partner_id,code,status,created_at",
        }),
      ),
      safeSelect(() =>
        admin.select("ride_partner_attributions", {
          order: "created_at.desc",
          limit: 180,
          select:
            "id,ride_id,partner_id,customer_id,source_code,attribution_source,created_at",
        }),
      ),
      safeSelect(() =>
        admin.select("dashboard_accounts", {
          order: "created_at.desc",
          role: "eq.partner",
          select:
            "id,username,display_name,role,partner_id,is_active,last_login_at,created_at,updated_at",
        }),
      ),
    ]);

  const partnerIds = toIdList(partners);
  const customerIds = toIdList(links, "customer_id");
  const [customers] = await Promise.all([
    customerIds.length
      ? admin.select("profiles", {
          id: inFilter(customerIds),
          select: "id,full_name,phone,email,is_verified,total_trips",
        })
      : Promise.resolve([]),
  ]);

  const customerById = indexBy(customers, "id");
  const membersByPartnerId = groupBy(members, "partner_id");
  const linksByPartnerId = groupBy(links, "partner_id");
  const payoutsByPartnerId = groupBy(payouts, "partner_id");
  const payoutAccountsByPartnerId = groupBy(payoutAccounts, "partner_id");
  const commissionsByPartnerId = groupBy(commissions, "partner_id");
  const codesByPartnerId = groupBy(codes, "partner_id");
  const attributionByPartnerId = groupBy(attributions, "partner_id");
  const accountByPartnerId = indexBy(partnerAccounts, "partner_id");
  const matchesSearch = buildSearchMatcher(filters.search);

  return partners
    .map((partner) => {
      const partnerLinks = (linksByPartnerId.get(partner.id) || []).map((link) => ({
        ...link,
        customer: customerById.get(link.customer_id) || null,
      }));

      return {
        ...partner,
        active_referral_codes: (codesByPartnerId.get(partner.id) || []).filter(
          (code) => code.status === "active",
        ),
        access_account: accountByPartnerId.get(partner.id) || null,
        attribution_count: (attributionByPartnerId.get(partner.id) || []).length,
        commission_due_amount: sumBy(
          commissionsByPartnerId.get(partner.id) || [],
          "commission_amount",
          (entry) => entry.status !== "paid",
        ),
        commissions: sortByDateDesc(commissionsByPartnerId.get(partner.id) || [], "created_at").slice(
          0,
          5,
        ),
        customer_links: partnerLinks,
        members: membersByPartnerId.get(partner.id) || [],
        payout_accounts: payoutAccountsByPartnerId.get(partner.id) || [],
        recent_payouts: sortByDateDesc(payoutsByPartnerId.get(partner.id) || [], "created_at").slice(
          0,
          3,
        ),
        total_customer_links: partnerLinks.length,
      };
    })
    .filter((partner) => {
      if (!filters.search) {
        return true;
      }

      return [
        partner.id,
        partner.name,
        partner.slug,
        partner.contact_email,
        partner.contact_phone,
      ].some(matchesSearch);
    });
};

export const getAccessData = async (admin) => {
  const [accounts, partners] = await Promise.all([
    safeSelect(() =>
      admin.select("dashboard_accounts", {
        order: "created_at.desc",
        select: DASHBOARD_ACCOUNT_SELECT,
      }),
    ),
    safeSelect(() =>
      admin.select("partners", {
        order: "name.asc",
        select: "id,name,slug,status,contact_email,contact_phone,updated_at",
      }),
    ),
  ]);

  const partnerById = indexBy(partners, "id");

  return {
    accounts: accounts.map((account) =>
      withRoleTitle({
        ...account,
        is_bootstrap: Boolean(account.metadata?.bootstrap),
        partner: account.partner_id ? partnerById.get(account.partner_id) || null : null,
      }),
    ),
    partnerOptions: partners,
    totals: {
      adminAccounts: accounts.filter((account) => account.role === "admin").length,
      partnerAccounts: accounts.filter((account) => account.role === "partner").length,
      staffAccounts: accounts.filter((account) => account.role === "staff").length,
      superAdminAccounts: accounts.filter((account) => account.role === "super_admin").length,
      totalAccounts: accounts.length,
      totalPartners: partners.length,
    },
  };
};

export const getPartnerWorkspaceData = async (admin, { partnerId } = {}) => {
  if (!partnerId) {
    return null;
  }

  const [partner, links, payouts, commissions, codes, rides, account, brandingConfig] = await Promise.all([
    safeSelectOne(() =>
      admin.selectOne("partners", {
        id: `eq.${partnerId}`,
        select:
          "id,name,slug,status,contact_name,contact_email,contact_phone,default_partner_fee_amount,default_commission_type,default_commission_value,payout_schedule,metadata,created_at,updated_at",
      }),
    ),
    safeSelect(() =>
      admin.select("partner_customer_links", {
        limit: 30,
        order: "attributed_at.desc",
        partner_id: `eq.${partnerId}`,
        select:
          "id,partner_id,customer_id,attribution_source,source_code,attributed_at,expires_at",
      }),
    ),
    safeSelect(() =>
      admin.select("partner_payouts", {
        limit: 20,
        order: "created_at.desc",
        partner_id: `eq.${partnerId}`,
        select:
          "id,partner_id,period_start,period_end,gross_commission_amount,adjustment_amount,net_payout_amount,status,reference,paid_at,created_at,updated_at",
      }),
    ),
    safeSelect(() =>
      admin.select("partner_commissions", {
        limit: 24,
        order: "created_at.desc",
        partner_id: `eq.${partnerId}`,
        select:
          "id,ride_id,partner_id,commission_type,commission_value,commission_amount,status,hold_until,approved_at,paid_at,notes,created_at,updated_at",
      }),
    ),
    safeSelect(() =>
      admin.select("partner_referral_codes", {
        limit: 20,
        order: "created_at.desc",
        partner_id: `eq.${partnerId}`,
        select: "id,partner_id,code,status,created_at",
      }),
    ),
    safeSelect(() =>
      admin.select("rides", {
        limit: 24,
        order: "created_at.desc",
        partner_id: `eq.${partnerId}`,
        select: RIDE_SELECT,
      }),
    ),
    safeSelectOne(() =>
      admin.selectOne("dashboard_accounts", {
        partner_id: `eq.${partnerId}`,
        role: "eq.partner",
        select:
          "id,username,display_name,role,partner_id,is_active,last_login_at,password_updated_at,created_at,updated_at",
      }),
    ),
    safeSelectOne(() =>
      admin.selectOne("app_configs", {
        key: "eq.dashboard_branding",
        select: "key,description,value,updated_at",
      }),
    ),
  ]);

  if (!partner) {
    return null;
  }

  const customerIds = toIdList(links, "customer_id");
  const [customers] = await Promise.all([
    customerIds.length
      ? admin.select("profiles", {
          id: inFilter(customerIds),
          select: "id,full_name,phone,email,is_verified,total_trips,rating",
        })
      : Promise.resolve([]),
  ]);

  const customerById = indexBy(customers, "id");
  const recentCustomerLinks = links.map((link) => ({
    ...link,
    customer: customerById.get(link.customer_id) || null,
  }));

  return {
    account: account || null,
    branding: brandingConfig?.value || null,
    counts: {
      activeReferralCodes: codes.filter((code) => code.status === "active").length,
      activeRides: rides.filter((ride) => ACTIVE_RIDE_STATUSES.includes(ride.status)).length,
      commissionDueAmount: sumBy(
        commissions,
        "commission_amount",
        (entry) => entry.status !== "paid",
      ),
      customerLinks: recentCustomerLinks.length,
      totalRides: rides.length,
    },
    partner: {
      ...partner,
      active_referral_codes: codes.filter((code) => code.status === "active"),
      recent_commissions: commissions.slice(0, 8),
      recent_payouts: payouts.slice(0, 8),
      recent_rides: rides.slice(0, 10),
      recent_customer_links: recentCustomerLinks.slice(0, 10),
    },
    recentCommissions: commissions,
    recentCustomerLinks,
    recentPayouts: payouts,
    recentRides: rides,
  };
};

export const createPartner = async (admin, payload = {}) => {
  const [partner] = await admin.insert("partners", {
    name: payload.name,
    slug: payload.slug,
    status: payload.status || "active",
    contact_name: payload.contact_name || null,
    contact_email: payload.contact_email || null,
    contact_phone: payload.contact_phone || null,
    default_partner_fee_amount: Number(payload.default_partner_fee_amount || 0),
    default_commission_type: payload.default_commission_type || "flat",
    default_commission_value: Number(payload.default_commission_value || 0),
    payout_schedule: payload.payout_schedule || "monthly",
    metadata: payload.metadata || {},
  });

  return partner || null;
};

export const updatePartner = async (admin, partnerId, payload = {}) => {
  const updates = await admin.update(
    "partners",
    {
      updated_at: new Date().toISOString(),
      ...payload,
    },
    {
      id: `eq.${partnerId}`,
      select:
        "id,name,slug,status,contact_name,contact_email,contact_phone,default_partner_fee_amount,default_commission_type,default_commission_value,payout_schedule,metadata,created_at,updated_at",
    },
  );

  return updates[0] || null;
};

export const updatePartnerBranding = async (admin, partnerId, payload = {}) => {
  const currentPartner = await safeSelectOne(() =>
    admin.selectOne("partners", {
      id: `eq.${partnerId}`,
      select: "id,metadata",
    }),
  );

  if (!currentPartner) {
    throw new Error("Partner could not be found.");
  }

  const nextLogoUrl = String(payload.logoUrl || "").trim();
  const clearLogo = payload.clearLogo === true;

  if (nextLogoUrl.length > 1_500_000) {
    throw new Error("The logo file is too large. Please use a smaller image.");
  }

  if (
    nextLogoUrl &&
    !(
      nextLogoUrl.startsWith("data:image/") ||
      nextLogoUrl.startsWith("/") ||
      /^https?:\/\//i.test(nextLogoUrl)
    )
  ) {
    throw new Error("Use an image upload, a relative asset path, or an https image URL.");
  }

  const nextMetadata = {
    ...(currentPartner.metadata || {}),
  };

  if (clearLogo || !nextLogoUrl) {
    delete nextMetadata.portal_logo_url;
  } else {
    nextMetadata.portal_logo_url = nextLogoUrl;
    nextMetadata.portal_logo_updated_at = new Date().toISOString();
  }

  return updatePartner(admin, partnerId, {
    metadata: nextMetadata,
  });
};

export const updatePartnerCommission = async (admin, commissionId, payload = {}) => {
  const nextPayload = {
    updated_at: new Date().toISOString(),
  };

  const allowedFields = ["status", "notes", "approved_at", "paid_at"];
  for (const field of allowedFields) {
    if (payload[field] !== undefined) {
      nextPayload[field] = payload[field];
    }
  }

  const updates = await admin.update("partner_commissions", nextPayload, {
    id: `eq.${commissionId}`,
    select:
      "id,partner_id,ride_id,commission_type,commission_value,commission_amount,status,hold_until,approved_at,paid_at,notes,created_at,updated_at",
  });

  return updates[0] || null;
};

export const getSupportData = async (admin, filters = {}, context = {}) => {
  const [reports, reviews, messages, supportResponses, threadReads] = await Promise.all([
    admin.select("reports", {
      limit: Math.min(Number(filters.limit) || 120, 250),
      order: "created_at.desc",
      select:
        "id,ride_id,reporter_id,target_id,issue_category,description,status,created_at",
    }),
    admin.select("reviews", {
      limit: 60,
      order: "created_at.desc",
      select:
        "id,ride_id,customer_id,driver_id,rating,comment,reviewer_id,target_id,created_at",
    }),
    admin.select("ride_messages", {
      limit: 120,
      order: "created_at.desc",
      select: "id,ride_id,sender_id,receiver_id,content,image_url,created_at",
    }),
    safeSelect(() =>
      admin.select("dashboard_support_responses", {
        limit: 200,
        order: "created_at.desc",
        select:
          "id,ride_id,created_by_account_id,created_by_username,audience,title,body,recipient_ids,created_at",
      }),
    ),
    context.accountId
      ? safeSelect(() =>
          admin.select("dashboard_support_thread_reads", {
            account_id: `eq.${context.accountId}`,
            select: "ride_id,last_seen_message_id,last_seen_at",
          }),
        )
      : Promise.resolve([]),
  ]);

  const rideIds = toIdList(
    [...reports, ...reviews, ...messages, ...supportResponses],
    "ride_id",
  );

  const rides = rideIds.length
    ? await admin.select("rides", {
        id: inFilter(rideIds),
        select:
          "id,customer_id,driver_id,status,pickup_address,destination_address,created_at,completed_at,payment_status,payment_follow_up_status,updated_at",
      })
    : [];

  const profileIds = Array.from(
    new Set([
      ...toIdList([...reports, ...reviews], "reporter_id"),
      ...toIdList(reviews, "reviewer_id"),
      ...toIdList(reviews, "target_id"),
      ...toIdList(messages, "sender_id"),
      ...toIdList(messages, "receiver_id"),
      ...toIdList(rides, "customer_id"),
      ...toIdList(rides, "driver_id"),
    ]),
  );

  const profiles = profileIds.length
    ? await admin.select("profiles", {
        id: inFilter(profileIds),
        select: "id,full_name,phone,email,role,is_verified,rating,total_trips",
      })
    : [];

  const rideById = indexBy(rides, "id");
  const profileById = indexBy(profiles, "id");
  const reportsByRideId = groupBy(reports, "ride_id");
  const reviewsByRideId = groupBy(reviews, "ride_id");
  const messagesByRideId = groupBy(messages, "ride_id");
  const responsesByRideId = groupBy(supportResponses, "ride_id");
  const readByRideId = indexBy(threadReads, "ride_id");
  const matchesSearch = buildSearchMatcher(filters.search);

  const mappedReports = reports.map((report) => ({
    ...report,
    reporter: profileById.get(report.reporter_id) || null,
    ride: rideById.get(report.ride_id) || null,
    target: profileById.get(report.target_id) || null,
  }));

  const mappedReviews = reviews.map((review) => ({
    ...review,
    reviewer: profileById.get(review.reviewer_id) || null,
    ride: rideById.get(review.ride_id) || null,
    target: profileById.get(review.target_id) || null,
  }));

  const mappedMessages = messages.map((message) => ({
    ...message,
    receiver: profileById.get(message.receiver_id) || null,
    ride: rideById.get(message.ride_id) || null,
    sender: profileById.get(message.sender_id) || null,
  }));

  const threads = sortByDateDesc(
    rideIds
      .map((rideId) => {
        const ride = rideById.get(rideId) || null;
        const customer = ride?.customer_id ? profileById.get(ride.customer_id) || null : null;
        const driver = ride?.driver_id ? profileById.get(ride.driver_id) || null : null;
        const threadMessages = sortByDateAsc(messagesByRideId.get(rideId) || [], "created_at").map(
          (message) => ({
            ...message,
            receiver: profileById.get(message.receiver_id) || null,
            sender: profileById.get(message.sender_id) || null,
          }),
        );
        const threadResponses = sortByDateAsc(
          responsesByRideId.get(rideId) || [],
          "created_at",
        );
        const threadReports = (reportsByRideId.get(rideId) || []).map((report) => ({
          ...report,
          reporter: profileById.get(report.reporter_id) || null,
          target: profileById.get(report.target_id) || null,
        }));
        const threadReviews = (reviewsByRideId.get(rideId) || []).map((review) => ({
          ...review,
          reviewer: profileById.get(review.reviewer_id) || null,
          target: profileById.get(review.target_id) || null,
        }));
        const latestMessage = threadMessages[threadMessages.length - 1] || null;
        const latestResponse = threadResponses[threadResponses.length - 1] || null;
        const lastSeenMessageId = context.accountId
          ? Number(readByRideId.get(rideId)?.last_seen_message_id || 0)
          : Number(latestMessage?.id || 0);
        const unreadMessages = threadMessages.filter(
          (message) => Number(message.id || 0) > lastSeenMessageId,
        ).length;
        const lastActivityAt =
          latestMessage?.created_at ||
          latestResponse?.created_at ||
          ride?.updated_at ||
          ride?.created_at ||
          null;

        return {
          customer,
          driver,
          hasOpenReport: threadReports.some((report) => report.status !== "resolved"),
          last_activity_at: lastActivityAt,
          last_message: latestMessage,
          reports: sortByDateDesc(threadReports, "created_at"),
          responses: threadResponses,
          reviews: sortByDateDesc(threadReviews, "created_at"),
          ride,
          ride_id: rideId,
          transcript: [
            ...threadMessages.map((message) => ({
              ...message,
              entry_type: "message",
            })),
            ...threadResponses.map((response) => ({
              ...response,
              entry_type: "response",
            })),
          ].sort(
            (left, right) =>
              new Date(left?.created_at || 0).getTime() -
              new Date(right?.created_at || 0).getTime(),
          ),
          unread_messages: unreadMessages,
        };
      })
      .filter((thread) => {
        if (!thread.ride_id || !thread.transcript?.length) {
          return false;
        }

        if (!filters.search) {
          return true;
        }

        return [
          thread.ride_id,
          thread.ride?.pickup_address,
          thread.ride?.destination_address,
          thread.customer?.full_name,
          thread.customer?.phone,
          thread.driver?.full_name,
          thread.driver?.phone,
          thread.last_message?.content,
          ...thread.reports.map((report) => report.description),
          ...thread.reports.map((report) => report.issue_category),
          ...thread.responses.map((response) => response.body),
        ].some(matchesSearch);
      }),
    "last_activity_at",
  );

  return {
    counts: {
      activeThreads: threads.length,
      lowRatingReviews: mappedReviews.filter((review) => Number(review.rating || 0) <= 3)
        .length,
      openReports: mappedReports.filter((report) => report.status !== "resolved").length,
      totalMessages: mappedMessages.length,
      unreadMessages: threads.reduce(
        (sum, thread) => sum + Number(thread.unread_messages || 0),
        0,
      ),
    },
    messages: mappedMessages,
    reports: mappedReports
      .filter((report) => {
        if (!filters.search) {
          return true;
        }

        return [
          report.id,
          report.issue_category,
          report.description,
          report.reporter?.full_name,
          report.target?.full_name,
        ].some(matchesSearch);
      }),
    reviews: mappedReviews,
    threads,
  };
};

export const updateReport = async (admin, reportId, payload = {}) => {
  const updates = await admin.update(
    "reports",
    {
      status: payload.status,
    },
    {
      id: `eq.${reportId}`,
      select:
        "id,ride_id,reporter_id,target_id,issue_category,description,status,created_at",
    },
  );

  return updates[0] || null;
};

export const sendPushNotification = async (admin, payload = {}) => {
  const explicitRecipientIds = toArray(payload.recipientIds).filter(Boolean);
  const audience = String(payload.audience || (explicitRecipientIds.length ? "custom" : "both"));
  let resolvedRecipientIds = explicitRecipientIds;

  if (!resolvedRecipientIds.length && ["drivers", "customers", "both"].includes(audience)) {
    const roleFilter =
      audience === "both"
        ? "in.(driver,customer)"
        : `eq.${audience === "drivers" ? "driver" : "customer"}`;
    const audienceProfiles = await safeSelect(() =>
      admin.select("profiles", {
        expo_push_token: "not.is.null",
        role: roleFilter,
        select: "id",
      }),
    );
    resolvedRecipientIds = toIdList(audienceProfiles);
  }

  if (!resolvedRecipientIds.length) {
    return {
      audience,
      recipientIds: [],
      sent: 0,
      status: "ok",
    };
  }

  const { data } = await admin.invokeFunction("send-push-notification", {
    body: {
      body: payload.body,
      channelId: payload.channelId || "trip-alerts",
      data: payload.data || {},
      recipientIds: resolvedRecipientIds,
      sticky: payload.sticky !== false,
      title: payload.title,
    },
  });

  return {
    ...(data || {}),
    audience,
    recipientIds: resolvedRecipientIds,
  };
};

export const markSupportThreadSeen = async (
  admin,
  accountId,
  rideId,
  lastSeenMessageId,
) => {
  if (!accountId || !rideId || !lastSeenMessageId) {
    return null;
  }

  const [row] = await admin.upsert(
    "dashboard_support_thread_reads",
    {
      account_id: accountId,
      last_seen_at: new Date().toISOString(),
      last_seen_message_id: Number(lastSeenMessageId),
      ride_id: rideId,
    },
    {
      on_conflict: "account_id,ride_id",
    },
  );

  return row || null;
};

export const sendSupportReply = async (admin, session, payload = {}) => {
  const rideId = String(payload.rideId || "");
  const body = String(payload.body || "").trim();
  const audience = String(payload.audience || "both");
  const title = String(payload.title || "Support response from Drop").trim();

  if (!rideId || !body) {
    throw new Error("Ride and response body are required.");
  }

  const ride = await admin.selectOne("rides", {
    id: `eq.${rideId}`,
    select: "id,customer_id,driver_id,pickup_address,destination_address,status",
  });

  if (!ride) {
    throw new Error("Support thread ride was not found.");
  }

  const recipientIds =
    toArray(payload.recipientIds).filter(Boolean).length > 0
      ? toArray(payload.recipientIds).filter(Boolean)
      : [
          audience === "driver" || audience === "both" ? ride.driver_id : null,
          audience === "customer" || audience === "both" ? ride.customer_id : null,
        ].filter(Boolean);

  if (!recipientIds.length) {
    throw new Error("No recipients are available for this support response.");
  }

  const [responseRow] = await admin.insert("dashboard_support_responses", {
    audience,
    body,
    created_by_account_id: session.accountId || null,
    created_by_username: session.displayName || session.username,
    recipient_ids: recipientIds,
    ride_id: rideId,
    title: title || null,
  });

  const pushResult = await sendPushNotification(admin, {
    body,
    channelId: payload.channelId || "trip-alerts",
    data: {
      rideId,
      type: "support_response",
    },
    recipientIds,
    sticky: false,
    title: title || "Support response from Drop",
  });

  return {
    push: pushResult,
    response: responseRow || null,
    ride,
  };
};

export const getSettingsData = async (admin, config) => {
  const [appConfigs, cancelReasons, serviceTypes, rawDispatchConfigs, dispatchSettings] =
    await Promise.all([
      admin.select("app_configs", {
        order: "key.asc",
        select: "key,description,value,updated_at",
      }),
      admin.select("cancel_reasons", {
        order: ["role.asc", "display_order.asc"],
        select: "id,role,label,value,is_active,display_order",
      }),
      admin.select("service_types", {
        order: "sort_order.asc",
        select:
          "id,name,label,description,is_active,created_at,sort_order,capacity",
      }),
      admin.select("app_dispatch_configs", {
        order: "key.asc",
        select: "key,value,updated_at",
      }),
      getDispatchSettings(admin, config.dispatchAdminToken),
    ]);

  return {
    appConfigs,
    cancelReasons,
    dispatchSettings,
    rawDispatchConfigs,
    serviceTypes,
  };
};

export const updateAppConfig = async (admin, key, payload = {}) => {
  const [configRow] = await admin.upsert(
    "app_configs",
    {
      key,
      description: payload.description || null,
      updated_at: new Date().toISOString(),
      value: payload.value ?? {},
    },
    {
      on_conflict: "key",
      select: "key,description,value,updated_at",
    },
  );

  return configRow || null;
};

const normalizeDispatchPatchPayload = (payload = {}) => {
  const nextPayload = {};

  const fieldMap = {
    driverLocationStaleSeconds: "driverLocationStaleSeconds",
    liveEtaRefreshSeconds: "liveEtaRefreshSeconds",
    maxPickupDistanceM: "maxPickupDistanceM",
    routingCandidateLimit: "routingCandidateLimit",
    routingEnabled: "routingEnabled",
    routingPreference: "routingPreference",
    routingProvider: "routingProvider",
    routingRequestTimeoutMs: "routingRequestTimeoutMs",
  };

  for (const [inputKey, outputKey] of Object.entries(fieldMap)) {
    if (payload[inputKey] !== undefined) {
      nextPayload[outputKey] = payload[inputKey];
    }
  }

  return nextPayload;
};

export const updateDispatchSettings = async (admin, config, payload = {}) => {
  const normalizedPayload = normalizeDispatchPatchPayload(payload);

  if (config.dispatchAdminToken) {
    const { data } = await admin.invokeFunction("dispatch-settings", {
      body: normalizedPayload,
      headers: {
        "x-dispatch-admin-token": config.dispatchAdminToken,
      },
      method: "PATCH",
    });

    return data?.data || null;
  }

  const current = await safeSelectOne(() =>
    admin.selectOne("app_dispatch_configs", {
      key: "eq.defaults",
      select: "key,value,updated_at",
    }),
  );

  const nextValue = {
    ...(current?.value || {}),
  };

  if (payload.maxPickupDistanceM !== undefined) {
    nextValue.max_pickup_distance_m = Number(payload.maxPickupDistanceM);
  }

  if (payload.driverLocationStaleSeconds !== undefined) {
    nextValue.driver_location_stale_seconds = Number(
      payload.driverLocationStaleSeconds,
    );
  }

  if (payload.routingEnabled !== undefined) {
    nextValue.routing_enabled = Boolean(payload.routingEnabled);
  }

  if (payload.routingProvider !== undefined) {
    nextValue.routing_provider = payload.routingProvider;
  }

  if (payload.routingCandidateLimit !== undefined) {
    nextValue.routing_candidate_limit_per_service = Number(
      payload.routingCandidateLimit,
    );
  }

  if (payload.routingRequestTimeoutMs !== undefined) {
    nextValue.routing_request_timeout_ms = Number(payload.routingRequestTimeoutMs);
  }

  if (payload.routingPreference !== undefined) {
    nextValue.routing_preference = payload.routingPreference;
  }

  if (payload.liveEtaRefreshSeconds !== undefined) {
    nextValue.live_eta_refresh_seconds = Number(payload.liveEtaRefreshSeconds);
  }

  const [row] = await admin.upsert(
    "app_dispatch_configs",
    {
      key: "defaults",
      updated_at: new Date().toISOString(),
      value: nextValue,
    },
    {
      on_conflict: "key",
      select: "key,value,updated_at",
    },
  );

  return row?.value || null;
};

export const updateServiceType = async (admin, serviceTypeId, payload = {}) => {
  const updates = await admin.update(
    "service_types",
    {
      ...payload,
    },
    {
      id: `eq.${serviceTypeId}`,
      select:
        "id,name,label,description,is_active,created_at,sort_order,capacity",
    },
  );

  return updates[0] || null;
};

export const createServiceType = async (admin, payload = {}) => {
  const [serviceType] = await admin.insert("service_types", {
    name: payload.name,
    label: payload.label,
    description: payload.description || null,
    is_active: payload.is_active !== false,
    sort_order: Number(payload.sort_order || 0),
    capacity: Number(payload.capacity || 4),
  });

  return serviceType || null;
};

export const updateCancelReason = async (admin, cancelReasonId, payload = {}) => {
  const updates = await admin.update(
    "cancel_reasons",
    {
      ...payload,
    },
    {
      id: `eq.${cancelReasonId}`,
      select: "id,role,label,value,is_active,display_order",
    },
  );

  return updates[0] || null;
};

export const createCancelReason = async (admin, payload = {}) => {
  const [cancelReason] = await admin.insert("cancel_reasons", {
    role: payload.role,
    label: payload.label,
    value: payload.value,
    is_active: payload.is_active !== false,
    display_order: Number(payload.display_order || 0),
  });

  return cancelReason || null;
};
