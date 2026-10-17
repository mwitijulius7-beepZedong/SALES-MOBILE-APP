import { db } from "@/db";
import { products } from "@/db/schema";
import { createRequisition, listRequisitions } from "@/server/queries";
import { readJson, reqDate, reqEnum, reqInt, reqString, withAuth } from "@/server/http";
import { isoDaysAgo, todayISO } from "@/lib/format";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (_user, req: Request) => {
  const url = new URL(req.url);
  return await listRequisitions({
    q: url.searchParams.get("q") ?? undefined,
    status: url.searchParams.get("status") ?? undefined,
  });
});

export const POST = withAuth(async (user, req: Request) => {
  const body = await readJson(req);
  const productId = reqInt(body, "productId", { min: 1, max: 1_000_000, required: true });
  const [product] = await db.select().from(products).where(eq(products.id, productId)).limit(1);
  if (!product) throw new Error("Pick a product from the catalogue");

  const row = await createRequisition({
    productId: product.id,
    productName: product.name,
    sku: product.sku,
    unit: product.unit,
    requestedQty: reqInt(body, "requestedQty", { min: 1, max: 100_000, required: true }),
    approvedQty: 0,
    department: reqString(body, "department", { fallback: "Field Sales", max: 60 }),
    requester: reqString(body, "requester", { fallback: user.name, max: 60 }),
    priority: reqEnum(body, "priority", ["low", "normal", "high", "urgent"], "normal"),
    status: "pending",
    neededBy: reqDate(body, "neededBy", isoDaysAgo(-3) < todayISO() ? isoDaysAgo(-3) : todayISO()),
    notes: reqString(body, "notes", { max: 240 }),
  });
  return { row };
});
