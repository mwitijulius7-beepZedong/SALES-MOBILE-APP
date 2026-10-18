import { db } from "@/db";
import { requisitions } from "@/db/schema";
import { decideRequisition, deleteRequisition } from "@/server/queries";
import { readJson, reqEnum, reqInt, reqString, requireRole, withAuth } from "@/server/http";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

async function idOf(ctx: Ctx) {
  const { id } = await ctx.params;
  return reqInt({ id }, "id", { min: 1, max: 1_000_000, required: true });
}

export const PATCH = withAuth(async (user, req: Request, ctx: Ctx) => {
  requireRole(user, "owner", "manager");
  const id = await idOf(ctx);
  const body = await readJson(req);
  const status = reqEnum(body, "status", ["pending", "approved", "rejected", "received"], "approved");
  const note = reqString(body, "note", { max: 240 });
  const row = await decideRequisition(id, status, note, { id: user.id, name: user.name });
  return { row };
});

export const PUT = withAuth(async (_user, req: Request, ctx: Ctx) => {
  const id = await idOf(ctx);
  const body = await readJson(req);
  const [row] = await db
    .update(requisitions)
    .set({
      requestedQty: reqInt(body, "requestedQty", { min: 1, max: 100_000, required: true }),
      priority: reqEnum(body, "priority", ["low", "normal", "high", "urgent"], "normal"),
      department: reqString(body, "department", { fallback: "Field Sales", max: 60 }),
      requester: reqString(body, "requester", { fallback: "", max: 60 }),
      notes: reqString(body, "notes", { max: 240 }),
    })
    .where(eq(requisitions.id, id))
    .returning();
  return { row };
});

export const DELETE = withAuth(async (user, _req: Request, ctx: Ctx) => {
  requireRole(user, "owner", "manager");
  const id = await idOf(ctx);
  return await deleteRequisition(id);
});
