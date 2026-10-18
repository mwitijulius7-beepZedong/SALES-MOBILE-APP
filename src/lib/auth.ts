import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies, headers } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { db } from "@/db";
import { sessions, users } from "@/db/schema";
import { and, eq, gt } from "drizzle-orm";

export const ACCESS_COOKIE = "vf_access";
export const REFRESH_COOKIE = "vf_refresh";
const ACCESS_SECONDS = 15 * 60;
const REFRESH_DAYS = 30;

export type SessionUser = {
  id: number;
  name: string;
  email: string;
  role: string;
  territory: string;
  initials: string;
  hue: number;
};

export type AuthTokens = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
};

type AccessClaims = {
  sub: string;
  name: string;
  email: string;
  role: string;
  token_use: string;
};

function authSecret() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new HttpError("AUTH_SECRET is not configured", 500);
  return new TextEncoder().encode(secret);
}

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, 64).toString("hex");
  return `s1:${salt}:${derived}`;
}

export function verifyPassword(password: string, stored: string) {
  try {
    const [scheme, salt, digest] = stored.split(":");
    if (scheme !== "s1" || !salt || !digest) return false;
    const derived = scryptSync(password, salt, 64);
    const expected = Buffer.from(digest, "hex");
    return derived.length === expected.length && timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

async function signAccessToken(user: { id: number; name: string; email: string; role: string }) {
  return await new SignJWT({
    name: user.name,
    email: user.email,
    role: user.role,
    token_use: "access",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(user.id))
    .setIssuedAt()
    .setJti(randomUUID())
    .setExpirationTime(`${ACCESS_SECONDS}s`)
    .sign(authSecret());
}

async function setAuthCookies(accessToken: string, refreshToken: string, refreshExpiresAt: Date) {
  const store = await cookies();
  const secure = process.env.NODE_ENV === "production";
  store.set(ACCESS_COOKIE, accessToken, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: ACCESS_SECONDS,
  });
  store.set(REFRESH_COOKIE, refreshToken, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    expires: refreshExpiresAt,
  });
}

/**
 * Issues a fresh access JWT + opaque refresh token pair, persists the refresh
 * token and writes both httpOnly cookies.
 */
export async function issueTokens(user: {
  id: number;
  name: string;
  email: string;
  role: string;
}): Promise<AuthTokens> {
  const accessToken = await signAccessToken(user);
  const refreshToken = randomBytes(32).toString("base64url");
  const refreshExpiresAt = new Date(Date.now() + REFRESH_DAYS * 86_400_000);
  await db.insert(sessions).values({ token: refreshToken, userId: user.id, expiresAt: refreshExpiresAt });
  await setAuthCookies(accessToken, refreshToken, refreshExpiresAt);
  return { accessToken, refreshToken, expiresIn: ACCESS_SECONDS };
}

/**
 * Resolves the access token from either an `Authorization: Bearer` header
 * (native/mobile clients) or the `vf_access` cookie (web app).
 */
export async function resolveAccessToken(): Promise<string | null> {
  const headerStore = await headers();
  const auth = headerStore.get("authorization");
  if (auth && auth.toLowerCase().startsWith("bearer ")) {
    const token = auth.slice(7).trim();
    if (token) return token;
  }
  const store = await cookies();
  return store.get(ACCESS_COOKIE)?.value ?? null;
}

async function verifyAccessToken(token: string): Promise<AccessClaims | null> {
  try {
    const { payload } = await jwtVerify(token, authSecret());
    if (payload.token_use !== "access" || typeof payload.sub !== "string") return null;
    return payload as unknown as AccessClaims;
  } catch {
    return null;
  }
}

async function activeUser(userId: number) {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user || !user.active) return null;
  return user;
}

/**
 * Fallback used while rendering: validates the `vf_refresh` cookie against the
 * sessions table and mints an in-memory access token. Deliberately performs no
 * rotation and writes no cookies, since `cookies().set` is illegal during a
 * Server Component render.
 */
async function refreshFromCookie(): Promise<string | null> {
  const store = await cookies();
  const token = store.get(REFRESH_COOKIE)?.value;
  if (!token) return null;
  const rows = await db
    .select({ userId: sessions.userId })
    .from(sessions)
    .where(and(eq(sessions.token, token), gt(sessions.expiresAt, new Date())))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  const user = await activeUser(row.userId);
  if (!user) return null;
  return signAccessToken(user);
}

/**
 * Exchanges a refresh token for a new access/refresh pair. Deletes the old
 * refresh row (rotation) and re-writes the auth cookies. Route-handler only.
 */
export async function refreshWithToken(refreshToken: string): Promise<AuthTokens | null> {
  const rows = await db
    .select({ userId: sessions.userId })
    .from(sessions)
    .where(and(eq(sessions.token, refreshToken), gt(sessions.expiresAt, new Date())))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  const user = await activeUser(row.userId);
  if (!user) return null;
  await db.delete(sessions).where(eq(sessions.token, refreshToken));
  return issueTokens(user);
}

export async function destroySession(refreshTokenOverride?: string) {
  const store = await cookies();
  const token = refreshTokenOverride ?? store.get(REFRESH_COOKIE)?.value ?? null;
  if (token) {
    await db.delete(sessions).where(eq(sessions.token, token));
  } else {
    const access = await resolveAccessToken();
    const claims = access ? await verifyAccessToken(access) : null;
    if (claims) {
      await db.delete(sessions).where(eq(sessions.userId, Number.parseInt(claims.sub, 10)));
    }
  }
  store.delete(ACCESS_COOKIE);
  store.delete(REFRESH_COOKIE);
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  let claims: AccessClaims | null = null;
  const access = await resolveAccessToken();
  if (access) claims = await verifyAccessToken(access);
  if (!claims) {
    const minted = await refreshFromCookie();
    if (minted) claims = await verifyAccessToken(minted);
  }
  if (!claims) return null;

  const user = await activeUser(Number.parseInt(claims.sub, 10));
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    territory: user.territory,
    initials: user.initials,
    hue: user.hue,
  };
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) throw new HttpError("Unauthorized", 401);
  return user;
}

export class HttpError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export function initialsOf(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}
