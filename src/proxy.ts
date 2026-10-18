import { NextResponse, type NextRequest } from "next/server";

/**
 * Cross-origin + security-header handling for the API surface.
 *
 * Allowed origins come from the comma-separated CORS_ORIGINS env var, e.g.
 *   CORS_ORIGINS=https://app.example.com,https://staging.example.com
 * or CORS_ORIGINS=* to allow any origin. When unset, no cross-origin access is
 * granted (same-origin web requests are unaffected). Native Android clients
 * that authenticate with a Bearer token do not need CORS at all.
 */
function allowedOrigins(): string[] {
  return (process.env.CORS_ORIGINS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function securityHeaders() {
  const headers = new Headers();
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("X-DNS-Prefetch-Control", "off");
  return headers;
}

function corsHeaders(origin: string | null): Headers {
  const headers = securityHeaders();
  if (!origin) return headers;
  const allowed = allowedOrigins();
  const wildcard = allowed.includes("*");
  if (!wildcard && !allowed.includes(origin)) return headers;

  headers.set("Access-Control-Allow-Origin", wildcard ? "*" : origin);
  headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Requested-With");
  headers.set("Access-Control-Expose-Headers", "Content-Length");
  headers.set("Access-Control-Max-Age", "86400");
  if (!wildcard) {
    headers.set("Access-Control-Allow-Credentials", "true");
    headers.set("Vary", "Origin");
  }
  return headers;
}

export function proxy(req: NextRequest) {
  const origin = req.headers.get("origin");
  const headers = corsHeaders(origin);

  // Short-circuit CORS preflight so it never reaches an auth-wrapped handler.
  if (req.method === "OPTIONS") {
    return new NextResponse(null, { status: 204, headers });
  }

  const res = NextResponse.next();
  headers.forEach((value, key) => res.headers.set(key, value));
  return res;
}

export const config = {
  matcher: ["/api/:path*"],
};
