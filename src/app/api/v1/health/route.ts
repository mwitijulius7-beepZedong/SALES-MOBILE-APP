import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await db.execute(sql`select 1`);
    return NextResponse.json({ data: { ok: true, version: "v1", time: new Date().toISOString() } });
  } catch {
    return NextResponse.json(
      { error: { code: "internal_error", message: "Database unavailable" } },
      { status: 503 },
    );
  }
}
