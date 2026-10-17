import { readJson, reqBool, reqDate, reqEnum, reqInt, reqString } from "@/server/http";
import { todayISO, usdToCents } from "@/lib/format";

export async function expenseValues(req: Request) {
  const body = await readJson(req);
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
