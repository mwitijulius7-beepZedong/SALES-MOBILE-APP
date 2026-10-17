import { listProducts, upsertProduct, deleteProduct, adjustStock } from "@/server/queries";
import { readJson, reqBool, reqInt, reqString, withAuth, HttpError } from "@/server/http";
import { usdToCents } from "@/lib/format";
import { db } from "@/db";
import { products } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (_user, req: Request) => {
  const url = new URL(req.url);
  const rows = await listProducts({
    q: url.searchParams.get("q") ?? undefined,
    category: url.searchParams.get("category") ?? undefined,
    status: url.searchParams.get("status") ?? undefined,
    sort: url.searchParams.get("sort") ?? undefined,
  });
  return { rows };
});

function productValues(body: Record<string, unknown>) {
  const priceCents = reqInt(body, "priceCents", { min: 0, max: 100_000_000, fallback: usdToCents(body.price as string) });
  const costCents = reqInt(body, "costCents", { min: 0, max: 100_000_000, fallback: usdToCents(body.cost as string) });
  if (priceCents <= 0) throw new HttpError("Selling price must be greater than zero");
  return {
    name: reqString(body, "name", { required: true, max: 120 }),
    category: reqString(body, "category", { fallback: "Uncategorised", max: 60 }),
    unit: reqString(body, "unit", { fallback: "cs", max: 12 }),
    costCents,
    priceCents,
    stock: reqInt(body, "stock", { min: 0, max: 1_000_000 }),
    reorderLevel: reqInt(body, "reorderLevel", { min: 0, max: 100_000, fallback: 10 }),
    bin: reqString(body, "bin", { fallback: "A-01", max: 16 }),
    supplier: reqString(body, "supplier", { fallback: "—", max: 80 }),
    active: reqBool(body, "active", true),
  };
}

export const POST = withAuth(async (user, req: Request) => {
  const body = await readJson(req);
  const values = productValues(body);
  let sku = reqString(body, "sku", { max: 24 }).toUpperCase();
  if (sku) {
    const clash = await db.select({ id: products.id }).from(products).where(eq(products.sku, sku)).limit(1);
    if (clash.length) throw new HttpError(`SKU ${sku} already exists`);
  } else {
    sku = `VF-${Math.floor(1000 + Math.random() * 8999)}`;
    let guard = 0;
    while (guard++ < 20) {
      const clash = await db.select({ id: products.id }).from(products).where(eq(products.sku, sku)).limit(1);
      if (!clash.length) break;
      sku = `VF-${Math.floor(1000 + Math.random() * 8999)}`;
    }
  }
  const row = await upsertProduct(null, { ...values, sku });
  if (values.stock > 0) {
    await adjustStock({
      productId: row.id,
      qtyChange: 0,
      reason: "adjustment",
      reference: "OPENING",
      note: `Catalogue created by ${user.name} with ${values.stock} ${row.unit} on hand`,
      actor: { id: user.id, name: user.name },
    });
  }
  return { row };
});

export const PATCH = POST;
