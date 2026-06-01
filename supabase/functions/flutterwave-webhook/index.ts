import { createSupabaseAdmin } from "../_shared/supabase-admin.ts";

type AnyRecord = Record<string, any>;

type FlutterwaveWebhookPayload = {
  data?: AnyRecord | null;
  event?: string | null;
  type?: string | null;
};

const DEFAULT_FLUTTERWAVE_BASE_URL = "https://api.flutterwave.com/v3";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const FLUTTERWAVE_SECRET_KEY = Deno.env.get("FLUTTERWAVE_SECRET_KEY") ?? "";
const FLUTTERWAVE_SECRET_HASH = Deno.env.get("FLUTTERWAVE_SECRET_HASH") ?? "";
const FLUTTERWAVE_BASE_URL =
  Deno.env.get("FLUTTERWAVE_BASE_URL") ?? DEFAULT_FLUTTERWAVE_BASE_URL;

const corsHeaders = {
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, verif-hash, flutterwave-signature",
  "Access-Control-Allow-Origin": "*",
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    headers: {
      ...corsHeaders,
      "Cache-Control": "no-store",
      "Content-Type": "application/json",
    },
    status,
  });

const supabaseAdmin = createSupabaseAdmin(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const encoder = new TextEncoder();

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
    encoder.encode(secretHash),
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["sign"],
  );

  return encodeBase64(
    await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(rawBody)),
  );
};

const verifyFlutterwaveWebhook = async (rawBody: string, headers: Headers) => {
  const secretHash = FLUTTERWAVE_SECRET_HASH.trim();
  if (!secretHash) {
    throw new Error("FLUTTERWAVE_SECRET_HASH is not configured.");
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

const flutterwaveUrl = (path: string) => {
  const normalizedBaseUrl = (FLUTTERWAVE_BASE_URL || DEFAULT_FLUTTERWAVE_BASE_URL).replace(
    /\/+$/,
    "",
  );
  const baseUrl = /\/v3$/i.test(normalizedBaseUrl)
    ? normalizedBaseUrl
    : `${normalizedBaseUrl}/v3`;
  return new URL(`${baseUrl}/${path.replace(/^\/+/, "")}`);
};

const requestFlutterwave = async <T = AnyRecord>(path: string) => {
  if (!FLUTTERWAVE_SECRET_KEY) {
    throw new Error("FLUTTERWAVE_SECRET_KEY is not configured.");
  }

  const response = await fetch(flutterwaveUrl(path).toString(), {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${FLUTTERWAVE_SECRET_KEY}`,
    },
    method: "GET",
  });
  const payload = (await response.json().catch(() => null)) as AnyRecord | null;

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

  if (
    ["account", "account_transfer", "bank_transfer", "transfer", "ussd"].includes(
      normalized,
    )
  ) {
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

  if (
    Number.isFinite(amountSettled) &&
    amountSettled > 0 &&
    chargedAmount >= amountSettled
  ) {
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

  const status = String(verifiedTransfer?.status || payload.status || "")
    .trim()
    .toLowerCase();
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

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const rawBody = await request.text();
    const isValidWebhook = await verifyFlutterwaveWebhook(rawBody, request.headers);

    if (!isValidWebhook) {
      return jsonResponse({ error: "Invalid webhook signature" }, 401);
    }

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
      eventType === "payment.completed" ||
      eventType === "transaction.completed"
    ) {
      result = await handleFlutterwaveChargeEvent(eventData);
    } else if (
      eventType === "transfer.completed" ||
      eventType === "transfer.disburse"
    ) {
      result = await completeFlutterwaveTransfer(eventData);
    }

    return jsonResponse({
      eventType,
      ok: true,
      ...result,
    });
  } catch (error) {
    console.error("flutterwave-webhook:processing-error", error);
    return jsonResponse({
      error: error instanceof Error ? error.message : "Webhook processing failed.",
      ok: false,
    });
  }
});
