/**
 * Edge-safe session helpers. Uses only Web Crypto so it can run inside both
 * `proxy.ts` (edge) and Node route handlers.
 *
 * NOTE: the credentials below are a deliberate, temporary hardcoded gate for
 * the P0 build. They must be replaced with real auth before any public deploy.
 */
export const AUTH_COOKIE = "audiobook_session";
export const AUTH_DEMO_USERNAME = "Udin";
export const AUTH_DEMO_PASSWORD = "Password123!";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function getSecret(): string {
  return process.env.AUTH_SECRET ?? "macchiato-dev-secret-change-me";
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBytes(value: string): Uint8Array {
  const padded =
    value.replace(/-/g, "+").replace(/_/g, "/") +
    "=".repeat((4 - (value.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function sign(data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(getSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(data),
  );
  return bytesToBase64Url(new Uint8Array(signature));
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function verifyCredentials(username: string, password: string): boolean {
  return (
    timingSafeEqual(username, AUTH_DEMO_USERNAME) &&
    timingSafeEqual(password, AUTH_DEMO_PASSWORD)
  );
}

export async function createSession(): Promise<string> {
  const payload = bytesToBase64Url(
    encoder.encode(
      JSON.stringify({
        sub: AUTH_DEMO_USERNAME,
        exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE,
      }),
    ),
  );
  return `${payload}.${await sign(payload)}`;
}

export async function verifySession(token: string | undefined): Promise<boolean> {
  if (!token) return false;

  const [payload, signature] = token.split(".");
  if (!payload || !signature) return false;

  const expected = await sign(payload);
  if (!timingSafeEqual(signature, expected)) return false;

  try {
    const parsed = JSON.parse(decoder.decode(base64UrlToBytes(payload))) as {
      sub?: string;
      exp?: number;
    };
    return (
      parsed.sub === AUTH_DEMO_USERNAME &&
      typeof parsed.exp === "number" &&
      parsed.exp > Math.floor(Date.now() / 1000)
    );
  } catch {
    return false;
  }
}
