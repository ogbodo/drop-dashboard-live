import { NextRequest } from "next/server";
import { clearAdminSessionCookies, isSecureRequest } from "@/lib/auth";
import { assertSameOrigin, jsonError, jsonSuccess } from "@/lib/route-utils";

export const runtime = "edge";

export async function POST(_request: NextRequest) {
  try {
    assertSameOrigin(_request);
    const response = jsonSuccess({
      authenticated: false,
    });

    clearAdminSessionCookies(response, {
      secure: isSecureRequest(_request),
    });
    return response;
  } catch (error) {
    return jsonError(error);
  }
}
