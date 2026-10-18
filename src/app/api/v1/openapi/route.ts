import { NextResponse } from "next/server";
import { openApiSpec } from "@/server/openapi";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(openApiSpec);
}
