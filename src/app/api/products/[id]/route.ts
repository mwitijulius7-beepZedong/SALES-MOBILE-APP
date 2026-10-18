import { deleteProduct, getProduct, upsertProduct } from "@/server/queries";
import { readJson, reqBool, reqInt, reqString, requireRole, withAuth } from "@/server/http";
import { usdToCents } from "@/lib/format";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

async function idOf(ctx: Ctx) {
  const { id } = await ctx.params;
  return reqInt({ id }, "id", { min: 1, max: 1_000_000, required: true });
}

export const GET = withAuth(async (_user, _req: Request, ctx: Ctx) => {
  const id = await idOf(ctx);
  return { row: await getProduct(id) };
});

export const PUT = withAuth(async (_user, req: Request, ctx: Ctx) => {
  const id = await idOf(ctx);
  const body = await readJson(req);
  const sku = reqString(body, "sku", { max: 24 }).toUpperCase() || `VF-${Date.now().toString().slice(-5)}`;
  const row = await upsertProduct(id, {
    sku,
    name: reqString(body, "name", { required: true, max: 120 }),
    category: reqString(body, "category", { fallback: "Uncategorised", max: 60 }),
    unit: reqString(body, "unit", { fallback: "cs", max: 12 }),
    costCents: reqInt(body, "costCents", { min: 0, fallback: usdToCents(body.cost as string) }),
    priceCents: reqInt(body, "priceCents", { min: 1, fallback: usdToCents(body.price as string) }),
    stock: reqInt(body, "stock", { min: 0, max: 1_000_000 }),
    reorderLevel: reqInt(body, "reorderLevel", { min: 0, fallback: 10 }),
    bin: reqString(body, "bin", { fallback: "A-01", max: 16 }),
    supplier: reqString(body, "supplier", { fallback: "—", max: 80 }),
    active: reqBool(body, "active", true),
  });
  return { row };
});

export const PATCH = PUT;

export const DELETE = withAuth(async (user, _req: Request, ctx: Ctx) => {
  requireRole(user, "owner", "manager");
  const id = await idOf(ctx);
  return await deleteProduct(id);
});
