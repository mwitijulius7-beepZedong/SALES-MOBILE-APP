import { NextResponse } from "next/server";
import { ensureSeeded } from "@/db/seed";
import { HttpError, requireUser, type SessionUser } from "@/lib/auth";

export { HttpError };

/** Throws 403 unless the user's role is in the allowed list. */
export function requireRole(user: SessionUser, ...roles: string[]) {
  if (!roles.includes(user.role)) {
    throw new HttpError("You don't have permission to do that", 403);
  }
}

type Body = { ok?: boolean; [key: string]: unknown };

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data as Body, init);
}

/** Wraps a route handler: seeds demo data, attaches the user, normalises errors. */
export function withAuth<Args extends unknown[]>(
  fn: (user: SessionUser, ...args: Args) => Promise<Body | Response>,
) {
  return async (...args: Args) => {
    try {
      await ensureSeeded();
      const user = await requireUser();
      const result = await fn(user, ...args);
      return result instanceof Response ? result : NextResponse.json(result);
    } catch (error) {
      if (error instanceof HttpError) {
        return NextResponse.json({ error: error.message }, { status: error.status });
      }
      console.error("[vendflow] route error", error);
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
  };
}

/* ----------------------------- validation ----------------------------- */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const parsed: unknown = await req.json();
    if (!isRecord(parsed)) throw new HttpError("Expected a JSON object body");
    return parsed;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError("Malformed JSON body");
  }
}

export function reqString(
  body: Record<string, unknown>,
  key: string,
  opts: { required?: boolean; max?: number; fallback?: string } = {},
) {
  const raw = body[key];
  if (raw === undefined || raw === null || raw === "") {
    if (opts.required) throw new HttpError(`${key} is required`);
    return opts.fallback ?? "";
  }
  if (typeof raw !== "string" && typeof raw !== "number") {
    throw new HttpError(`${key} must be a string`);
  }
  const value = String(raw).trim();
  const max = opts.max ?? 220;
  if (value.length > max) throw new HttpError(`${key} must be under ${max} characters`);
  return value;
}

export function reqInt(
  body: Record<string, unknown>,
  key: string,
  opts: { min?: number; max?: number; fallback?: number; required?: boolean } = {},
) {
  const raw = body[key];
  if (raw === undefined || raw === null || raw === "") {
    if (opts.required) throw new HttpError(`${key} is required`);
    return opts.fallback ?? 0;
  }
  const value = typeof raw === "number" ? raw : Number.parseInt(String(raw), 10);
  if (!Number.isFinite(value)) throw new HttpError(`${key} must be a number`);
  const min = opts.min ?? Number.MIN_SAFE_INTEGER;
  const max = opts.max ?? Number.MAX_SAFE_INTEGER;
  if (value < min || value > max) throw new HttpError(`${key} must be between ${min} and ${max}`);
  return Math.trunc(value);
}

export function reqBool(body: Record<string, unknown>, key: string, fallback = false) {
  const raw = body[key];
  if (typeof raw === "boolean") return raw;
  if (raw === undefined || raw === null) return fallback;
  return ["1", "true", "yes", "on"].includes(String(raw).toLowerCase());
}

export function reqEnum(
  body: Record<string, unknown>,
  key: string,
  allowed: readonly string[],
  fallback: string,
) {
  const raw = body[key];
  if (raw === undefined || raw === null || raw === "") return fallback;
  const value = String(raw);
  if (!allowed.includes(value)) {
    throw new HttpError(`${key} must be one of: ${allowed.join(", ")}`);
  }
  return value;
}

export function reqDate(
  body: Record<string, unknown>,
  key: string,
  fallback: string,
): string {
  const raw = body[key];
  if (raw === undefined || raw === null || raw === "") return fallback;
  const value = String(raw).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new HttpError(`${key} must be YYYY-MM-DD`);
  return value;
}
