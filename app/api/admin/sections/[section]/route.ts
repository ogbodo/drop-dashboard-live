import type { NextRequest } from "next/server";
import { clearAdminSessionCookies, isSecureRequest } from "@/lib/auth";
import { assertDashboardEnv } from "@/lib/env";
import { invokeDashboardEdge } from "@/lib/edge-function-client";
import { jsonError, jsonSuccess, requireAdminSession } from "@/lib/route-utils";
import type { DashboardSectionName, RouteContext } from "@/lib/types";

export const runtime = "edge";

export async function GET(request: NextRequest, context: RouteContext<{ section: string }>) {
  try {
    assertDashboardEnv();
    const { sessionToken } = await requireAdminSession(request);
    const { section } = await context.params;

    const data = await invokeDashboardEdge<unknown>(`sections/${section as DashboardSectionName}`, {
      headers: {
        "x-admin-session": sessionToken,
      },
      method: "GET",
      searchParams: request.nextUrl.searchParams,
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
