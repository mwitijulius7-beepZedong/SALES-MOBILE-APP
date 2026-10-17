import { adjustStock } from "@/server/queries";
import { readJson, reqEnum, reqInt, reqString, requireRole, withAuth } from "@/server/http";

export const dynamic = "force-dynamic";

const REASONS = ["receipt", "adjustment", "return", "damage", "count", "requisition"] as const;

export const POST = withAuth(async (user, req: Request) => {
  requireRole(user, "owner", "manager");
  const body = await readJson(req);
  const reasonRaw = reqString(body, "reason", { fallback: "adjustment", max: 24 }).toLowerCase();
  const reason = (REASONS as readonly string[]).includes(reasonRaw) ? reasonRaw : "adjustment";
  const result = await adjustStock({
    productId: reqInt(body, "productId", { required: true, min: 1, max: 1_000_000 }),
    qtyChange: reqInt(body, "qtyChange", { required: true, min: -100_000, max: 100_000 }),
    reason,
    reference: reqString(body, "reference", { max: 40 }),
    note: reqString(body, "note", { max: 240 }),
    actor: { id: user.id, name: user.name },
  });
  return { ...result, mode: reqEnum(body, "mode", ["delta", "set"], "delta") };
});
