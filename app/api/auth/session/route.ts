import { NextRequest } from "next/server";
import {
  clearAdminSessionCookies,
  getSessionTokenFromRequest,
  isSecureRequest,
} from "@/lib/auth";
import { assertDashboardEnv } from "@/lib/env";
import { invokeDashboardEdge } from "@/lib/edge-function-client";
import { jsonError, jsonSuccess } from "@/lib/route-utils";

export const runtime = "edge";

export async function GET(request: NextRequest) {
  try {
    const sessionToken = getSessionTokenFromRequest(request);

    if (!sessionToken) {
      return jsonSuccess(
        {
          authenticated: false,
        },
        { status: 401 },
      );
    }

    assertDashboardEnv();
    const session = await invokeDashboardEdge<{
      authenticated: boolean;
      expiresAt: number;
      username: string;
    }>("auth/session", {
      headers: {
        "x-admin-session": sessionToken,
      },
      method: "GET",
    });

    return jsonSuccess({
      authenticated: true,
      expiresAt: session.expiresAt,
      username: session.username,
    });
  } catch (error) {
    const response = jsonError(error);

    if ((error as { status?: number } | undefined)?.status === 401) {
      clearAdminSessionCookies(response, {
        secure: isSecureRequest(request),
      });
    }

    return response;
  }
}
