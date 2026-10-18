import { HttpError, readJson, reqBool, reqDate, reqEnum, reqInt, reqString } from "@/server/http";
import { todayISO, usdToCents } from "@/lib/format";

export function expenseFields(body: Record<string, unknown>) {
  return {
    title: reqString(body, "title", { required: true, max: 120 }),
    category: reqString(body, "category", { fallback: "Operations", max: 40 }),
    vendor: reqString(body, "vendor", { fallback: "—", max: 80 }),
    amountCents: reqInt(body, "amountCents", {
      min: 1,
      max: 1_000_000_000,
      fallback: usdToCents(body.amount as string),
    }),
    paymentMethod: reqEnum(body, "paymentMethod", ["cash", "card", "transfer", "credit"], "cash"),
    expenseDate: reqDate(body, "expenseDate", todayISO()),
    billable: reqBool(body, "billable", false),
    note: reqString(body, "note", { max: 240 }),
  };
}

export async function expenseValues(req: Request) {
  return expenseFields(await readJson(req));
}

export function productValues(body: Record<string, unknown>) {
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

export function customerValues(body: Record<string, unknown>) {
  return {
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
  };
}
