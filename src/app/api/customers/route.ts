import { listCustomers, upsertCustomer } from "@/server/queries";
import { readJson, reqEnum, reqInt, reqString, withAuth } from "@/server/http";
import { usdToCents } from "@/lib/format";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (_user, req: Request) => {
  const url = new URL(req.url);
  return { rows: await listCustomers(url.searchParams.get("q") ?? undefined) };
});

export const POST = withAuth(async (_user, req: Request) => {
  const body = await readJson(req);
  const row = await upsertCustomer(null, {
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
    balanceCents: 0,
  });
  return { row };
});
