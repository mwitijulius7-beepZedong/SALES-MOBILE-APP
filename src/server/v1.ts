import { NextResponse } from "next/server";
import { ensureSeeded } from "@/db/seed";
import { HttpError, requireUser, type SessionUser } from "@/lib/auth";

/**
 * Shared plumbing for the versioned `/api/v1` surface.
 *
 * Success  -> { "data": <payload> }  (+ "meta" for paginated collections)
 * Failure  -> { "error": { "code": "...", "message": "..." } }
 *
 * The unversioned `/api/*` routes are untouched so the web app keeps working
 * while native clients migrate to v1.
 */

export type PageMeta = { page: number; limit: number; hasMore: boolean; [key: string]: unknown };

const PAGED = Symbol("paged");

export type Paged<T> = { [PAGED]: true; rows: T[]; meta: PageMeta };

export function paged<T>(rows: T[], meta: PageMeta): Paged<T> {
  return { [PAGED]: true, rows, meta };
}function isPaged(value: unknown): value is Paged<unknown> {
  return typeof value === "object" && value !== null && PAGED in value;
}

function codeFor(status: number) {
  switch (status) {
    case 400:
      return "bad_request";
    case 401:
      return "unauthorized";
    case 403:
      return "forbidden";
    case 404:
      return "not_found";
    case 405:
      return "method_not_allowed";
    case 409:
      return "conflict";
    default:
      return "internal_error";
  }
}

export function errorResponse(status: number, message: string) {
  return NextResponse.json({ error: { code: codeFor(status), message } }, { status });
}

function handleError(error: unknown) {
  if (error instanceof HttpError) return errorResponse(error.status, error.message);
  console.error("[vendflow] v1 route error", error);
  return errorResponse(500, "Internal server error");
}

function wrap(result: unknown) {
  if (result instanceof Response) return result;
  if (isPaged(result)) {
    const { rows, meta } = result;
    return NextResponse.json({ data: rows, meta });
  }
  return NextResponse.json({ data: result });
}

/** Authenticated v1 handler — cookie or Bearer session, `{ data }` envelope. */
export function v1<Args extends unknown[]>(fn: (user: SessionUser, ...args: Args) => Promise<unknown>) {
  return async (...args: Args) => {
    try {
      await ensureSeeded();
      const user = await requireUser();
      return wrap(await fn(user, ...args));
    } catch (error) {
      return handleError(error);
    }
  };
}

/** Public v1 handler (login, register, health, openapi). */
export function v1Public<Args extends unknown[]>(fn: (...args: Args) => Promise<unknown>) {
  return async (...args: Args) => {
    try {
      await ensureSeeded();
      return wrap(await fn(...args));
    } catch (error) {
      return handleError(error);
    }
  };
}

/** Parses `?page=&limit=` into clamped page/limit/offset values. */
export function pageParams(req: Request, defaults: { limit?: number; maxLimit?: number } = {}) {
  const url = new URL(req.url);
  const limitDefault = defaults.limit ?? 50;
  const maxLimit = defaults.maxLimit ?? 200;
  const page = Math.max(1, Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
  const requested = Number.parseInt(url.searchParams.get("limit") ?? String(limitDefault), 10) || limitDefault;
  const limit = Math.min(Math.max(1, requested), maxLimit);
  return { page, limit, offset: (page - 1) * limit };
}

export function metaFor(page: number, limit: number, hasMore: boolean): PageMeta {
  return { page, limit, hasMore };
}
