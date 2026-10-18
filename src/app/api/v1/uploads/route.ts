import { createAttachment, listAttachments } from "@/server/admin";
import { readJson, reqInt, reqString } from "@/server/http";
import { HttpError } from "@/lib/auth";
import { v1 } from "@/server/v1";

export const dynamic = "force-dynamic";

export const GET = v1(async (_user, req: Request) => {
  const url = new URL(req.url);
  const entityIdRaw = url.searchParams.get("entityId");
  return listAttachments({
    entity: url.searchParams.get("entity") ?? undefined,
    entityId: entityIdRaw ? reqInt({ entityId: entityIdRaw }, "entityId", { min: 1, required: true }) : undefined,
  });
});

export const POST = v1(async (user, req: Request) => {
  const body = await readJson(req);
  const contentBase64 = body.contentBase64 ?? body.content ?? body.data;
  if (typeof contentBase64 !== "string" || !contentBase64) {
    throw new HttpError("contentBase64 is required (base64-encoded file bytes)");
  }
  return createAttachment(
    {
      filename: reqString(body, "filename", { required: true, max: 120 }),
      mimeType: body.mimeType === undefined ? undefined : reqString(body, "mimeType", { max: 120 }),
      contentBase64,
      entity: body.entity === undefined ? undefined : reqString(body, "entity", { max: 20 }),
      entityId: body.entityId === undefined || body.entityId === null ? null : reqInt(body, "entityId", { min: 1 }),
    },
    { id: user.id, name: user.name },
  );
});
