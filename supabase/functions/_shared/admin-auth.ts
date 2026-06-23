export const ADMIN_SESSION_DURATION_MS = 1000 * 60 * 60 * 12;

export type DashboardAccountRole = "admin" | "partner";

export type SessionIdentity = {
  accountId?: string | null;
  displayName?: string | null;
  partnerId?: string | null;
  role: DashboardAccountRole;
  username: string;
};

type SessionPayload = SessionIdentity & {
  csrfToken: string;
  exp: number;
  iat: number;
  nonce: string;
};

const encoder = new TextEncoder();

const toBase64Url = (value: Uint8Array) => {
  let binary = "";

  value.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
};

const fromBase64Url = (value: string) => {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  const decoded = atob(`${normalized}${padding}`);
  const bytes = new Uint8Array(decoded.length);

  for (let index = 0; index < decoded.length; index += 1) {
    bytes[index] = decoded.charCodeAt(index);
  }

  return bytes;
};

const constantTimeEqual = (left: Uint8Array, right: Uint8Array) => {
  if (left.length !== right.length) {
    return false;
  }

  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left[index] ^ right[index];
  }

  return mismatch === 0;
};

const signValue = async (value: string, secret: string) => {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return toBase64Url(new Uint8Array(signature));
};

export const randomToken = () => toBase64Url(crypto.getRandomValues(new Uint8Array(32)));

const toHex = (value: ArrayBuffer) =>
  Array.from(new Uint8Array(value))
    .map((chunk) => chunk.toString(16).padStart(2, "0"))
    .join("");

const fromHex = (value: string) =>
  new Uint8Array(value.match(/.{1,2}/g)?.map((chunk) => Number.parseInt(chunk, 16)) ?? []);

const derivePasswordBits = async (
  password: string,
  salt: string,
  iterations: number,
) => {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );

  return crypto.subtle.deriveBits(
    {
      hash: "SHA-256",
      iterations,
      name: "PBKDF2",
      salt: encoder.encode(salt),
    },
    key,
    256,
  );
};

export const normalizeUsername = (value: string) => value.trim().toLowerCase();

export const hashPassword = async (password: string) => {
  const normalizedPassword = String(password || "");
  if (normalizedPassword.length < 12) {
    throw new Error("Use a password with at least 12 characters.");
  }

  const iterations = 310000;
  const salt = toHex(crypto.getRandomValues(new Uint8Array(16)));
  const hash = await derivePasswordBits(normalizedPassword, salt, iterations);

  return `pbkdf2_sha256$${iterations}$${salt}$${toHex(hash)}`;
};

export const verifyPassword = async (password: string, stored: string) => {
  if (!stored) {
    throw new Error("DASHBOARD_ADMIN_PASSWORD_HASH is not configured.");
  }

  if (stored.startsWith("pbkdf2_sha256$")) {
    const [, iterationValue, salt, hashHex] = stored.split("$");
    const iterations = Number(iterationValue || 0);
    if (!iterations || !salt || !hashHex) {
      throw new Error("DASHBOARD_ADMIN_PASSWORD_HASH format is invalid.");
    }

    const candidate = new Uint8Array(
      await derivePasswordBits(String(password || ""), salt, iterations),
    );
    const expected = fromHex(hashHex);
    return constantTimeEqual(candidate, expected);
  }

  if (stored.startsWith("sha256$")) {
    const [, hashHex] = stored.split("$");
    const digest = await crypto.subtle.digest("SHA-256", encoder.encode(password));
    const candidate = new Uint8Array(digest);
    const expected = fromHex(hashHex);
    return constantTimeEqual(candidate, expected);
  }

  throw new Error(
    "Unsupported password hash format. Use pbkdf2_sha256$iterations$salt$hash or sha256$hash.",
  );
};

export const createSessionToken = async (
  identity: SessionIdentity,
  csrfToken: string,
  secret: string,
) => {
  const payload: SessionPayload = {
    accountId: identity.accountId || null,
    csrfToken,
    displayName: identity.displayName || null,
    exp: Date.now() + ADMIN_SESSION_DURATION_MS,
    iat: Date.now(),
    nonce: randomToken(),
    partnerId: identity.partnerId || null,
    role: identity.role,
    username: identity.username,
  };

  const body = toBase64Url(encoder.encode(JSON.stringify(payload)));
  const signature = await signValue(body, secret);

  return {
    expiresAt: payload.exp,
    token: `${body}.${signature}`,
  };
};

export const verifySessionToken = async (
  token: string,
  secret: string,
) => {
  if (!token) {
    return null;
  }

  const [body, signature] = token.split(".");
  if (!body || !signature) {
    return null;
  }

  const expectedSignature = await signValue(body, secret);
  const validSignature = constantTimeEqual(
    encoder.encode(signature),
    encoder.encode(expectedSignature),
  );

  if (!validSignature) {
    return null;
  }

  try {
    const payload = JSON.parse(
      new TextDecoder().decode(fromBase64Url(body)),
    ) as SessionPayload;

    if (payload.exp < Date.now()) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
};
