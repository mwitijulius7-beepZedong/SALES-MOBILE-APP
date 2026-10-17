import { getReports } from "@/server/queries";
import { withAuth } from "@/server/http";
import { isoDaysAgo, todayISO } from "@/lib/format";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (_user, req: Request) => {
  const url = new URL(req.url);
  const from = url.searchParams.get("from") || isoDaysAgo(29);
  const to = url.searchParams.get("to") || todayISO();
  if (from > to) throw new Error("Start date must come before the end date");
  return await getReports(from, to);
});
