import type { NextRequest } from "next/server";
import { assertDashboardEnv, env } from "@/lib/env";
import { jsonError } from "@/lib/route-utils";

export const runtime = "edge";

const webhookHeaders = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json",
};

const buildWebhookUrl = () => {
  const baseUrl = env.supabaseFunctionUrl.replace(/\/$/, "");
  const functionName = env.dashboardFunctionName.replace(/^\/+|\/+$/g, "");
  return `${baseUrl}/${functionName}/webhooks/flutterwave`;
};

export async function POST(request: NextRequest) {
  try {
    assertDashboardEnv();

    const rawBody = await request.text();
    const headers: Record<string, string> = {
      Accept: "application/json",
      "Content-Type": request.headers.get("content-type") || "application/json",
    };

    if (env.supabaseAnonKey) {
      headers.Authorization = `Bearer ${env.supabaseAnonKey}`;
      headers.apikey = env.supabaseAnonKey;
    }

    const verificationHash = request.headers.get("verif-hash");
    if (verificationHash) {
      headers["verif-hash"] = verificationHash;
    }

    const flutterwaveSignature = request.headers.get("flutterwave-signature");
    if (flutterwaveSignature) {
      headers["flutterwave-signature"] = flutterwaveSignature;
    }

    const response = await fetch(buildWebhookUrl(), {
      body: rawBody,
      headers,
      method: "POST",
    });
    const payload = await response.json().catch(() => ({
      ok: response.ok,
    }));

    return new Response(JSON.stringify(payload), {
      headers: webhookHeaders,
      status: response.status,
    });
  } catch (error) {
    return jsonError(error, 500);
  }
}
