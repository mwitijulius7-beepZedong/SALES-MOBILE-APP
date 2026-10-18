import { NextResponse } from "next/server";
import { destroySession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { refreshToken?: string };
  const token = String(body.refreshToken ?? "").trim() || undefined;
  await destroySession(token);
  return NextResponse.json({ ok: true });
}
