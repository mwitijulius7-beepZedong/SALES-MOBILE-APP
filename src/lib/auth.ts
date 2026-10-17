import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies, headers } from "next/headers";
import { db } from "@/db";
import { sessions, users } from "@/db/schema";
import { and, eq, gt } from "drizzle-orm";

export const SESSION_COOKIE = "vf_session";
const SESSION_DAYS = 30;

export type SessionUser = {
  id: number;
  name: string;
  email: string;
  role: string;
  territory: string;
  initials: string;
  hue: number;
};

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

export async function createSession(userId: number) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await db.insert(sessions).values({ token, userId, expiresAt });
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
  return token;
}

/**
 * Resolves the session token from either an `Authorization: Bearer` header
 * (native/mobile clients) or the `vf_session` cookie (web app).
 */
export async function resolveSessionToken(): Promise<string | null> {
  const headerStore = await headers();
  const auth = headerStore.get("authorization");
  if (auth && auth.toLowerCase().startsWith("bearer ")) {
    const token = auth.slice(7).trim();
    if (token) return token;
  }
  const store = await cookies();
  return store.get(SESSION_COOKIE)?.value ?? null;
}

export async function destroySession(tokenOverride?: string) {
  const token = tokenOverride ?? (await resolveSessionToken());
  if (token) {
    await db.delete(sessions).where(eq(sessions.token, token));
  }
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  const token = await resolveSessionToken();
  if (!token) return null;
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      territory: users.territory,
      initials: users.initials,
      hue: users.hue,
      expiresAt: sessions.expiresAt,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.token, token), gt(sessions.expiresAt, new Date())))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    territory: row.territory,
    initials: row.initials,
    hue: row.hue,
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
