import { deleteCustomer, upsertCustomer } from "@/server/queries";
import { readJson, reqEnum, reqInt, reqString, withAuth } from "@/server/http";
import { usdToCents } from "@/lib/format";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

async function idOf(ctx: Ctx) {
  const { id } = await ctx.params;
  return reqInt({ id }, "id", { min: 1, max: 1_000_000, required: true });
}

export const PUT = withAuth(async (_user, req: Request, ctx: Ctx) => {
  const id = await idOf(ctx);
  const body = await readJson(req);
  const row = await upsertCustomer(id, {
    name: reqString(body, "name", { required: true, max: 90 }),
    contactName: reqString(body, "contactName", { max: 70 }),
    phone: reqString(body, "phone", { max: 30 }),
    email: reqString(body, "email", { max: 80 }),
    area: reqString(body, "area", { fallback: "—", max: 60 }),
    segment: reqEnum(body, "segment", ["Retail", "Wholesale", "Key Account"], "Retail"),
    creditLimitCents: reqInt(body, "creditLimitCents", {
      min: 0,
      max: 1_000_000_000,
      fallback: usdToCents(body.creditLimit as string),
    }),
  });
  return { row };
});

export const PATCH = PUT;

export const DELETE = withAuth(async (_user, _req: Request, ctx: Ctx) => {
  const id = await idOf(ctx);
  return await deleteCustomer(id);
});
