import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { assertCsrf, getSessionTokenFromRequest } from "@/lib/auth";
import type { AnyRecord } from "@/lib/types";

type JsonError = Error & {
  payload?: unknown;
  status?: number;
};

const withNoStore = (init?: ResponseInit): ResponseInit => ({
  ...init,
  headers: {
    "Cache-Control": "no-store",
    ...(init?.headers || {}),
  },
});

export const jsonSuccess = (data: unknown, init?: ResponseInit) =>
  NextResponse.json({ data }, withNoStore(init));

export const jsonError = (error: unknown, fallbackStatus = 500) => {
  const normalized = error as JsonError;
  const status =
    typeof normalized?.status === "number" ? normalized.status : fallbackStatus;

  return NextResponse.json(
    {
      details: normalized?.payload ?? null,
      error:
        error instanceof Error ? error.message : "An unexpected server error occurred.",
    },
    withNoStore({ status }),
  );
};

export const requireAdminSession = async (
  request: NextRequest,
  options: { requireCsrf?: boolean } = {},
) => {
  const sessionToken = getSessionTokenFromRequest(request);

  if (!sessionToken) {
    const error = new Error("Unauthorized") as JsonError;
    error.status = 401;
    throw error;
  }

  if (options.requireCsrf) {
    assertSameOrigin(request);
    assertCsrf(request);
  }

  return {
    sessionToken,
  };
};

export const parseJsonBody = async <T = AnyRecord>(request: NextRequest) => {
  try {
    return (await request.json()) as T;
  } catch {
    return {} as T;
  }
};

export const assertSameOrigin = (request: NextRequest) => {
  const requestOrigin = request.nextUrl.origin;
  const originHeader = request.headers.get("origin");
  const refererHeader = request.headers.get("referer");
  const invalidOriginError = () => {
    const error = new Error("Invalid request origin.") as JsonError;
    error.status = 403;
    return error;
  };

  if (originHeader) {
    try {
      const origin = new URL(originHeader).origin;
      if (origin !== requestOrigin) {
        throw invalidOriginError();
      }
    } catch {
      throw invalidOriginError();
    }
    return;
  }

  if (refererHeader) {
    try {
      const refererOrigin = new URL(refererHeader).origin;
      if (refererOrigin !== requestOrigin) {
        throw invalidOriginError();
      }
    } catch {
      throw invalidOriginError();
    }
    return;
  }

  const error = new Error("Missing request origin.") as JsonError;
  error.status = 403;
  throw error;
};
