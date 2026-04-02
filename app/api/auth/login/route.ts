import { NextRequest, NextResponse } from "next/server";
import { applyAdminSessionCookies, isSecureRequest } from "@/lib/auth";
import { assertDashboardEnv } from "@/lib/env";
import { invokeDashboardEdge } from "@/lib/edge-function-client";
import { enforceRateLimit } from "@/lib/rate-limit";
import { assertSameOrigin, jsonError, jsonSuccess } from "@/lib/route-utils";

export const runtime = "edge";

type LoginPayload = {
  password?: string;
  username?: string;
};

export async function POST(request: NextRequest) {
  try {
    assertDashboardEnv();
    assertSameOrigin(request);
    enforceRateLimit(request, {
      key: "auth-login",
      limit: 5,
      windowMs: 1000 * 60 * 10,
    });

    const payload = (await request.json()) as LoginPayload;
    const username = String(payload.username || "").trim();
    const password = String(payload.password || "");

    if (!username || !password) {
      return NextResponse.json(
        { error: "Username and password are required." },
        { status: 400 },
      );
    }
    const session = await invokeDashboardEdge<{
      authenticated: boolean;
      csrfToken: string;
      expiresAt: number;
      sessionToken: string;
      username: string;
    }>("auth/login", {
      body: {
        password,
        username,
      },
      method: "POST",
    });

    const response = jsonSuccess({
      authenticated: true,
      username: session.username,
    });

    applyAdminSessionCookies(
      response,
      {
        csrfToken: session.csrfToken,
        expiresAt: session.expiresAt,
        sessionToken: session.sessionToken,
      },
      {
        secure: isSecureRequest(request),
      },
    );
    return response;
  } catch (error) {
    return jsonError(error);
  }
}
