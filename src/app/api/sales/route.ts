import { createSale, listSales } from "@/server/queries";
import { readJson, reqEnum, reqInt, reqString, withAuth } from "@/server/http";
import { todayISO, usdToCents } from "@/lib/format";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (_user, req: Request) => {
  const url = new URL(req.url);
  const { rows } = await listSales({
    q: url.searchParams.get("q") ?? undefined,
    status: url.searchParams.get("status") ?? undefined,
    range: url.searchParams.get("range") ?? undefined,
    method: url.searchParams.get("method") ?? undefined,
  });
  return { rows };
});

export const POST = withAuth(async (user, req: Request) => {
  const body = await readJson(req);
  const rawLines = Array.isArray(body.lines) ? body.lines : [];
  const lines = rawLines
    .map((line) => {
      const record = (line ?? {}) as Record<string, unknown>;
      return {
        productId: reqInt(record, "productId", { min: 1, max: 1_000_000, required: true }),
        qty: reqInt(record, "qty", { min: 1, max: 10_000, required: true }),
      };
    })
    .filter((line) => line.qty > 0);

  const row = await createSale({
    lines,
    customerId: body.customerId === undefined || body.customerId === null || body.customerId === ""
      ? null
      : reqInt(body, "customerId", { min: 1, max: 1_000_000 }),
    customerName: reqString(body, "customerName", { fallback: "Walk-in", max: 90 }),
    channel: reqEnum(body, "channel", ["Van", "Counter", "Wholesale", "Online"], "Counter"),
    paymentMethod: reqEnum(body, "paymentMethod", ["cash", "card", "transfer", "credit"], "cash"),
    discountCents: reqInt(body, "discountCents", { min: 0, fallback: usdToCents(body.discount as string) }),
    applyTax: body.applyTax === undefined ? true : body.applyTax === true || body.applyTax === "true",
    saleDate: reqString(body, "saleDate", { fallback: todayISO(), max: 10 }),
    status: reqEnum(body, "status", ["completed", "pending"], "completed"),
    note: reqString(body, "note", { max: 240 }),
    actor: { id: user.id, name: user.name },
  });
  return { row };
});
