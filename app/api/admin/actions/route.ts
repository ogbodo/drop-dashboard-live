import type { NextRequest } from "next/server";
import { clearAdminSessionCookies, isSecureRequest } from "@/lib/auth";
import { assertDashboardEnv } from "@/lib/env";
import { invokeDashboardEdge } from "@/lib/edge-function-client";
import { enforceRateLimit } from "@/lib/rate-limit";
import {
  jsonError,
  jsonSuccess,
  parseJsonBody,
  requireAdminSession,
} from "@/lib/route-utils";
import type { AnyRecord, DashboardActionName } from "@/lib/types";

export const runtime = "edge";

type DashboardActionRequest = {
  action?: DashboardActionName;
  payload?: AnyRecord;
};

export async function POST(request: NextRequest) {
  try {
    assertDashboardEnv();
    enforceRateLimit(request, {
      key: "admin-actions",
      limit: 120,
      windowMs: 1000 * 60,
    });

    const { sessionToken } = await requireAdminSession(request, { requireCsrf: true });
    const { action, payload = {} } = await parseJsonBody<DashboardActionRequest>(request);

    const data = await invokeDashboardEdge("actions", {
      body: {
        action,
        payload,
      },
      headers: {
        "x-admin-session": sessionToken,
        "x-csrf-token": request.headers.get("x-csrf-token") ?? "",
      },
      method: "POST",
    });

    return jsonSuccess(data);
  } catch (error) {
    const response = jsonError(error, 500);

    if ((error as { status?: number } | undefined)?.status === 401) {
      clearAdminSessionCookies(response, {
        secure: isSecureRequest(request),
      });
    }

    return response;
  }
}
