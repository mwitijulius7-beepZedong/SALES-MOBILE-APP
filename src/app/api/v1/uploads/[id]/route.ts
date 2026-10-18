import { deleteAttachment, getAttachment } from "@/server/admin";
import { reqInt } from "@/server/http";
import { HttpError } from "@/lib/auth";
import { v1 } from "@/server/v1";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

async function idOf(ctx: Ctx) {
  const { id } = await ctx.params;
  return reqInt({ id }, "id", { min: 1, max: 10_000_000, required: true });
}

export const GET = v1(async (_user, _req: Request, ctx: Ctx) => {
  const row = await getAttachment(await idOf(ctx));
  return new Response(new Uint8Array(row.data), {
    headers: {
      "content-type": row.mimeType,
      "content-length": String(row.sizeBytes),
      "content-disposition": `inline; filename="${row.filename.replace(/"/g, "")}"`,
      "cache-control": "private, max-age=300",
    },
  });
});

export const DELETE = v1(async (user, _req: Request, ctx: Ctx) => {
  const id = await idOf(ctx);
  if (user.role !== "owner" && user.role !== "manager") {
    const row = await getAttachment(id);
    if (row.uploadedById !== user.id) {
      throw new HttpError("You can only delete your own uploads", 403);
    }
  }
  return deleteAttachment(id, { id: user.id, name: user.name });
});
