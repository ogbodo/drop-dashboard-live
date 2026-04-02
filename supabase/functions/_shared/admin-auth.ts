export const ADMIN_SESSION_DURATION_MS = 1000 * 60 * 60 * 12;

type SessionPayload = {
  csrfToken: string;
  exp: number;
  iat: number;
  nonce: string;
  username: string;
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

    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(password),
      "PBKDF2",
      false,
      ["deriveBits"],
    );
    const derivedBits = await crypto.subtle.deriveBits(
      {
        hash: "SHA-256",
        iterations,
        name: "PBKDF2",
        salt: encoder.encode(salt),
      },
      key,
      256,
    );

    const candidate = new Uint8Array(derivedBits);
    const expected = new Uint8Array(
      hashHex.match(/.{1,2}/g)?.map((chunk) => Number.parseInt(chunk, 16)) ?? [],
    );
    return constantTimeEqual(candidate, expected);
  }

  if (stored.startsWith("sha256$")) {
    const [, hashHex] = stored.split("$");
    const digest = await crypto.subtle.digest("SHA-256", encoder.encode(password));
    const candidate = new Uint8Array(digest);
    const expected = new Uint8Array(
      hashHex.match(/.{1,2}/g)?.map((chunk) => Number.parseInt(chunk, 16)) ?? [],
    );
    return constantTimeEqual(candidate, expected);
  }

  throw new Error(
    "Unsupported password hash format. Use pbkdf2_sha256$iterations$salt$hash or sha256$hash.",
  );
};

export const createSessionToken = async (
  username: string,
  csrfToken: string,
  secret: string,
) => {
  const payload: SessionPayload = {
    csrfToken,
    exp: Date.now() + ADMIN_SESSION_DURATION_MS,
    iat: Date.now(),
    nonce: randomToken(),
    username,
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
  expectedUsername: string,
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

    if (payload.username !== expectedUsername) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
};
