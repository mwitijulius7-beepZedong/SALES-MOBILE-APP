import { eq } from "drizzle-orm";
import { db } from "@/db";
import { products } from "@/db/schema";
import { createRequisition, listRequisitions } from "@/server/queries";
import { HttpError, readJson, reqDate, reqEnum, reqInt, reqString } from "@/server/http";
import { isoDaysAgo, todayISO } from "@/lib/format";
import { pageParams, paged, v1 } from "@/server/v1";

export const dynamic = "force-dynamic";

export const GET = v1(async (_user, req: Request) => {
  const url = new URL(req.url);
  const { page, limit, offset } = pageParams(req, { limit: 50, maxLimit: 200 });
  const { rows, hasMore, counts } = await listRequisitions({
    q: url.searchParams.get("q") ?? undefined,
    status: url.searchParams.get("status") ?? undefined,
    limit,
    offset,
  });
  return paged(rows, { page, limit, hasMore, counts });
});

export const POST = v1(async (user, req: Request) => {
  const body = await readJson(req);
  const productId = reqInt(body, "productId", { min: 1, max: 1_000_000, required: true });
  const [product] = await db.select().from(products).where(eq(products.id, productId)).limit(1);
  if (!product) throw new HttpError("Pick a product from the catalogue");

  return createRequisition({
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
});
