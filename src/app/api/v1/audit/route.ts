import { listAudit } from "@/server/admin";
import { pageParams, paged, v1 } from "@/server/v1";
import { requireRole } from "@/server/http";

export const dynamic = "force-dynamic";

export const GET = v1(async (user, req: Request) => {
  requireRole(user, "owner", "manager");
  const url = new URL(req.url);
  const { page, limit, offset } = pageParams(req, { limit: 50, maxLimit: 200 });
  const { rows, hasMore } = await listAudit({
    entity: url.searchParams.get("entity") ?? undefined,
    action: url.searchParams.get("action") ?? undefined,
    limit,
    offset,
  });
  return paged(rows, { page, limit, hasMore });
});
